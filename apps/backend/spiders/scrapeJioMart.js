import { chromium } from 'playwright';
import UserAgent from 'user-agents';

// Configuration constants
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const SCROLL_TIMEOUT = 1000; // 1 second
const MAX_RETRIES = 3;
const CONCURRENT_PRODUCT_LIMIT = 20; // Number of products to process concurrently

async function runJob(job, jobId, url, pincode) {
  console.log(`Starting scrape job for ${url} with pincode ${pincode}`);
  const browser = await chromium.launch({
    headless: process.env.SPIDERS_HEADLESS_MODE === 'true' // Run headless for better performance
  });
  const userAgent = new UserAgent({ deviceCategory: 'desktop' });
  const randomUserAgent = userAgent.toString();
  const context = await browser.newContext({
    userAgent: randomUserAgent,
    viewport: { width: 1280, height: 720 },
    bypassCSP: true
  });
  const page = await context.newPage();

  const startTime = performance.now();
  let products = [];
  let fileName = '';
  try {
    // Create browser context with optimized settings

    // Block unnecessary resources to improve performance
    await context.route(
      /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|otf|css)$/i,
      (route) => route.abort()
    );
    await context.route(/\/(analytics|tracking|advertisement|ad)\//i, (route) =>
      route.abort()
    );

    page.setDefaultTimeout(DEFAULT_TIMEOUT);

    // Navigate to the target URL with retry logic
    let navigationSuccess = false;
    for (
      let attempt = 0;
      attempt < MAX_RETRIES && !navigationSuccess;
      attempt++
    ) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_TIMEOUT
        });
        navigationSuccess = true;
      } catch (error) {
        console.log(
          `Navigation attempt ${attempt + 1} failed: ${error.message}`
        );
        if (attempt === MAX_RETRIES - 1) throw error;
        await page.waitForTimeout(2000); // Wait before retry
      }
    }

    // Extract category name for filename
    const categoryElement = await page
      .waitForSelector('ul.jm-breadcrumbs-list > li:last-child', {
        timeout: DEFAULT_TIMEOUT
      })
      .catch(() => null);

    let categoryName = 'grocery-category';
    if (categoryElement) {
      categoryName = (await categoryElement.innerText())
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[&]/g, 'and')
        .replace(/[^a-zA-Z0-9-_]/g, '')
        .toLowerCase();
    }

    fileName = `JioMart-${pincode}-${categoryName}-products`;
    job.attrs.data.progress = 5;
    await job.save();
    // Handle pincode entry with retry
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await handlePincodeEntry(page, pincode);
        break;
      } catch (error) {
        console.log(
          `Pincode entry attempt ${attempt + 1} failed: ${error.message}`
        );
        if (attempt === MAX_RETRIES - 1) throw error;
        // await page.reload({ waitUntil: 'domcontentloaded' });
        // await page.waitForTimeout(2000);
      }
    }
    await page.waitForSelector('.ais-InfiniteHits-list', {
      timeout: 30000
    });
    const allProducts = await loadAllProducts(page, pincode, job);
    products = [...products, ...allProducts];
    job.attrs.data.progress = 100;
    job.attrs.data.total_products = products.length;
    await job.save();
    console.log(`Total products collected: ${products.length}`);
    return [products, fileName];
  } catch (error) {
    console.error(`Job  with ID : ${jobId}failed with error: ${error.message}`);
    // Return any products collected so far
    await page.screenshot({ path: 'screenshot.png' });
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`Job completed in ${duration.toFixed(2)} seconds`);
  }
}

async function handlePincodeEntry(page, pincode) {
  try {
    await page.waitForSelector('#btn_pin_code_delivery');
    await page.click('#btn_pin_code_delivery');

    await page.waitForSelector('#btn_enter_pincode');
    await page.click('#btn_enter_pincode');

    await page.waitForSelector('#rel_pincode');
    await page.fill('#rel_pincode', pincode);

    await page.click('#btn_pincode_submit');

    await page.waitForSelector('.ais-InfiniteHits-list');
  } catch (error) {
    throw new Error(`Pincode error: ${error.message}`);
  }
}

