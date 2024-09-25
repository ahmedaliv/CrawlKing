import { appendFile } from 'fs/promises';
import playwright from 'playwright';
import { uuid } from 'uuidv4';
import { scrapeJobs } from '../index.js';
import { appendToJsonFile } from '../utils/save.js';

async function runJob(jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: false // Set to true for headless mode
  });
  const startTime = performance.now(); // Record the start time

  try {
    // Create a new Playwright context
    const context = await browser.newContext();
    const page = await context.newPage();

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

    // Wait for the page to load products
    await page.waitForTimeout(2000); // Wait for a short duration after confirmation
    scrapeJobs[jobId].progress = 5;

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
    // make any thing device specific in the headers to be changed every time

    const headers = {
      accept: 'application/json, text/plain, */*',
      'accept-language': getRandomItem([
        'en-US,en;q=0.8',
        'en-GB,en;q=0.9',
        'fr-FR,fr;q=0.8'
      ]),
      'cache-control': 'no-cache',
      d_info: d_info || '',
      pragma: 'no-cache',
      priority: 'u=1, i',
      'sec-ch-ua': `"Chromium";v="${
        Math.floor(Math.random() * 100) + 100
      }", "Not;A=Brand";v="24", "Brave";v="${
        Math.floor(Math.random() * 100) + 100
      }"`,
      'sec-ch-ua-mobile': Math.random() > 0.5 ? '?0' : '?1', // Randomize between desktop and mobile
      'sec-ch-ua-platform': `"${getRandomItem([
        'Windows',
        'Linux',
        'Mac OS'
      ])}"`, // Randomize platform
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'sec-gpc': '1',
      storeid: storeId || '', // Ensure this is dynamically fetched if necessary
      'x-request-id': x_request_id // Use a function to generate a random request ID
    };

    const lastSegmentOfUrl = url.split('/').pop();

    const initialResponse = await page.request.get(
      `https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=0&size=1`,
      {
        headers: {
          ...headers,
          Cookie: cookieString // Inject cookies
        }
      }
    );
    const initialData = await initialResponse.json();
    const totalProducts = initialData.totalRecords;

    // Update scrape job progress and total products
    scrapeJobs[jobId].total_products = totalProducts;
    scrapeJobs[jobId].progress = 15;

    // Step 3 : Check if the number of products is > 500 , if yes fetch milestones (500 products at a time)
    let finalResponse;
    if (totalProducts > 500) {
      const milestones = Math.ceil(totalProducts / 500);
      let products = [];
      // it is important to start from 1 because page 0 and page 1 are the same
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
        products.push(...milestoneData.products);
        scrapeJobs[jobId].progress =
          15 + Math.ceil(((i + 1) * 85) / milestones);
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
    }

    const allProducts = finalResponse;

    // Save results
    await appendToJsonFile(`./jobs/${jobId}/data.json`, allProducts);
    scrapeJobs[jobId].progress = 100;
    scrapeJobs[jobId].status = 'completed';

    await appendFile(
      `./jobs/${jobId}/stats.json`,
      JSON.stringify(scrapeJobs[jobId], null, 2)
    );
  } catch (error) {
    scrapeJobs[jobId] = {
      status: 'failed',
      progress: 0,
      error: error.message
    };
  } finally {
    await browser.close();
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(
      `Job ${jobId} ${scrapeJobs[jobId].status} in duration ${
        duration / 1000
      } seconds`
    );
    scrapeJobs[jobId].duration = duration / 1000;
  }
}

export async function main(url, pincode) {
  const jobId = uuid();
  scrapeJobs[jobId] = { status: 'running', progress: 0, total_products: 0 };
  // Start the job asynchronously
  runJob(jobId, url, pincode);
  return jobId;
}

// Function to transform the items
export function getStatus(jobId) {
  return scrapeJobs[jobId] || { status: 'unknown' };
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
