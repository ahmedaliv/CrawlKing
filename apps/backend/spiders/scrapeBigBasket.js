import playwright from 'playwright';
import UserAgent from 'user-agents';
async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });

    const randomUserAgent = userAgent.toString();
    const context = await browser.newContext({
      userAgent: randomUserAgent
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000 * 3);
    await page.goto(url);
    await page.waitForSelector("section ul li[class*='PaginateItems']");
    // Handle location input (Pincode)
    await page.waitForSelector('button:has-text("Select Location")', {
      timeout: 3 * 60000
    });
    const pincodeButton = page
      .locator('button:has-text("Select Location")')
      .first()
      .dispatchEvent('click');
    await page.waitForSelector(
      'input[placeholder="Search for area or street name"]',
      { timeout: 3 * 60000 }
    );
    let pincodeInput = await page
      .locator(
        'div:has-text("Select a location for delivery") input[placeholder="Search for area or street name"]'
      )
      .all();
    if (pincodeInput.length > 1) {
      pincodeInput = pincodeInput[1];
    } else {
      pincodeInput = pincodeInput[0];
    }
    pincodeInput.fill(pincode);
    await page.waitForSelector('ul li[class*="AddressDropdown"]', {
      timeout: 3 * 60000
    });
    const pinCode = page.locator(
      'ul li[class*="AddressDropdown"]:first-of-type'
    );
    await pinCode.dispatchEvent('click');
    // await page.waitForNavigation
    await page.waitForURL('https://www.bigbasket.com/');
    try {
      await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
    } catch (error) {
      console.error('Failed to load the page:', error);
      // Retry or handle the error
    }
    let requestUrl = '';
    await page.route(/\/v2\/products\?.*/, (route) => {
      if (requestUrl === '') {
        requestUrl = route.request().url();
        console.log(requestUrl);
        route.continue();
      } else {
        route.abort();
      }
    });
    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    await page.waitForSelector("section ul li[class*='PaginateItems']");
    const categoryNameText = await page
      .locator("div[class*='Breadcrumb'] > div:last-of-type")
      .textContent();
    const categoryName = categoryNameText
      .replace(',', ' ')
      .replace(' ', '-')
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[&]/g, 'and') // Replace '&' with 'and'
      .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
      .toLowerCase();
    const filename = `BigBasket-${pincode}-${categoryName}-products`;
    console.log(filename);
    job.attrs.data.progress = 5;
    await job.save();
    if (requestUrl === '') {
      console.log('Failed to intercept the request, Scrolling Now');
      await page.evaluate(async () => {
        const selector = 'ul:has(li[class*="PaginateItems"])';
        const list = document.querySelector(selector);
        // Get the initial count of elements
        let previousCount = list.querySelectorAll(
          'li[class*="PaginateItems"]'
        ).length;

        while (true) {
          // Scroll to the bottom of the page
          window.scrollBy(0, list.scrollHeight);

          // Wait for new elements to load (adjust the delay as needed)
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Get the current count of elements
          const currentCount = document.querySelectorAll(selector).length;

          // If the count increases, update the previous count and continue scrolling
          if (previousCount === 0 || currentCount > previousCount) {
            console.log(
              `Element count increased: ${previousCount} -> ${currentCount}`
            );
            previousCount = currentCount;
          } else {
            // If the count doesn't change, assume no more items to load and break
            console.log('No new elements loaded. Stopping scroll.');
            break;
          }
        }
      });
    }
    // **Step 1: Get cookies after confirming pincode**
    const cookies = await context.cookies();
    const cookieString = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    if (requestUrl) {
      // replace the page number to be 1
      requestUrl = requestUrl.replace(/page=\d+/, 'page=1');
      console.log(requestUrl);
      const headers = {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.8',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'sec-ch-ua':
          '"Chromium";v="130", "Brave";v="130", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'x-channel': 'BB-WEB',
        'x-tracker': '5d47e689-53b4-44bb-9171-46e2d037f06f',
        cookie: cookieString
      };
      const response = await page.request.get(requestUrl, {
        headers: headers
      });

      // Parse and log the response
      const data = await response.json();
      // log the keys
      console.log(Object.keys(data));
      const totalProducts = data['tabs'][0]['product_info']['total_count'];
      job.attrs.data.progress = 15;
      await job.save();
      console.log(data['tabs'][0]['product_info']['number_of_pages']);
      const products = [];
      const milestones = Number(
        data['tabs'][0]['product_info']['number_of_pages']
      );

      let totalScrapped = 0;
      for (let i = 1; i <= milestones; i++) {
        requestUrl = requestUrl.replace(/page=\d+/, `page=${i}`);
        const response = await page.request.get(requestUrl, {
          headers: headers
        });
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
        const milestoneData = data['tabs'][0]['product_info']['products'];
        console.log(`Current Data len: ${milestoneData.length}`);
        products.push(...milestoneData);
        totalScrapped = products.length;
        console.log(`Total So Far:${totalScrapped}`);
        job.attrs.data.progress = 15 + Math.ceil(((i + 1) * 85) / milestones);
        job.attrs.data.total_products = totalScrapped;
        await job.save();
      }
      const transformedProducts = products || [];
      const allProducts = transformedProducts.map((product) => {
        return {
          brand: product.brand.name, // "Mr. Gold"
          title: product.desc, // "Nakshatra Pooja Oil"
          variant: [
            // Original product
            {
              quantity: product.w, // "500 ml"
              mrp: product.pricing.discount.mrp, // "105"
              price: product.pricing.discount.prim_price.sp, // "83.78"
              articleId: product.id // "40141960"
            },
            // Variants
            ...product.children.map((variant) => {
              return {
                quantity: variant.w, // "1 L"
                mrp: variant.pricing.discount.mrp, // "200"
                price: variant.pricing.discount.prim_price.sp, // "170.8"
                articleId: variant.id // "40141959"
              };
            })
          ],
          url: `https://www.bigbasket.com${product.absolute_url}`, // "https://www.bigbasket.com/pd/40141960/mr-gold-nakshatra-pooja-oil-500-ml/"
          pincode: Number(pincode) // External parameter
        };
      });
      job.attrs.data.progress = 100;
      await job.save();
      return [allProducts, filename];
    } else {
      console.log('failed to send the request, check the url');
    }
    // await page.waitForSelector("section ul li[class*='PaginateItems']");
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
