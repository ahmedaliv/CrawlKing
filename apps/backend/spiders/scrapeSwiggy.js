import { chromium } from 'playwright-extra';

import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const browser = await chromium.launch({
    headless: process.env.SPIDERS_HEADLESS_MODE === 'true',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-extensions',
      '--disable-infobars',
      '--mute-audio',
      '--disable-background-networking'
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
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
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
    await page.goto('https://www.swiggy.com/');
    // set the pincode in the base website then we go to the one to be scrapped
    await page.waitForSelector('input[id="location"]');
    await page.fill('input[id="location"]', pincode);
    await page.waitForSelector('div:has-text("Search Result") + div', {
      timeout: 3 * 60000
    });
    const pinCode = page
      .locator(`div:has-text("Search Result") + div:has-text("${pincode}")`)
      .first();
    await pinCode.dispatchEvent('click');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.goto(url);
    let requestUrl = '';
    let headers = {};
    let requestBody = null;
    const result = await Promise.race([
      page
        .waitForSelector('div[data-testid="default_container_ux4"]')
        .then((el) => ({ element: el, type: 'default_container_ux4' })),
      page
        .waitForSelector('div[data-testid="ItemWidgetContainer"]')
        .then((el) => ({ element: el, type: 'ItemWidgetContainer' }))
    ]);
    if (result.type === 'default_container_ux4') {
      console.log('type 1');
      await page.route(
        /\/api\/instamart\/collection\?.*/, // Match the new URL pattern
        async (route) => {
          if (requestUrl === '') {
            const request = route.request();
            requestUrl = request.url();
            headers = request.headers();

            console.log('Request URL:', requestUrl);

            // Continue the request
            route.continue();
          } else {
            // Abort the request if it's already been captured
            route.abort();
          }
        }
      );
    } else {
      console.log('type 2');
      await page.route(
        /\/api\/instamart\/category-listing\/filter\?.*/, // Match the new URL pattern
        async (route) => {
          if (requestUrl === '') {
            const request = route.request();
            requestUrl = request.url();
            headers = request.headers();

            console.log('Request URL:', requestUrl);
            console.log('Headers:');
            requestBody = request.postData();
            console.log('Request Body');
            // Continue the request
            route.continue();
          } else {
            // Abort the request if it's already been captured
            route.abort();
          }
        }
      );
    }
    let categoryName = '';
    if (result.type === 'default_container_ux4') {
      categoryName = await page
        .locator(
          'div.content > div:first-child >  div:first-child  div:last-child '
        )
        .textContent();
    } else {
      categoryName = await page.locator('div h1').textContent();
      console.log(`Category Name: ${categoryName}`);
    }
    // Format the category name
    categoryName = categoryName
      .replace('in', '')
      .replace(',', ' ')
      .replace(' ', '-')
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[&]/g, 'and') // Replace '&' with 'and'
      .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
      .toLowerCase();

    console.log(categoryName);

    const fileName = `Swiggy-${pincode}-${categoryName}-products`;
    console.log(fileName);
    job.attrs.data.progress = 5;
    await job.save();
    const productMap = {};
    // intercept the request
    // const subCats = await page.locator('ul li').all();
    const allProducts = [];
    // console.log(`Sub Categories: ${subCats.length}`);
    // for (let i = 0; i < subCats.length; i++) {
    requestUrl = '';
    headers = {};
    requestBody = null;
    // await subCats[i].click();
    await page.waitForTimeout(3000);
    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    try {
      const element = await Promise.race([
        page.waitForSelector('div[data-testid="default_container_ux4"]', {
          timeout: 10000
        }),
        page.waitForSelector('div[data-testid="ItemWidgetContainer"]', {
          timeout: 10000
        })
      ]);
      console.log(
        'Found element:'
        // await element.evaluate((el) => el.outerHTML)
      );
    } catch (error) {
      console.error('Neither element appeared in time:', error);
    }
    if (requestUrl === '') {
      console.log('Failed to intercept the request, Scrolling Now');
      await page.evaluate(async () => {
        let lastElement = document.querySelector(
          'div[data-testid="default_container_ux4"]:last-of-type'
        );
        // if not found, try the other selector
        if (!lastElement) {
          console.log('Trying the other selector');
          lastElement = document.querySelector(
            'div[data-testid="ItemWidgetContainer"]:last-of-type'
          );
        }
        if (lastElement) {
          lastElement.scrollIntoView();
          // wait for 2 seconds
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Scroll 100px more
          window.scrollBy(0, 100);
        }
      });
    }

    async function findTotalPages(url) {
      if (!url || !url.includes('pageNo=')) {
        console.log(`Invalid URL: ${url}`);
        throw new Error('Invalid API endpoint URL');
      }
      console.log(`Finding total pages for URL: ${url}`);
      let start = 0; // First page
      let end = 1000; // Assume an initial maximum page count

      let ans = -1;

      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        let newUrl = url.replace(/pageNo=\d+/, `pageNo=${mid}`);

        try {
          let res;
          if (result.type === 'default_container_ux4') {
            res = await page.request.get(newUrl, {
              headers: headers
            });
          } else {
            // For POST requests
            newUrl = newUrl.replace(/offset=\d+/, `offset=${mid * 20}`);
            res = await page.request.post(newUrl, {
              headers: headers,
              data: requestBody
            });
          }

          const randomDelay = () =>
            Math.floor(Math.random() * (5000 - 2000) + 2000); // 2-5 sec

          await page.waitForTimeout(randomDelay());
          if (res.status() === 200) {
            const data = await res.json(); // Parse the JSON response

            // Check if the page has products
            if (data['data'] && data['data']['hasMore'] === false) {
              ans = mid; // Update totalPages to the current mid
              end = mid - 1; // Search in the upper half
            } else {
              start = mid + 1; // Search in the lower half
            }
          } else {
            throw new Error(
              `Failed to fetch page ${mid}, status: ${res.status()}`
            );
          }
        } catch (error) {
          console.error(`Error fetching page ${mid}:`, error.message);
          end = mid - 1; // Adjust the search range and continue
        }
      }

      console.log(`Total pages: ${ans}`);
      return ans === -1 ? 0 : ans;
    }

    const totalPages = await findTotalPages(requestUrl);
    console.log(`Total pages: ${totalPages}`);
    if (requestUrl) {
      job.attrs.data.progress = 15;
      await job.save();
      const products = [];
      let totalScrapped = 0;
      for (let i = 0; i <= totalPages; i++) {
        if (result.type !== 'default_container_ux4') {
          requestUrl = requestUrl.replace(/offset=\d+/, `offset=${i * 20}`);
        }
        let currentUrl = requestUrl.replace(/pageNo=\d+/, `pageNo=${i}`);
        // .replace(/limit=\d+/, `limit=100`);
        console.log(`Requesting page ${i} with URL: ${currentUrl}`);
        const response = await fetchWithRetry(
          page,
          currentUrl,
          headers,
          requestBody
        );

        if (response.status() !== 200) {
          console.error(`Request failed with status ${response.status()}`);
          continue;
        }
        let data;
        try {
          data = await response.json();
        } catch (error) {
          console.error('Failed to parse JSON:', error);
          continue;
        }
        try {
          let milestoneData;
          if (result.type === 'default_container_ux4') {
            milestoneData = data['data']['items'];
          } else {
            milestoneData =
              data['data']['widgets'][data['data']['widgets'].length - 1][
                'data'
              ];
          }
          console.log(
            `Current Data len: ${milestoneData.length} for page ${i}`
          );
          products.push(...milestoneData);
          totalScrapped = products.length;
          console.log(`Total So Far:${totalScrapped}`);
          const hasMore = data['data']['hasMore'];
          if (!hasMore) {
            console.log('Finished scraping all products');
            break;
          }
        } catch (error) {
          console.log(`broke from the loop with ${error.message}`);
          break;
        }
      }
      console.log(`Total Products: ${products.length}`);

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const key = `${product['brand_id']}-${product['display_name']}`;

        if (!productMap[key]) {
          productMap[key] = {
            brand: product['brand'],
            title: product['display_name'],
            variant: [],
            articleIds: new Set(), // Track added article IDs
            url: `https://www.swiggy.com/instamart/item/${
              product['product_id']
            }?storeId=${product['variations']?.[0]?.store_id || ''}`,
            pincode: Number(pincode)
          };
        }

        (product['variations'] || []).forEach((variant) => {
          if (!productMap[key].articleIds.has(variant['id'])) {
            productMap[key]['variant'].push({
              quantity: variant['sku_quantity_with_combo'],
              mrp: variant['price']['mrp'],
              price: variant['price']['offer_price'],
              articleId: variant['id'],
              variantUrl: `https://www.swiggy.com/instamart/item/${
                product['product_id']
              }?storeId=${product['variations']?.[0]?.store_id || ''}`
            });
            productMap[key].articleIds.add(variant['id']);
          }
        });
        job.attrs.data.progress =
          15 + Math.ceil(((i + 1) * 85) / products.length);
        job.attrs.data.total_products += i + 1;
        await job.save();
      }

      // Remove the 'articleIds' set before final output
      const curProducts = Object.values(productMap).map(
        ({ articleIds, ...rest }) => rest
      );

      // console.log(`currentSubCat Products: ${curProducts.length}`);
      // console.log(`Total Products: ${allProducts.length}`);

      allProducts.push(...curProducts);
    } else {
      console.log(`failed to send the request, check the url for subCat ${i}`);
    }
    await page.waitForTimeout(15000);
    // }
    job.attrs.data.total_products = allProducts.length;
    job.attrs.data.progress = 100;
    return [allProducts, fileName];
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
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
  await sleep(5000);
  // return [
  //   [
  //     {
  //       brand: 'Tata Sampann',
  //       title: 'Tata Sampann Unpolished Masoor Dal',
  //       variant: [
  //         {
  //           quantity: '500 g',
  //           mrp: 83,
  //           price: 77,
  //           articleId: '9M2U5WPQTX',
  //           variantUrl:
  //             'https://www.swiggy.com/instamart/item/L3OG2A6TP8?storeId=1181692'
  //         },
  //         {
  //           quantity: '1 kg',
  //           mrp: 164,
  //           price: 151,
  //           articleId: 'PCPV2OG4Z0',
  //           variantUrl:
  //             'https://www.swiggy.com/instamart/item/6STIVRS77K?storeId=1181692'
  //         }
  //       ],
  //       url: 'https://www.swiggy.com/instamart/item/L3OG2A6TP8?storeId=1181692',
  //       imageUrl:
  //         'https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_272,w_252/NI_CATALOG/IMAGES/CIW/2025/1/3/7a95b3af-076e-4b52-bb0f-8b6a3f7f86b0_2394_1.png',
  //       pincode: 500074
  //     }
  //   ],
  //   'swiggy'
  // ];
  return await runJob(job, jobId, url, pincode);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = () => Math.floor(Math.random() * (5000 - 2000) + 2000); // 2-5 sec

const fetchWithRetry = async (
  page,
  url,
  headers,
  requestBody = null,
  retries = 5,
  currentBackoff = 1000,
  attempt = 1
) => {
  try {
    const userAgent = new UserAgent();
    const randomUserAgent = userAgent.toString();
    let response;
    if (!requestBody) {
      response = await page.request.get(url, {
        headers: {
          ...headers,
          'User-Agent': randomUserAgent // Use the random user agent
        }
      });
      // wait for 2 seconds
      await page.waitForTimeout(randomDelay());
    } else {
      console.log(`making post request`);
      response = await page.request.post(url, {
        headers: {
          ...headers,
          'User-Agent': randomUserAgent
        },
        data: requestBody
      });
      // wait for 2 seconds
      await page.waitForTimeout(randomDelay());
    }
    if (response.status() !== 200) {
      console.error(`Request failed with status ${response.status()}`);
      if (response.status() === 403 || response.status() === 429) {
        throw new Error(`Retryable error: ${response.status()}`);
      } else {
        throw new Error(`Non-retryable error: ${response.status()}`);
      }
    }
    console.log(`status: ${response.status()}`);
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
      requestBody,
      retries - 1,
      currentBackoff * 2,
      attempt + 1
    ); // Exponential backoff
  }
};
