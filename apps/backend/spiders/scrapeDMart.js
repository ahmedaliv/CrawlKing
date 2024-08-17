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
      if (error instanceof TimeoutError) {
        throw new Error(`Navigation to ${url} timed out after ${60} seconds`);
      }
      throw error;
    }

    // await page.goto(url);
    const lastSegmentOfUrl = url.split('/').pop();
    await page.route(/(png|jpeg|jpg|svg)$/, (route) => route.abort());
    let promiseRes = null;
    const promise = new Promise((resolve) => {
      promiseRes = resolve;
    });
    let found = false;
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.includes('api/v2/plp/' + lastSegmentOfUrl)) {
        found = true;
        const headers = await route.request().allHeaders();
        const url = route.request().url();
        const initialResponse = await route.fetch();
        const json = await initialResponse.json();
        const totalProducts = json.totalRecords;
        const urlOnly = url.split('?')[0];
        let params = url.split('?')[1];
        const replacePageNumberRegex = /page=\d+/;
        params = params.replace(replacePageNumberRegex, 'page=0');
        scrapeJobs[jobId].progress = 5;
        let total = 0;
        let prevTotal = 0;
        if (totalProducts > 10000) {
          const batchSize = 1000;
          params = params.replace('size=40', `size=${batchSize}`);
          const batches = Math.ceil(totalProducts / batchSize);
          let i = 1;
          while (i < batches) {
            // urlSearchParams.set('page', i);
            params = params.replace(`page=${i - 1}`, `page=${i}`);
            const batch = await page.request.get(urlOnly + '?' + params, {
              headers
            });
            const batchJson = await batch.json();
            prevTotal = total;
            total += batchJson.products.length;
            const batchId = `${prevTotal}-${total}`;
            scrapeJobs[jobId].progress = Math.floor(
              (total / totalProducts) * 100
            );
            if (scrapeJobs[jobId].progress < 5) {
              scrapeJobs[jobId].progress = 5;
            }
            scrapeJobs[jobId].total_products = total;
            if (scrapeJobs[jobId].status === 'cancelled') {
              break;
            }
            // do not add empty batches
            if (batchJson.products.length === 0) {
              i++;
              continue;
            }
            await appendToJsonFile(
              `./jobs/${jobId}/data.json`,
              batchJson.products
            );
            await appendFile(
              `./jobs/${jobId}/${batchId}.json`,
              JSON.stringify(batch, null, 2)
            );
            batches--;
          }
        } else {
          const bigBatch = totalProducts;
          params = params.replace('size=40', `size=${bigBatch}`);
          const batch = await page.request.get(urlOnly + '?' + params, {
            headers
          });
          const batchJson = await batch.json();
          total += batchJson.products.length;
          const batchId = `${0}-${bigBatch}`;
          // transform the products to the desired format
          batchJson.products = batchJson.products.map((product) => {
            const firstSKU =
              product.sKUs && product.sKUs[0] ? product.sKUs[0] : {};
            return {
              name: product.name || 'Unknown Product',
              brand: product.manufacturer || 'Unknown Brand',
              unitPrice: firstSKU.priceMRP || '0.00',
              salePrice: firstSKU.priceSALE || '0.00',
              variant: firstSKU.variantTextValue || 'N/A',
              image: firstSKU.productImageKey || 'default-image.jpg',
              url: product.targetUrl || '#'
            };
          });
          await appendToJsonFile(
            `./jobs/${jobId}/data.json`,
            batchJson.products
          );
          await appendFile(
            `./jobs/${jobId}/${batchId}.json`,
            JSON.stringify(batch, null, 2)
          );
        }
        if (scrapeJobs[jobId].status !== 'cancelled') {
          scrapeJobs[jobId].progress = 100;
          scrapeJobs[jobId].status = 'completed';
          scrapeJobs[jobId].total_products = totalProducts;
        }
        await appendFile(
          `./jobs/${jobId}/stats.json`,
          JSON.stringify(scrapeJobs[jobId], null, 2)
        );
        promiseRes();
      }
      route.continue();
    });
    
    const pincodeButton = page.locator('.dmart-icon-location').first();
    await pincodeButton.click();
    await page.waitForSelector('#pincodeInput',{timeout: 3 * 60000});
    const pincodeInput = page.locator('#pincodeInput');
    await pincodeInput.fill(pincode);
    const pinCode = page.getByAltText('pincodeimg').first();
    await pinCode.click();
    const confirm = page.getByText('CONFIRM LOCATION').first();
    await confirm.click();
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await promise;
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
      `Job ${jobId}  ${scrapeJobs[jobId].status} in duration ${
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
