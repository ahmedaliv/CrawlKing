import { main as scrapeDMart } from '../spiders/scrapeDMart.js';
import { main as scrapeJioMart } from '../spiders/scrapeJioMart.js';
import { main as scrapeBigBasket } from '../spiders/scrapeBigBasket.js';
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
    default:
      throw new Error(`No scraper found for URL: ${url}`);
  }
};
export default function defineScrapeJob(agenda) {
  agenda.define('scrape job', async (job) => {
    const { url, pincode, jobId, type } = job.attrs.data;

    try {
      const scraper = getScraper(url);
      const scrapedData = await scraper(job, jobId, url, pincode);
      console.log(`Starting scrape for ${url} at pincode ${pincode}`);
      if (
        !scrapedData ||
        !Array.isArray(scrapedData) ||
        scrapedData.length < 1
      ) {
        throw new Error('Scraped data is invalid or empty');
      }
      // Save scraped data to the database
      const scrapeResult = { jobId, data: scrapedData[0] };
      const savedScrape = new ScrapeData(scrapeResult);
      await savedScrape.save();

      console.log(`job attrs from scrapejob ${job.attrs.data}`);
      // Update job status
      job.attrs.data.status = 'completed';
      job.attrs.data.fileName = scrapedData[1];
      await job.save();
      console.log(`Scraping completed for ${url}`);
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
