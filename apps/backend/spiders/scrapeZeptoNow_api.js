import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: process.env.SPIDERS_HEADLESS_MODE === 'true'
  });

  try {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });

    const randomUserAgent = userAgent.toString();
    const context = await browser.newContext({
      userAgent: randomUserAgent
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(url);
    await page.waitForSelector("div a[data-testid='product-card']");
    // Handle location input (Pincode)
    await page.waitForSelector('button[aria-label="Select Location"]');
    const pincodeButton = page
      .locator('button[aria-label="Select Location"]')
      .first()
      .dispatchEvent('click');
    await page.waitForSelector('input[placeholder="Search a new address"]', {
      timeout: 3 * 60000
    });
    let pincodeInput = page
      .locator('input[placeholder="Search a new address"]')
      .first();

    pincodeInput.fill(pincode);
    await page.waitForSelector('div[data-testid="address-search-item"]', {
      timeout: 3 * 60000
    });
    const pinCode = page
      .locator(`div[data-testid="address-search-item"]:has-text("${pincode}")`)
      .first();
      
      
      await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
      const storeProducts = [];
      const requests = [];
      
      // Set up request interception
      page.on('request', (request) => {
        if (request.url().includes('store-products-by-store-subcategory-id')) {
          requests.push(request);
          console.log(`Request URL logged: ${request.url()}`);
        }
      });
      
      // Click the pin code element
      try {
        await pinCode.dispatchEvent('click');
        await page.click('button[data-testid="location-confirm-btn"]');
    } catch (error) {
      console.error('Failed to click pin code:', error);
      throw error; // Or handle it differently
    }

    // Scroll and load all products
    try {
      await page.evaluate(async () => {
        const selector = 'div:has( > a[data-testid="product-card"])';
        const list = document.querySelector(selector);
        if (!list) {
          throw new Error('Product list container not found');
        }

        let previousCount = list.querySelectorAll('a[data-testid="product-card"]').length;
        let unchangedCount = 0;
        const maxUnchanged = 3; // Stop after 3 scrolls with no new items

        while (unchangedCount < maxUnchanged) {
          window.scrollBy(0, list.scrollHeight);
          await new Promise(resolve => setTimeout(resolve, 10000));

          const currentCount = document.querySelectorAll('a[data-testid="product-card"]').length;

          if (currentCount > previousCount) {
            console.log(`Element count increased: ${previousCount} -> ${currentCount}`);
            previousCount = currentCount;
            unchangedCount = 0;
          } else {
            unchangedCount++;
            console.log(`No new elements (attempt ${unchangedCount}/${maxUnchanged})`);
          }
        }
        console.log('Scroll complete');
      });
    } catch (error) {
      console.error('Error during scrolling:', error);
    }

    // Process all captured requests
    if (requests.length === 0) {
      console.warn('No product requests were captured');
    } else {
      console.log(`Processing ${requests.length} requests...`);

      for (const request of requests) {
        try {
          const response = await request.response();
          if (!response) {
            console.warn('No response for request:', request.url());
            continue;
          }

          if (response.ok()) {
            const data = await response.json();
            if (data && data.products) {
              storeProducts.push(...data.products);
              console.log(`Added ${data.products.length} products from ${request.url()}`);
            } else {
              console.warn('Unexpected response format from:', request.url());
            }
          } else {
            console.warn(`Request failed with status ${response.status()} for URL: ${request.url()}`);
          }
        } catch (error) {
          console.error(`Error processing request ${request.url()}:`, error);
        }
      }
    }

    console.log(`Total products collected: ${storeProducts.length}`);

    await page.waitForSelector("div a[data-testid='product-card']");
    const breadcrumbs = await page
      .locator('div:has( > script[id="breadcrumbSchema"])  > span')
      .all();

    // Get the last breadcrumb text
    let categoryName = '';
    if (breadcrumbs.length > 2) {
      categoryName = (await breadcrumbs[breadcrumbs.length - 2].textContent())
        .trim()
        .toLowerCase();
    } else {
      categoryName = breadcrumbs[breadcrumbs.length - 1]
        .trim()
        .toLowerCase();
    }
    // Format the category name
    categoryName = categoryName
      .replace(',', ' ')
      .replace(' ', '-')
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[&]/g, 'and') // Replace '&' with 'and'
      .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
      .toLowerCase();

    console.log(categoryName);

    const filename = `ZeptoNow-${pincode}-${categoryName}-products`;
    console.log(filename);

    job.attrs.data.progress = 5;
    await job.save();
    const allProducts = [];
    const productMap = {};
    const titleIdMap = {};
    await job.save();
    const products = storeProducts;
    const sanitizeForUrl = function (str) {
      let separator =
        arguments.length > 1 && arguments[1] !== undefined
          ? arguments[1]
          : '-';
      return typeof str !== 'string'
        ? ''
        : str
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, separator)
          .replace(/^-+|-+$/g, '');
    };

    const generateProductUrl = ({ productName, productVariantId }) => {
      const sanitizedProductName = sanitizeForUrl(productName);
      const sanitizedProductVariantId = sanitizeForUrl(productVariantId);
      return `/pn/${sanitizedProductName}/pvid/${sanitizedProductVariantId}`;
    };
    // map from product-id to product data and when u see the same id again just go append an additional variant in the one you already have

    const transformedProducts = products || [];
    console.log(`Total Products: ${transformedProducts.length}`);
    for (let i = 0; i < transformedProducts.length; i++) {
      const product = transformedProducts[i];
      const productId = product.product.id; // Unique product ID
      const variantId = product.productVariant.id; // Unique variant ID
      let productName = product.product.name || '';
      let normalizedName = productName
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const BASE_IMAGE_URL = 'https://cdn.zeptonow.com/';
      const imageUrl = product['productVariant']['images'][0]
        ? BASE_IMAGE_URL + product['productVariant']['images'][0]['path']
        : '';
      let quantity = product.productVariant.formattedPacksize;
      try {
        if (quantity?.trim() === '') {
          const weight = product.productVariant.weightInGms;
          const unit = product.productVariant.unitOfMeasure;
          if (unit === 'KILOGRAM') {
            quantity = `${weight / 1000} kg`;
          } else if (unit === 'GRAM') {
            quantity = `${weight} g`;
          } else if (unit === 'LITER') {
            quantity = `${weight / 1000} L`;
          } else if (unit === 'MILLILITRE') {
            quantity = `${weight} ml`;
          } else {
            quantity = `${weight} ${unit}`;
          }
        }
      } catch (error) {
        continue;
      }

      if (productMap[productId]) {
        // Check if the variant already exists
        const variantExists = productMap[productId].variant.some(
          (v) => v.articleId === variantId
        );

        if (!variantExists) {
          // Add the new variant
          productMap[productId].variant.push({
            articleId: variantId,
            quantity: quantity,
            mrp: product.productVariant.mrp / 100,
            price: product.discountedSellingPrice / 100,
            variantUrl: `https://www.zeptonow.com${generateProductUrl({
              productName: product.product.name,
              productVariantId: product.productVariant.id
            })}`
          });
        }
      } else {
        const isBundleItems = product.bundleItems.length;
        if (isBundleItems) {
          productName = product.bundleItems[0].name
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          if (titleIdMap[productName]) {
            const variantExists = productMap[
              titleIdMap[productName]
            ].variant.some((v) => v.articleId === variantId);
            if (!variantExists) {
              // Add the new variant
              productMap[titleIdMap[productName]].variant.push({
                articleId: variantId,
                quantity: quantity,

                mrp: product.productVariant.mrp / 100,
                price: product.discountedSellingPrice / 100,
                variantUrl: `https://www.zeptonow.com${generateProductUrl({
                  productName: product.product.name,
                  productVariantId: product.productVariant.id
                })}`
              });
            }
          } else {
            titleIdMap[productName] = productId;
            productMap[productId] = {
              title: productName,
              brand: product.product.brand
                ? product.product.brand.toLowerCase() !== 'unbranded' &&
                  product.product.brand.toLowerCase() !== ''
                  ? product.product.brand
                  : ''
                : '',
              variant: [
                {
                  articleId: variantId, // Use variantId, not product.id
                  quantity: quantity, // Consistent format
                  mrp: product.productVariant.mrp / 100,
                  price: product.discountedSellingPrice / 100,
                  variantUrl: `https://www.zeptonow.com${generateProductUrl({
                    productName: product.product.name,
                    productVariantId: product.productVariant.id
                  })}`
                }
              ],
              imageUrl: imageUrl,
              url: `https://www.zeptonow.com${generateProductUrl({
                productName: product.product.name,
                productVariantId: product.productVariant.id
              })}`,
              pincode: Number(pincode)
            };
          }
        } else {
          // Create a new product entry
          productMap[productId] = {
            title: product.product.name,
            brand: product.product.brand
              ? product.product.brand.toLowerCase() !== 'unbranded' &&
                product.product.brand.toLowerCase() !== ''
                ? product.product.brand
                : ''
              : '',
            variant: [
              {
                articleId: variantId, // Use variantId, not product.id
                quantity: quantity, // Consistent format
                mrp: product.productVariant.mrp / 100,
                price: product.discountedSellingPrice / 100,
                variantUrl: `https://www.zeptonow.com${generateProductUrl({
                  productName: product.product.name,
                  productVariantId: product.productVariant.id
                })}`
              }
            ],
            imageUrl: imageUrl,
            url: `https://www.zeptonow.com${generateProductUrl({
              productName: product.product.name,
              productVariantId: product.productVariant.id
            })}`,
            pincode: Number(pincode)
          };
          titleIdMap[normalizedName] = productId;
        }
      }
      // job.attrs.data.total_products = productMap.size;
      // job.attrs.data.progress =
      //   15 + Math.ceil(((idx + 1) * 85) / transformedProducts.length);
      // await job.save();
    }
    // } else {
    //   console.log('failed to send the request, check the url');
    // }
    // }
    allProducts.push(...Object.values(productMap));
    job.attrs.data.progress = 100;
    job.attrs.data.total_products = allProducts.length;
    await job.save();
    return [allProducts, filename];
    // await page.waitForSelector("section ul li[class*='PaginateItems']");
  } catch (error) {
    console.error(`Job ${jobId} failed with error: ${error.message}`);
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  page,
  url,
  headers,
  retries = 5,
  currentBackoff = 1000,
  attempt = 1
) => {
  try {
    const userAgent = new UserAgent();
    const randomUserAgent = userAgent.toString();

    const response = await page.request.get(url, {
      headers: {
        ...headers,
        'User-Agent': randomUserAgent // Use the random user agent
      }
    });

    if (response.status() !== 200) {
      console.error(`Request failed with status ${response.status()}`);
      if (response.status() === 403 || response.status() === 429) {
        throw new Error(`Retryable error: ${response.status()}`);
      } else {
        throw new Error(`Non-retryable error: ${response.status()}`);
      }
    }
    return response; // Success: reset backoff
  } catch (error) {
    console.error(
      `Failed to fetch data (Attempt ${attempt}): ${error.message}`
    );
    if (retries === 0 || !error.message.includes('Retryable error')) {
      throw new Error('Failed to fetch data');
    }
    console.log(`Retrying in ${currentBackoff}ms...`);
    await delay(currentBackoff);
    return fetchWithRetry(
      page,
      url,
      headers,
      retries - 1,
      currentBackoff * 2,
      attempt + 1
    ); // Exponential backoff
  }
};
