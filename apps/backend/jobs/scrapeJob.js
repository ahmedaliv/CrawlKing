import { main as scrapeDMart } from '../spiders/scrapeDMart.js';
import { main as scrapeJioMart } from '../spiders/scrapeJioMart.js';
import { main as scrapeBigBasket } from '../spiders/scrapeBigBasket.js';
import { main as scrapeBlinkit } from '../spiders/scrapeBlinkit.js';
import { main as scrapeZeptoNow } from '../spiders/scrapeZeptoNow.js';
import { main as scrapeSwiggy } from '../spiders/scrapeSwiggy.js';
import { main as scrapeFlipKart } from '../spiders/scrapeFlipKart.js';
import ScrapeData from '../models/ScrapeData.js'; // Import ScrapeData model
import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { __dirname } from './paths.js';

const execFileAsync = promisify(execFile);

const MAX_RETRIES = 3;

const getScraper = (url) => {
  switch (true) {
    case url.includes('bigbasket.com'):
      return scrapeBigBasket;
    case url.includes('dmart.in'):
      return scrapeDMart;
    case url.includes('jiomart.com'):
      return scrapeJioMart;
    case url.includes('blinkit.com'):
      return scrapeBlinkit;
    case url.includes('zepto'):
      return scrapeZeptoNow;
    case url.includes('swiggy'):
      return scrapeSwiggy;
    case url.includes('flipkart'):
      return scrapeFlipKart;
    default:
      throw new Error(`No scraper found for URL: ${url}`);
  }
};

/**
 * update the progress of the job, and save the job to the database
 */
async function handleJobRecurringStatus(job, type) {
  if (type === 'recurring') {
    job.attrs.data.progress = 0;
    job.attrs.data.lastRunStatus = 'completed';
    console.log('setting lastRunStatus to comp.');
  } else {
    job.attrs.data.lastRunStatus = null;
  }

  await job.save();
}

/**
 *  update the job metadata required for the job to be retried
 */
async function handleJobFailureCase(job, error) {
  console.error('Error during scraping job:', error);

  // Increment failCount and log the error
  job.attrs.data.failCount = (job.attrs.data.failCount || 0) + 1;
  job.attrs.data.failReason = error.message;
  job.attrs.data.failedAt = new Date();

  // Reschedule if max retries have not been reached
  if (job.attrs.data.failCount < MAX_RETRIES) {
    console.log(
      `Retrying job for ${JSON.stringify(job.attrs.data)}, attempt ${job.attrs.data.failCount
      }`
    );
    await job.schedule('in 10 seconds'); // Adjust retry time as needed
    await job.save();
  } else {
    console.log(
      `Job failed for ${JSON.stringify(job.attrs.data)}. Max retries reached.`
    );
    await job.fail(error.message);
    job.attrs.data.status = 'failed';
    await job.save();
  }
}

export default function defineScrapeJob(agenda) {
  agenda.define('scrape job', async (job) => {
    const { url, pincode, jobId, type } = job.attrs.data;

    try {
      const scraper = getScraper(url);
      console.log(`Starting scrape for ${url} at pincode ${pincode}`);
      const [scrapedData, fileName] = await scraper(job, jobId, url, pincode);
      if (
        !scrapedData ||
        !Array.isArray(scrapedData) ||
        scrapedData.length < 1
      ) {
        throw new Error('Scraped data is invalid or empty');
      }
      // Save scraped data to the database
      const scrapeResult = { jobId, data: scrapedData };
      const savedScrape = new ScrapeData(scrapeResult);
      await savedScrape.save();

      // Update job status
      job.attrs.data.status = 'completed';
      job.attrs.data.fileName = fileName;
      console.log(`Scraping completed for ${url}`);
      await handleJobRecurringStatus(job, type);
      console.log(
        `job attrs from scrapejob ${JSON.stringify(job.attrs.data, null, 2)}`
      );
    } catch (error) {
      await handleJobFailureCase(job, error);
    }
  });
}

