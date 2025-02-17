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
    await page.waitForSelector('div[data-testid="default_container_ux4"]');
    // intercept the request

    let requestUrl = '';
    let headers = {};
    await page.route(
      /\/api\/instamart\/collection\?.*/, // Match the new URL pattern
      async (route) => {
        if (requestUrl === '') {
          const request = route.request();
          requestUrl = request.url();
          headers = request.headers();

          console.log('Request URL:', requestUrl);
          console.log('Headers:', headers);

          // Continue the request
          route.continue();
        } else {
          // Abort the request if it's already been captured
          route.abort();
        }
      }
    );

    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    await page.waitForSelector('div[data-testid="default_container_ux4"]');
    let categoryName = await page
      .locator(
        'div.content  > div[data-testid="children-wrapper"]:first-of-type > div:first-of-type  > div:last-of-type'
      )
      .textContent();

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
        const lastElement = document.querySelector(
          'div[data-testid="default_container_ux4"]:last-of-type'
        );
        lastElement.scrollIntoView();
        // wait for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });
    }
    async function findTotalPages(url) {
      console.log(`Finding total pages for URL: ${url}`);
      let start = 0; // First page
      let end = 1000; // Assume an initial maximum page count
      let totalPages = 0;

      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const newUrl = url.replace(/pageNo=\d+/, `pageNo=${mid}`);
        console.log(`Checking page ${mid} - URL: ${newUrl}`);

        try {
          const res = await page.request.get(newUrl, {
            headers: headers
          });

          // Check response status
          if (res.status() === 200) {
            const data = await res.json(); // Parse the JSON response
            console.log(Object.keys(data));
            // Check if the page has products
            if (data['data']['items'].length > 0) {
              totalPages = mid; // Update totalPages to the current mid
              start = mid + 1; // Search in the upper half
            } else {
              end = mid - 1; // Search in the lower half
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

      console.log(`Total pages: ${totalPages}`);
      return totalPages;
    }

    const totalPages = await findTotalPages(requestUrl);
    console.log(`Total pages: ${totalPages}`);
    if (requestUrl) {
        job.attrs.data.progress = 15;
        await job.save();
      const products = [];
      let totalScrapped = 0;
      for (let i = 0; i <= totalPages; i++) {
        let currentUrl = requestUrl.replace(/pageNo=\d+/, `pageNo=${i}`);
        // .replace(/limit=\d+/, `limit=100`);
        console.log(`Requesting page ${i} with URL: ${currentUrl}`);
        const response = await fetchWithRetry(page, currentUrl, headers);
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
        const milestoneData = data['data']['items'];
        console.log(`Current Data len: ${milestoneData.length} for page ${i}`);
        products.push(...milestoneData);
        const hasMore = data['data']['hasMore'];
        if (!hasMore) {
          console.log('Finished scraping all products');
          break;
        }
        totalScrapped = products.length;
        console.log(`Total So Far:${totalScrapped}`);
        job.attrs.data.progress = 15 + Math.ceil(((i + 1) * 85) / totalPages);
        job.attrs.data.total_products = totalScrapped;
        await job.save();
      }
      const transformedProducts = [];
      console.log(`Total Products: ${transformedProducts.length}`);
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


