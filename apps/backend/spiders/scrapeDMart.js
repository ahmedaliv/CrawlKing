import { appendFile } from 'fs/promises';
import playwright from 'playwright';
import { uuid } from 'uuidv4';
import { scrapeJobs } from '../index.js';
import { appendToJsonFile } from '../utils/save.js';

async function runJob(jobId, url, pincode) {
  const browser = await playwright.chromium.launch({
    headless: true // Set to true for headless mode
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

    // Handle location input
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
    // Extract last segment of URL for API endpoint
    const lastSegmentOfUrl = url.split('/').pop();

    // Fetch initial product count
    const initialResponse = await page.request.get(`https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=0&size=1`);
    const initialData = await initialResponse.json();
    const totalProducts = initialData.totalRecords;

    // Fetch all products
    const finalResponse = await page.request.get(`https://digital.dmart.in/api/v2/plp/${lastSegmentOfUrl}?page=0&size=${totalProducts}`);
    const allProducts = await finalResponse.json();

    scrapeJobs[jobId].total_products = totalProducts;
    scrapeJobs[jobId].progress = 15;
    // // Transform products to the desired format
    // const transformedProducts = allProducts.products.map((product) => {
    //   const firstSKU = product.sKUs && product.sKUs[0] ? product.sKUs[0] : {};
    //   return {
    //     name: product.name || 'Unknown Product',
    //     brand: product.manufacturer || 'Unknown Brand',
    //     unitPrice: firstSKU.priceMRP || '0.00',
    //     salePrice: firstSKU.priceSALE || '0.00',
    //     variant: firstSKU.variantTextValue || 'N/A',
    //     image: firstSKU.productImageKey || 'default-image.jpg',
    //     url: product.targetUrl || '#'
    //   };
    // });

    // Save results
    await appendToJsonFile(`./jobs/${jobId}/data.json`, allProducts);
    scrapeJobs[jobId].progress = 100;
    scrapeJobs[jobId].status = 'completed';
    
    await appendFile(`./jobs/${jobId}/stats.json`, JSON.stringify(scrapeJobs[jobId], null, 2));

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