export function defineScrapeGroup(agenda) {
  agenda.define('scrape group', async (job) => {
    const { urls, pincode, groupJobIds, jobId, type, name } = job.attrs.data;
    try {
      job.attrs.data.status = 'running';
      await job.save();
      const jobIds = urls.map(() => uuid());
      const jobs = await Promise.all(
        urls.map((url, index) => {
          const newJobId = jobIds[index];
          return agenda.now('scrape job', {
            url,
            pincode,
            jobId: newJobId,
            type: 'immediate',
            forGroup: true
          });
        })
      );
      const childJobIds = new Set(jobIds);
      console.log(
        '🪵 [scrapeJob.js:136] ~ token ~ \x1b[0;32mchildJobIds\x1b[0m = ',
        childJobIds
      );
      job.attrs.data.groupJobIds = Array.from(childJobIds);
      job.attrs.data.status = 'running-scraping';
      await job.save();
      let successed = 0;
      let failed = 0;
      // Wait for all child jobs to complete or fail
      await new Promise((resolve) => {
        const completeHandler = (completedJob) => {
          console.log('inside completeHandler');
          const id = completedJob.attrs.data.jobId.toString();
          console.log(
            '🪵 [scrapeJob.js:152] ~ token ~ \x1b[0;32mid\x1b[0m = ',
            id
          );
          if (childJobIds.has(id)) {
            successed++;
            childJobIds.delete(id);
            if (childJobIds.size === 0) cleanup();
          }
        };

        const failHandler = (error, failedJob) => {
          console.log('inside failHandler');
          const id = failedJob.attrs.data.jobId.toString();
          console.log(
            '🪵 [scrapeJob.js:163] ~ token ~ \x1b[0;32mid\x1b[0m = ',
            id
          );
          if (childJobIds.has(id)) {
            failed++;
            childJobIds.delete(id);
            if (childJobIds.size === 0) cleanup();
          }
        };

        const cleanup = () => {
          console.log('inside cleanup');
          agenda.off('complete', completeHandler);
          agenda.off('fail', failHandler);
          resolve();
        };

        agenda.on('complete', completeHandler);
        agenda.on('fail', failHandler);
      });
      console.log('finished scrapping for group job', jobId, successed, failed);
      if (successed < 2) {
        throw new Error('Failed to scrape all URLs');
      }

      // All child jobs are done
      console.log('All child jobs completed for group job', jobId);
      job.attrs.data.status = 'running-matching';
      await job.save();
      // TODO: define the folder path here and pass it to the normalizeJobProducts function instead of returning it from the function, always try to make parent controls the child
      // normalize the result of the successful child jobs
      const folderPath = path.join(__dirname, 'data', 'groups', jobId);
      await normalizeJobProducts(job, jobs, folderPath);
      console.log(`path: ${folderPath}`)
      // run python code
      console.log('starting matching')
      await runProductMatcher(folderPath);
      console.log('🎉 Matching completed!');
      // load the result from fs
      const outputData = await fs.readFile(
        path.join(folderPath, 'output.json'),
        'utf8'
      );
      const scrapedData = JSON.parse(outputData);
      const scrapeResult = { jobId, data: scrapedData };
      const savedScrape = new ScrapeData(scrapeResult);
      await savedScrape.save();
      // Send data to external server
      try {
        const response = await fetch('https://asia-south1-tru-pricer.cloudfunctions.net/uploadMergedProducts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productList: scrapedData }),
        });

        if (!response.ok) {
          console.error('❌ Failed to upload data:', response.status, await response.text());
        } else {
          console.log('✅ Data successfully uploaded to external server');
        }
      } catch (err) {
        console.error('❌ Error during external upload:', err);
      }
      // last run (we fininshed)
      job.attrs.data.status = 'completed';
      await job.save();
      console.log(`Scraping completed for ${urls, pincode}`);
      await handleJobRecurringStatus(job, type);
    } catch (error) {
      await handleJobFailureCase(job, error);
    }
  });
}

async function normalizeJobProducts(group, jobs, folderPath) {
  // load jobs data
  let allProducts = [];
  /**
   * Store product count per job
   */
  const jobProductCounts = {};
  for (const job of jobs) {
    const scrapeData = await ScrapeData.findOne(
      { jobId: job.attrs.data.jobId },
      { data: 1, _id: 0 }
    );
    jobProductCounts[job.attrs.data.jobId] = scrapeData.data.length; // Store product count per job
    allProducts = allProducts.concat(scrapeData.data);
  }
  allProducts = allProducts.map((product) => {
    product.source = getSourceFromUrl(product.url);
    return normalizeVariantKey(product);
  });
  console.log(`Total products loaded: ${allProducts.length}`);

  allProducts = allProducts.filter((product) => product.title);

  const brandSet = new Set(allProducts.map((p) => p.brand).filter(Boolean));
  allProducts = allProducts
    .map((product) => {
      try {
        if (!product.brand) {
          const inferredBrand = extractBrandFromTitle(product.title, brandSet);
          if (inferredBrand) product.brand = inferredBrand;
        }
        product.cleanedTitle = cleanText(
          product.title,
          product.brand,
          product.source
        );
        return product;
      } catch (error) {
        console.error('Error processing product:', product, 'job:', job, error);
        return null;
      }
    })
    .filter(Boolean);
  // normalize to produce a single array of products in `groups/:groupId/normalizedProducts.json`
  let normalizedProducts = [];
  allProducts.forEach((product) => {
    try {
      // Check for pincode presence before processing
      if (
        !('pincode' in product) ||
        product.pincode === undefined ||
        product.pincode === null
      ) {
        console.error("Product missing 'pincode':", {
          title: product.title,
          source: product.source,
          brand: product.brand,
          // filePath: product.filePath,
          fullProduct: product // Log the entire product for full context
        });
        return; // Skip this product entirely
      }

      if (product.variant && Array.isArray(product.variant)) {
        // Skip products with mrp = 0
        if (
          product.variant.some((variant) => ensureNumber(variant.mrp) === 0)
        ) {
          return;
        }
        product.variant.forEach((variant) => {
          normalizedProducts.push({
            title: product.title,
            cleanedTitle: product.cleanedTitle,
            quantity: variant.quantity,
            mrp: ensureNumber(variant.mrp),
            price: ensureNumber(variant.price),
            articleId: variant.articleId,
            url: variant.variantUrl,
            imageUrl: product.imageUrl,
            pincode: product.pincode,
            source: product.source,
            brand: product.brand || null
          });
        });
      } else {
        normalizedProducts.push(product);
      }
    } catch (error) {
      console.error('Error normalizing product:', product, error);
    }
  });

  try {
    const jsonString = JSON.stringify(normalizedProducts, null, 2);
    const filePath = path.join(folderPath, 'normalizedProducts.json');
    await fs.mkdir(folderPath, { recursive: true }); // ensures the path exists
    await fs.writeFile(filePath, jsonString, 'utf8');
    console.log('Normalized product data saved to normalizedProducts.json');
    return folderPath;
  } catch (error) {
    console.error('Error saving JSON file:', error);
  }
}

