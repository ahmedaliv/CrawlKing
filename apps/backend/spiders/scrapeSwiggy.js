import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: false
  });

  try {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });

    const randomUserAgent = userAgent.toString();
    const context = await browser.newContext({
      userAgent: randomUserAgent
    });
    const page = await context.newPage();
    // page.setDefaultTimeout(60000 * 3);
    // await page.goto(url);
    await page.goto('https://www.swiggy.com');
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
    const result = await Promise.race([
      page
        .waitForSelector('div[data-testid="default_container_ux4"]')
        .then((el) => ({ element: el, type: 'default_container_ux4' })),
      page
        .waitForSelector('div[data-testid="ItemWidgetContainer"]')
        .then((el) => ({ element: el, type: 'ItemWidgetContainer' }))
    ]);

    // intercept the request

    let requestUrl = '';
    let headers = {};
    let requestBody = null;
    if (result.type === 'default_container_ux4') {
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
      await page.route(
        /\/api\/instamart\/category-listing\/filter\?.*/, // Match the new URL pattern
        async (route) => {
          if (requestUrl === '') {
            const request = route.request();
            requestUrl = request.url();
            headers = request.headers();

            console.log('Request URL:', requestUrl);
            console.log('Headers:', headers);
            requestBody = request.postData();
            console.log('Request Body:', requestBody);
            // Continue the request
            route.continue();
          } else {
            // Abort the request if it's already been captured
            route.abort();
          }
        }
      );
    }
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
        'Found element:',
        await element.evaluate((el) => el.outerHTML)
      );
    } catch (error) {
      console.error('Neither element appeared in time:', error);
    }
    let categoryName = '';
    if (result.type === 'default_container_ux4') {
      categoryName = await page
        .locator(
          'div.content  > div[data-testid="children-wrapper"]:first-of-type > div:first-of-type  > div:last-of-type'
        )
        .textContent();
    } else {
      categoryName = await page
        .locator('div[data-testid="title-element"]')
        .textContent();
      categoryName.split('in')[1];
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

    const filename = `Swiggy-${pincode}-${categoryName}-products`;
    console.log(filename);
    job.attrs.data.progress = 5;
    await job.save();
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
        lastElement.scrollIntoView();
        // wait for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });
    }
    async function findTotalPages(url) {
      console.log(`Finding total pages for URL: ${url}`);
      let start = 0; // First page
      let end = 1000; // Assume an initial maximum page count
      let ans = -1; // To store the first page where hasMore is false

      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        let newUrl = url.replace(/pageNo=\d+/, `pageNo=${mid}`);
        console.log(`Checking page ${mid} - URL: ${newUrl}`);

        try {
          let res;
          if (result.type === 'default_container_ux4') {
            res = await page.request.get(newUrl, {
              headers: headers
            });
          } else {
            // For POST requests
            newUrl = newUrl.replace(/offset=\d+/, `offset=${mid * 20}`);
            console.log(`URL for POST: ${newUrl}`);
            res = await page.request.post(newUrl, {
              headers: headers,
              data: requestBody
            });
          }

          if (res.status() === 200) {
            const data = await res.json(); // Parse the JSON response
            console.log(`Response for page ${mid}:`, data);

            // Check if the page has products and hasMore is false
            if (data['data'] && data['data']['hasMore'] === false) {
              ans = mid; // Update ans to the current mid
              end = mid - 1; // Search in the lower half for an earlier page
            } else {
              start = mid + 1; // Search in the upper half
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

      if (ans !== -1) {
        console.log(`First page with hasMore = false: ${ans}`);
      } else {
        console.log('No page found with hasMore = false');
      }
      return ans;
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
          job.attrs.data.progress = 15 + Math.ceil(((i + 1) * 85) / totalPages);
          job.attrs.data.total_products = totalScrapped;
          await job.save();
        } catch (error) {
          console.log(`broke from the loop with ${error.message}`);
          break;
        }
      }
      const transformedProducts = [];
      console.log(`Total Products: ${products.length}`);
      console.log(`file Name : ${filename}`);
      const productMap = {};

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const key = `${product['brand_id']}-${product['display_name']}`;

        if (!productMap[key]) {
          productMap[key] = {
            brand: product['brand'],
            title: product['display_name'],
            variant: [],
            url: `https://www.swiggy.com/instamart/item/${
              product['product_id']
            }?storeId=${product['variations']?.[0]?.store_id || ''}`,
            pincode: Number(pincode)
          };
        }

        productMap[key]['variant'].push(
          ...(product['variations'] || []).map((variant) => ({
            quantity: variant['sku_quantity_with_combo'],
            mrp: variant['price']['mrp'],
            price: variant['price']['offer_price'],
            articleId: variant['id']
          }))
        );
      }

      const allProducts = Object.values(productMap);

      console.log(`Total Products: ${allProducts.length}`);
      // print all the products
      job.attrs.data.total_products = totalScrapped;
      job.attrs.data.progress = 100;
      await job.save();
      return [allProducts, filename];
    } else {
      console.log('failed to send the request, check the url');
    }
  } catch (error) {
    console.log(`Job ${jobId} failed with error: ${error.message}`);
    return [[], null];
  } finally {
    await browser.close();
    const endTime = performance.now();
  }
}

export async function main(job, jobId, url, pincode) {
  return await runJob(job, jobId, url, pincode);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    } else {
      console.log(`making post request`);
      response = await page.request.post(url, {
        headers: {
          ...headers,
          'User-Agent': randomUserAgent
        },
        data: requestBody
      });
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