async function loadAllProducts(page, pincode, job = null) {
  console.log('Loading all products...');
  let prevCount = 0;
  let currentCount = 0;
  let scrollAttempts = 0;
  const MAX_SCROLL_ATTEMPTS = 5; // Stop clicking if no new items after 5 attempts

  try {
    do {
      prevCount = currentCount;

      // Get current product count
      currentCount = await page.locator('.ais-InfiniteHits-list li').count();
      console.log(`Current product count: ${currentCount}`);

      // Check if the "Load More" button is disabled
      const isDisabled = await page
        .locator('.ais-InfiniteHits-loadMore--disabled')
        .count();

      if (isDisabled > 0) {
        console.log('No more products to load.');
        break;
      }

      // Click "Load More" button
      // await page.locator('.ais-InfiniteHits-list li:last-child').scrollIntoViewIfNeeded();
      // await page.locator('.ais-InfiniteHits-loadMore').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        document
          .querySelector('.ais-InfiniteHits-loadMore')
          .scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.querySelector('.ais-InfiniteHits-loadMore').click();
      });
      // Wait for potential new content to load
      await page.waitForTimeout(4000);
      // Check if new products were loaded
      if (prevCount === currentCount) {
        scrollAttempts++;
        if (scrollAttempts >= MAX_SCROLL_ATTEMPTS) {
          console.log(
            'No new products after multiple attempts, assuming all products loaded'
          );
          break;
        }
      } else {
        scrollAttempts = 0; // Reset counter if new products are loaded
      }
    } while (scrollAttempts < MAX_SCROLL_ATTEMPTS);
    if (job) {
      job.attrs.data.progress = 30;
      await job.save();
    }
    // Extract product data
    return await extractProductsData(page, pincode, job);
  } catch (error) {
    console.error(`Error loading products: ${error.message}`);
    return [];
  }
}
async function extractVariantData(variantElement) {
  const tx = await variantElement.innerText();
  if (tx.toLowerCase().includes('out of stock')) {
    return null;
  }
  let priceElement = variantElement.locator(
    '.jm-list-content > div  >  span.jm-body-xs'
  );
  let price = '';
  if ((await priceElement.count()) > 0) {
    // replace any non digit character with empty string except
    priceElement = await priceElement.innerText();
    if (priceElement) {
      price = priceElement.replace(/[^\d.]/g, '');
    }
  }
  let mrpElement = variantElement.locator(
    '.jm-list-content > div  >  span.jm-body-xxs'
  );
  let mrp = '';
  if ((await mrpElement.count()) > 0) {
    mrpElement = await mrpElement.innerText();
    if (mrpElement) {
      mrp = mrpElement.replace(/[^\d.]/g, '');
    }
  } else {
    mrp = price;
  }
  let quantityElement = variantElement.locator('.jm-list-content p');
  let quantity = '';
  if ((await quantityElement.count()) > 0) {
    quantityElement = await quantityElement.innerText();
    if (quantityElement) {
      quantity = quantityElement;
    }
  }

  let variantUrlElement = variantElement.locator('a');
  let variantUrl = '';
  if ((await variantUrlElement.count()) > 0) {
    variantUrl = await variantUrlElement.getAttribute('href');
    if (variantUrl) {
      variantUrl = `https://www.jiomart.com${variantUrl}`;
    }
  }
  // href="/p/groceries/pringles-sour-cream-and-onion-potato-chips-134-g/593619068"
  // put the article code as the last code of the link
  const articleId = variantUrl.split('/').pop();
  return {
    articleId: articleId ? Number(articleId) : null,
    quantity: quantity,
    price: Number(price),
    mrp: Number(mrp),
    variantUrl
  };
}
async function extractProductsData(page, pincode, job = null) {
  const products = [];
  console.log('Extracting products data...');

  const productElements = await page
    .locator('.ais-InfiniteHits-list li:not([style*="display: none"])')
    .all();

  console.log(`Found ${productElements.length} product elements`);

  // Process one by one
  for (let i = 0; i < productElements.length; i++) {
    console.log(`Processing product ${i + 1}/${productElements.length}`);

    const productLocator = page
      .locator('.ais-InfiniteHits-list li:not([style*="display: none"]):has(a)')
      .nth(i);

    try {
      const product = await extractSingleProduct(page, productLocator, pincode);
      if (product) products.push(product);
    } catch (error) {
      console.error(`Error extracting product at index ${i}:`, error);
      continue;
    }

    if (i % 50 === 0 && job) {
      job.attrs.data.progress = 30 + (i / productElements.length) * 70;
      job.attrs.data.total_products = products.length;
      await job.touch();
      await job.save();
    }
  }

  console.log(`Extraction complete. Extracted ${products.length} products.`);
  return products;
}

