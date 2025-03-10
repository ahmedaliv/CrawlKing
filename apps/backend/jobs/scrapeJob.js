import { main as scrapeDMart } from '../spiders/scrapeDMart.js';
import { main as scrapeJioMart } from '../spiders/scrapeJioMart.js';
import { main as scrapeBigBasket } from '../spiders/scrapeBigBasket.js';
import { main as scrapeBlinkit } from '../spiders/scrapeBlinkit.js';
import { main as scrapeZeptoNow } from '../spiders/scrapeZeptoNow.js';
import { main as scrapeSwiggy } from '../spiders/scrapeSwiggy.js';
import {main as scrapeFlipKart} from '../spiders/scrapeFlipKart.js';
import ScrapeData from '../models/ScrapeData.js'; // Import ScrapeData model

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
      if (type === 'recurring') {
        console.log(`resetting progress to 0`);
        job.attrs.data.progress = 0;
        job.attrs.data.lastRunStatus = 'completed';
        console.log('setting lastRunStatus to comp.');
      } else {
        job.attrs.data.lastRunStatus = null;
      }
      await job.save();
      console.log(
        `job attrs from scrapejob ${JSON.stringify(job.attrs.data, null, 2)}`
      );
    } catch (error) {
      console.error('Error during scraping job:', error);

      // Increment failCount and log the error
      job.attrs.data.failCount = (job.attrs.data.failCount || 0) + 1;
      job.attrs.data.failReason = error.message;
      job.attrs.data.failedAt = new Date();

      // Reschedule if max retries have not been reached
      if (job.attrs.data.failCount < MAX_RETRIES) {
        console.log(
          `Retrying job for ${url}, attempt ${job.attrs.data.failCount}`
        );
        await job.schedule('in 10 seconds'); // Adjust retry time as needed
        await job.save();
      } else {
        console.log(`Job failed for ${url}. Max retries reached.`);
        await job.fail(error.message);
        job.attrs.data.status = 'failed';
        await job.save();
      }
    }
  });
}