function normalizeVariantKey(product) {
  if (product.variants && !product.variant) {
    product.variant = product.variants;
    delete product.variants;
  }
  return product;
}
function extractBrandFromTitle(title, brandSet) {
  for (const brand of brandSet) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

function cleanText(title, brand) {
  if (!title) return '';

  let cleanedTitle = title.toLowerCase();

  // Remove quantities like "250 Gm", "500 Gm", "1 Ltr", "combo of 6", etc.
  const quantityPattern =
    /\d+\s*(?:g|kg|mg|ml|l|ltr|litre|litres|liter|liters|gm|gram|grams|gr|gms|kilogram|kilograms|kgs|milligram|milliliters|millilitres|combo\s*of\s*\d+)\b/gi;
  cleanedTitle = cleanedTitle.replace(quantityPattern, '');

  // Remove numeric values like "pack X 2", "2x", "3-pack", etc.
  const numericPattern =
    /\b\d+\s*(?:x|\*)\s*\d+\b|\b\d+\s*-\s*pack\b|\b\d+\s*pack\b/gi;
  cleanedTitle = cleanedTitle.replace(numericPattern, '');

  // Remove unwanted terms like "pouch", "jar", "can", "tin", "liters", "liter", etc.
  const unwantedTerms = [
    'pouch',
    'jar',
    'can',
    'tin',
    'bottle',
    'box',
    'pack',
    'sachet',
    'container',
    'bag',
    'carton',
    'bundle',
    'unit',
    'piece',
    'pieces',
    'strip',
    'roll',
    'sheet',
    'liters',
    'liter' // Added "liters" and "liter"
  ];
  unwantedTerms.forEach((term) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    cleanedTitle = cleanedTitle.replace(regex, '');
  });

  // Remove brand name if present
  if (brand) {
    const brandRegex = new RegExp(`\\b${brand}\\b`, 'gi');
    cleanedTitle = cleanedTitle.replace(brandRegex, '');
  }

  // Remove special characters and extra spaces
  cleanedTitle = cleanedTitle
    .replace(/\|/g, ' ')
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common filler words
  const fillerWords = /\b(a|an|the|with|and|or|for|in|on|by|at|to|from|of)\b/g;
  cleanedTitle = cleanedTitle
    .replace(fillerWords, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove any remaining numeric values
  const remainingNumericPattern = /\b\d+\b/g;
  cleanedTitle = cleanedTitle
    .replace(remainingNumericPattern, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove multiplication signs like "X" or "x"
  const multiplicationSignPattern = /\b(?:x|x)\b/gi;
  cleanedTitle = cleanedTitle
    .replace(multiplicationSignPattern, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanedTitle;
}

function ensureNumber(value) {
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function getSourceFromUrl(url) {
  const sources = [
    'BigBasket',
    'Blinkit',
    'Dmart',
    'JioMart',
    'Swiggy',
    'ZeptoNow'
  ];

  for (const source of sources) {
    if (url.toLowerCase().includes(source.toLowerCase())) {
      return source;
    }
  }

  return null;
}

/**
 * Runs the Python product matcher script with a folder path.
 * @param {string} folderPath - Absolute or relative path to the folder.
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function runProductMatcher(folderPath) {
  const scriptPath = path.join(__dirname, 'main.py');
  const venvPython = path.join(__dirname, 'venv', 'bin', 'python');

  try {
    const { stdout, stderr } = await execFileAsync(venvPython, [
      scriptPath,
      folderPath
    ]);
    if (stderr) {
      console.error('⚠️ Python stderr:', stderr);
    }
    console.log('✅ Python stdout:', stdout);
    return { stdout, stderr };
  } catch (error) {
    console.error('❌ Error running script:', error);
    throw error;
  }
}
