import UserAgent from 'user-agents';
import { chromium } from 'playwright-extra';

import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());
async function runJob(job, jobId, url, pincode) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-infobars',
      '--mute-audio',
      '--disable-background-networking',
    ]
  });

  // Apply stealth plugin

  const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 720 },
    bypassCSP: true
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

    // Spoof WebRTC
    Object.defineProperty(navigator, 'connection', {
      get: () => ({ effectiveType: '4g' })
    });
  });
  const page = await context.newPage();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await context.addInitScript(() => {
    Intl.DateTimeFormat = class extends Intl.DateTimeFormat {
      constructor(locale, options) {
        super('en-US', options);
      }
    };
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
      value: () => ({ timeZone: 'America/New_York' })
    });
  });
  try {
    page.setDefaultTimeout(60000 * 3);
    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    let headers = {};
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector("div[class*='ProductsContainer'] a");
    // Handle location input (Pincode)
    await page.waitForSelector("div[class*='LocationBar__SubtitleContainer']");
    const pincodeButton = page
      .locator("div[class*='LocationBar__SubtitleContainer']")
      .first()
      .dispatchEvent('click');
    await page.waitForSelector("input[name*='select-locality']");
    let pincodeInput = page.locator("input[name*='select-locality']").first();
    await pincodeInput.pressSequentially(pincode, { delay: 1000 });
    await pincodeInput.press('Enter');

    await page.waitForSelector(
      'div.address-container-v1 div[class*="LocationDetailContainer"]'
    );
    const pinCode = page
      .locator(
        `div.address-container-v1 div[class*="LocationDetailContainer"]:has-text("${pincode}")`
      )
      .first();
    await page.route(/\/v2\/listing\?.*/, (route) => {
      if (Object.keys(headers).length === 0) {
        headers = route.request().headers();
        console.log(`got headers from listing tracker`);
        route.continue(); // Allow the request to proceed
      } else {
        route.continue(); // Allow the request to proceed
      }
    });
    function cleanProductTitle(title) {
      return title
        .replace(/[()]/g, '') // Remove parentheses but keep their content
        .replace(/\d+\.?\d*\s*(kg|g|l|ml)\b/gi, '') // Remove weight/volume measurements (e.g., 10kg, 500g, 1.5l, 250ml)
        .replace(/-/g, ' ') // Replace hyphens with spaces (optional adjustment)
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces to one
        .trim(); // Remove leading/trailing spaces
    }
    await pinCode.dispatchEvent('click');
    // go to the main subcategory to get all of them one by one
    let filename;
    try {
      let categorySegment = page.url().split('.com')[1];
      const categoryNameElement = page
        .locator(`a[href*="${categorySegment}"]`)
        .first();

      // Ensure the element exists before accessing its text content
      if ((await categoryNameElement.count()) > 0) {
        const categoryName = (await categoryNameElement.textContent())
          .trim() // Trim whitespace
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/[&]/g, 'and') // Replace '&' with 'and'
          .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
          .toLowerCase(); // Convert to lowercase
        console.log('Category Name:', categoryName);

        // Update the filename with the correct category name
        filename = `Blinkit-${pincode}-${categoryName}-products`;
        console.log('Generated Filename:', filename);
      } else {
        console.error('Category name element not found.');
        throw new Error('Category name element not found.');
      }
    } catch (e) {
      console.error('Error generating filename:', e.message);

      // Extract the default value between /cid/ and /cn/
      const defaultSegment = url.match(/\/cid\/(.*?)\/cn\//);
      if (defaultSegment && defaultSegment[1]) {
        filename = `Blinkit-${pincode}-${defaultSegment[1]}-products`;
        console.log('Using default filename:', filename);
      } else {
        console.error('Unable to extract default segment from URL.');
        filename = `Blinkit-${pincode}-unknown-products`; // Fallback if extraction fails
        console.log('Using fallback filename:', filename);
      }
    }
    // await page.click('.category-list a:last-child');
    // Use the filename variable outside the try-catch block
    console.log('Final Filename:', filename);
    job.attrs.data.progress = 5;
    await job.save();
    const allProducts = [];
    let defaultUrl =
      'https://blinkit.com/v1/listing/widgets?page=0&l0_cat=1487&l1_cat=742';
    // go through each subcategory and get its data
    const productMap = {};
    let requestUrl = '';

    await page.route(/\/v1\/listing\/widgets\?.*/, (route) => {
      if (requestUrl === '') {
        requestUrl = route.request().url(); // Capture the URL
        console.log(requestUrl); // Log the URL
        if (Object.keys(headers).length === 0) {
          headers = route.request().headers();
          console.log('got headers from widgets tracker');
        }
        // log request headers
        route.continue(); // Allow the request to proceed
      } else {
        route.continue(); // Allow the request to proceed
      }
    });

    async function findTotalPages(url) {
      console.log(`Finding total pages for URL: ${url}`);
      let start = 0; // First page
      let end = 1000; // Assume an initial maximum page count
      let totalPages = 0;

      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const newUrl = url.replace(/page=\d+/, `page=${mid}`);
        console.log(`Checking page ${mid} - URL: ${newUrl}`);

        try {
          const res = await page.evaluate(
            async (obj) => {
              try {
                const response = await fetch(obj.url, {
                  headers: obj.headers
                });
                const body = await response.json();
                return {
                  status: response.status,
                  nextUrl: body.pagination.next_url || ''
                };
              } catch (error) {
                console.error('Error during fetch in evaluate:', error);
                return { status: 500, nextUrl: null };
              }
            },
            { url: newUrl, headers }
          );

          if (res.status === 200) {
            const nextPageMatch = res.nextUrl.match(/page=(\d+)/);
            const nextPage = nextPageMatch
              ? parseInt(nextPageMatch[1], 10)
              : 0;
            console.log(`Next page number: ${nextPage}`);
            if (nextPage && nextPage < mid) {
              // If next page number is lower than mid, we've found the last page
              console.log(`Found the last page: ${nextPage}`);
              totalPages = nextPage;
              break;
            } else if (nextPage && nextPage >= mid) {
              // If next page number is higher or equal, search the upper half
              start = mid + 1;
            } else {
              // If no next URL is present, this could be the last page
              totalPages = mid;
              break;
            }
          } else {
            throw new Error(
              `Failed to fetch page ${mid}, status: ${res.status}`
            );
          }
        } catch (error) {
          console.error(`Error fetching page ${mid}:`, error.message);
          end = mid - 1; // Adjust the search range and continue
        }
      }

      return totalPages;
    }

    const products = [];
    if (requestUrl) {
      // change page to be 0
      requestUrl = requestUrl.replace(/page=\d+/, 'page=0');
    } else {
      const url = page.url();
      const urlParts = url.split('/').filter(Boolean); // Removes empty strings from trailing slashes
      const l0 = urlParts[urlParts.length - 2];
      const l1 = urlParts[urlParts.length - 1];
      requestUrl = defaultUrl.replace('l0_cat=1487', `l0_cat=${l0}`);
      requestUrl = requestUrl.replace('l1_cat=742', `l1_cat=${l1}`);
      requestUrl = requestUrl.replace(/page=\d+/, 'page=0');
      console.log(`fallback URL: ${requestUrl}`);
      console.log(`Current page url ${page.url()}`);
    }
    const totalPages = await findTotalPages(requestUrl);
    let totalScrapped = 0;
    for (let i = 1; i <= totalPages; i++) {
      let res = await page.evaluate(
        async (obj) => {
          console.log('inside evaluate');
          const response = await fetch(obj.url, {
            headers: obj.headers
          });
          body = await response.json();
          products = body['objects'];
          nextUrl = body['pagination']['next_url'];
          return {
            status: response.status,
            products: products,
            nextUrl: nextUrl
          };
        },
        {
          url: requestUrl,
          headers: headers
        }
      );
      const status = res.status;
      if (status === 200) {
        products.push(...res.products);
        totalScrapped = products.length;
        // log products length
        console.log(`Products Length: ${totalScrapped}`);
        //
        const nextUrl = res.nextUrl;
        job.attrs.data.total_products = allProducts.length;
        job.attrs.data.progress = Math.floor((i / totalPages) * 100);
        await job.save();
        console.log(`Next URL: ${nextUrl}`);
        if (nextUrl) {
          requestUrl = nextUrl;
        } else {
          break;
        }
        new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    // based on the above json, transform to the descired schema like the one in scrapeBigBasked.js

    for (const product of products) {
      try {
        // const mainInventory =
        //   product?.tracking?.widget_meta?.custom_data?.inventory ??
        //   product?.data?.product?.inventory;

        let productName = product?.tracking?.widget_meta?.title || '';
        productName = cleanProductTitle(productName);
        let imageUrl = '';

        const variants = [];
        const objects = product?.objects || [];
        for (const variant of objects) {
          // const variantInventory =
          //   variant?.tracking?.widget_meta?.custom_data?.inventory ??
          //   variant?.data?.product?.inventory;
          if (!imageUrl) {
            imageUrl = cleanImageURL(variant.data.product.images[0]);
          }

          // if (variantInventory !== 0) {
          variants.push({
            quantity: variant?.data?.product?.unit || '',
            mrp: variant?.data?.product?.mrp || 0,
            price: variant?.data?.product?.price || 0,
            articleId: variant?.data?.product?.product_id || null,
            variantUrl: `https://blinkit.com${getProductLink(product)}`
          });
          // }
        }

        if (!variants.length) {
          continue; // Skip product if no valid variants and main product inventory is 0
        }

        if (!productMap[productName]) {
          productMap[productName] = {
            title: product?.tracking?.widget_meta?.title || '',
            brand: product?.data?.product?.brand || '',
            variant: variants.length
              ? variants
              : [
                {
                  quantity: product?.data?.product?.unit || '',
                  mrp: product?.data?.product?.mrp || 0,
                  price: product?.data?.product?.price || 0,
                  articleId: String(product?.data?.product?.product_id),
                  variantUrl: `https://blinkit.com${getProductLink(
                    product
                  )}`
                }
              ],
            imageUrl: imageUrl,
            url: `https://blinkit.com${getProductLink(product)}`,
            pincode: Number(pincode) || null
          };
        } else {
          console.log('Product already exists:', productName);
          variants.forEach((variant) => {
            const existingVariant = productMap[productName].variant.find(
              (v) => v.articleId === variant.articleId
            );
            if (!existingVariant) {
              productMap[productName].variant.push(variant);
            }
          });
        }
      } catch (error) {
        console.error('Error processing product:', product, error.message);
      }
    }
    allProducts.push(...Object.values(productMap));

    job.attrs.data.total_products = allProducts.length;
    job.attrs.data.progress = 100;
    await job.save();
    return [allProducts, filename];
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    await page.screenshot({ path: 'screenshot.png' });
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

function cleanImageURL(url) {
  // Step 1: Replace escaped slashes
  const cleaned = url.replace(/\\\//g, '/');

  // Step 2: Remove query parameters (everything after "?")
  return cleaned.split('?')[0];
}
export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}
// await runJob(
//   null,
//   null,
//   'https://blinkit.com/cn/fresh-vegetables/cid/1487/1489',
//   '500085'
// );
function getProductLink(product) {
  if (
    !product ||
    !product.tracking ||
    !product.tracking.widget_meta ||
    !product.tracking.widget_meta.id ||
    !product.tracking.widget_meta.title
  ) {
    throw new Error(
      "Product object must contain 'tracking.widget_meta.id' and 'tracking.widget_meta.title' properties."
    );
  }

  const formatName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-.]/g, '')
      .replace(/(-|\s)+/g, '-');
  };

  const constructUrl = (parts) => {
    return parts
      .filter((part) => !!part)
      .map((part) => String(part).replace(/\/$/, ''))
      .join('/');
  };

  const formattedName = formatName(product.tracking.widget_meta.title);

  const url = constructUrl([
    '/prn',
    formattedName,
    'prid',
    product.tracking.widget_meta.id
  ]);

  return url;
}