import playwright from 'playwright';
import agenda from '../config/agenda.js';
async function runJob(job, jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: true // Set to true for headless mode
  });
  const startTime = performance.now(); // Record the start time

  try {
    // Create a new Playwright context
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(60000 * 3);
    // Navigate to the target URL
    try {
      await page.goto(url, { timeout: 60 * 1000 });
    } catch (error) {
      throw new Error(`Navigation to ${url} timed out after ${60} seconds`);
    }
    // Handle location input (Pincode)
    const pincodeButton = page.locator('.dmart-icon-location').first();
    await pincodeButton.click();
    await page.waitForSelector('#pincodeInput', { timeout: 3 * 60000 });
    const pincodeInput = page.locator('#pincodeInput');
    await pincodeInput.fill(pincode);
    const pinCode = page.getByAltText('pincodeimg').first();
    await pinCode.click();
    const confirm = page.getByText('CONFIRM LOCATION').first();
    await confirm.click();
    // Get the category name from the page
    const categoryNameElement = page
      .locator('.product-grid_headerText__SxW_0')
      .first();
    const categoryName = (await categoryNameElement.textContent())
      .replace(' ', '-')
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[&]/g, 'and') // Replace '&' with 'and'
      .replace(/[^a-zA-Z0-9-_]/g, '') // Remove any other special characters
      .toLowerCase();

    const filename = `Dmart-${pincode}-${categoryName}-products`;

    // Wait for the page to load products
    await page.waitForTimeout(2000); // Wait for a short duration after confirmation
    // scrapeJobs[jobId].progress = 5;
    // get the job from the database and update its progress
    // const job = await agenda.jobs({ 'data.jobId': jobId });
    job.attrs.data.progress = 5;
    await job.save();
    // **Step 1: Get cookies after confirming pincode**
    const cookies = await context.cookies();
    const cookieString = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    // Extract x-request-id and d_info from cookies
    const reqIdCookie = cookies.find((cookie) => cookie.name === 'reqId');
    const x_request_id = reqIdCookie
      ? decodeURIComponent(reqIdCookie.value.replace(/"/g, ''))
      : null;
    const d_info = cookies
      .find((cookie) => cookie.name === 'd_info')
      ?.value.replace(/"/g, '');

    // Extract storeId from guest cookie if it exists
    let storeId = '10695'; // Default storeId if not in the cookie
    const guestCookie = cookies.find((cookie) => cookie.name === 'guest');
    if (guestCookie) {
      const guestData = JSON.parse(decodeURIComponent(guestCookie.value));
      storeId = guestData.preferredStore || storeId;
    }

    // Define headers with d_info and other values
    const headers = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.8',
      'cache-control': 'no-cache',
      d_info: d_info || '', // Inject d_info from the cookies
      pragma: 'no-cache',
      priority: 'u=1, i',
      'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Brave";v="128"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'sec-gpc': '1',
      storeid: storeId,
      'x-request-id': x_request_id || ''
    };
    const lastSegmentOfUrl = url.split('/').pop();

    // **LOGGING INITIAL REQUEST**
    const initialRequestUrl = `https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=0&size=1`;

    const initialResponse = await page.request.get(initialRequestUrl, {
      headers: {
        ...headers,
        Cookie: cookieString // Inject cookies
      }
    });

    const initialData = await initialResponse.json();
    const totalProducts = initialData.totalRecords;

    job.attrs.data.progress = 15;
    await job.save();
    // Step 3 : Check if the number of products is > 500 , if yes fetch milestones (500 products at a time)
    let finalResponse;
    if (totalProducts > 500) {
      const milestones = Math.ceil(totalProducts / 500);
      let products = [];
      for (let i = 1; i <= milestones; i++) {
        finalResponse = await page.request.get(
          `https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=${i}&size=500&channel=web&storeId=${storeId}`,
          {
            headers: {
              ...headers,
              Cookie: cookieString // Inject cookies
            }
          }
        );
        const milestoneData = await finalResponse.json();
        const totalProducts = milestoneData.totalRecords;

        // Update scrape job progress and total products
        job.attrs.data.total_products = totalProducts;
        await job.save();
        products.push(...milestoneData.products);
        job.attrs.data.progress = 15 + Math.ceil(((i + 1) * 85) / milestones);
        await job.save();
      }
      finalResponse = { products };
    } else {
      finalResponse = await page.request.get(
        `https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=0&size=${totalProducts}&channel=web&storeId=${storeId}`,
        {
          headers: {
            ...headers,
            Cookie: cookieString // Inject cookies
          }
        }
      );

      const finalData = await finalResponse.json();
      const totalProducts = finalData.totalRecords;

      // Update scrape job progress and total products
      job.attrs.data.total_products = totalProducts;
      await job.save();
      finalResponse = finalData;
    }

    const transformedProducts = finalResponse.products || [];
    const allProducts = transformedProducts.map((product) => {
      return {
        brand: product.manfacturer,
        title: product.name,
        variant: product.sKUs.map((variant) => {
          return {
            quantity: variant.variantTextValue,
            mrp: variant.priceMRP,
            price: variant.priceSALE,
            articleId: variant.articleNumber
          };
        }),
        url: `https://www.dmart.in/product/${product.seo_token_ntk}`,
        pincode: Number(pincode)
      };
    });
    job.attrs.data.progress = 100;
    await job.save();
    return [allProducts, filename];
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

// Function to transform the items
export function getStatus(jobId) {
  // return scrapeJobs[jobId] || { status: 'unknown' };
}