async function extractSingleProduct(page, productLocator, pincode) {
  try {
    // Extract title
    const titleLocator = productLocator.locator('.plp-card-details-name');
    if ((await titleLocator.count()) === 0) {
      console.log('Title element not found, skipping product');
      return null;
    }

    const title = await titleLocator.innerText();

    // Extract price
    const priceLocator = productLocator.locator(
      '.plp-card-details-price span:first-child'
    );
    let price = '';
    if ((await priceLocator.count()) > 0) {
      price = await priceLocator.innerText();
      price = price.replace(/[^\d.]/g, '');
    }

    // Extract MRP
    const mrpLocator = productLocator.locator(
      '.plp-card-details-price span:last-child'
    );
    let mrp = '';
    if ((await mrpLocator.count()) > 0) {
      mrp = await mrpLocator.innerText();
      mrp = mrp.replace(/[^\d.]/g, '');
    } else {
      mrp = price;
    }

    // Extract brand and product code
    const brandLocator = productLocator.locator('div.gtmEvents');
    let brand = '';
    let productCode = null;

    if ((await brandLocator.count()) > 0) {
      brand = (await brandLocator.getAttribute('data-manu')) || '';
      productCode = (await brandLocator.getAttribute('data-id')) || '';
    }

    // Extract image URL
    const imageLocator = productLocator.locator('> a > div.plp-card-container');
    let imageUrl = '';
    if ((await imageLocator.count()) > 0) {
      const lastPart = await imageLocator.getAttribute('data-image');
      if (lastPart) {
        imageUrl = `https://www.jiomart.com/images/product/original/${lastPart}`;
      }
    }

    // Extract product URL
    const linkLocator = productLocator.locator('> a');
    let productUrl = '';
    if ((await linkLocator.count()) > 0) {
      const href = (await linkLocator.getAttribute('href')) || '';
      productUrl = `https://www.jiomart.com${href}`;
    }

    // Create original variant
    const variants = [];
    const originalVariant = {
      articleId: productCode ? Number(productCode) : null,
      quantity: extractQuantity(title),
      mrp: Number(mrp),
      price: Number(price),
      variantUrl: productUrl
    };
    // get rest of the variants
    const variantButton = productLocator.locator('div[data-variants-sku]');
    if (await variantButton.isVisible()) {
      try {
        await variantButton.click();
        await page.waitForTimeout(2000);
        await page.waitForFunction(
          () => {
            const el = document.querySelector('#variants_dialog_content');
            return el && el.innerText.trim() !== 'Loading..';
          },
          { timeout: 60000 }
        );

        const variantElements = await page
          .locator('#variants_dialog_content li')
          .all();
        for (const variantElement of variantElements) {
          const variant = await extractVariantData(variantElement);
          if (variant) {
            variants.push(variant);
          }
        }
        await page.click('#btn_variants_close');

        await page.waitForTimeout(500);
      } catch (error) {
        await page.evaluate(() =>
          document.querySelector('.jm-panel-backdrop').click()
        );
        console.log(
          `failed to get variants for product with title ${title}  and error is -> ${error}`
        );
      }
    }
    if (variants.length === 0) {
      variants.push(originalVariant);
    }
    // Return the product object
    return {
      title,
      brand,
      variants: variants, // Simplified to just use the original variant
      url: productUrl,
      imageUrl,
      pinCode: Number(pincode)
    };
  } catch (error) {
    console.error(`Error extracting product data: ${error.message}`);
    return null;
  }
}

export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}
function extractQuantity(title) {
  const quantityPattern =
    /\b(\d*\.?\d*\s?(?:g|kg|ml|l|pcs|pack|dozen|count|bags|bottle|tin|cans|sachet|strip|tablet|capsule|bar|bundle|roll|pair|set|box|carton|tray|cup|stick|piece|pouch))\b/i;
  const match = title.match(quantityPattern);
  return match ? match[0] : '';
}
