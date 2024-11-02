import cors from 'cors';
import express from 'express';
import { main as scrapeDMart } from './spiders/scrapeDMart.js';
import { main as scrapeJioMart } from './spiders/scrapeJioMart.js';
import mongoose from 'mongoose';
import userRoutes from './users/userRoutes.js';
import authMiddleware from './users/authMiddleware.js';
import { configDotenv } from 'dotenv';
import Agenda from 'agenda';
import { uuid } from 'uuidv4';

configDotenv();

// MongoDB Schema for scraped data
const scrapedDataSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true },
    data: { type: Array }
  },
  { timestamps: true }
);

const ScrapeData = mongoose.model('ScrapeData', scrapedDataSchema);

// Setup Agenda
const agenda = new Agenda({
  db: { address: process.env.DB_URL, collection: 'agendaJobs' }
});

// Define the scraping job
const MAX_RETRIES = 3;
agenda.define('scrape job', async (job) => {
  const { url, pincode, jobId } = job.attrs.data;

  try {
    console.log(`Starting scrape for ${url} at pincode ${pincode}`);
    const scrapedData = url.includes('dmart.in')
      ? await scrapeDMart(jobId, url, pincode)
      : await scrapeJioMart(jobId, url, pincode);
    // Save scraped data to the database
    const scrapeResult = {
      jobId,
      data: scrapedData // Save the actual scraped data
    };

    const savedScrape = new ScrapeData(scrapeResult);
    await savedScrape.save();
    // update status
    job.attrs.data.status = 'completed';
    await job.save();
    console.log(`Scraping completed for ${url}`);
  } catch (error) {
    console.error('Error during scraping job:', error);

    // Increment failCount
    job.attrs.data.failCount = (job.attrs.data.failCount || 0) + 1; // Store in job data
    job.attrs.data.failReason = error.message; // Store the error message in job data
    job.attrs.data.failedAt = new Date(); // Store the time of failure in job data

    // If we have not reached the maximum number of retries, reschedule the job
    if (job.attrs.data.failCount < MAX_RETRIES) {
      console.log(`Retrying job for ${url}, attempt ${job.attrs.data.failCount}`);
      await job.schedule('in 10 seconds'); // Reschedule job to run again after 5 minutes
      await job.save();
    } else {
      console.log(`Job failed for ${url}. Max retries reached.`);
      await job.fail(error.message); // Mark job as failed
      // job.attrs.nextRunAt = null;
      job.attrs.data.status = 'failed';
      await job.save();
    }
  }
});

const app = express();
app.use(express.json({ limit: '100mb' }));
// cors
app.use(
  cors({
    origin: process.env.FRONTEND_URL
  })
);

app.get('/validate-token', authMiddleware, (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
});

app.use('/users', userRoutes);

app.post('/scrape', async (req, res) => {
  const { url, pincode, schedulingTime, recurrence } = req.body; // Added recurrence
  if (!url || !pincode) {
    return res.status(400).json({ error: 'URL and pincode are required' });
  }

  try {
    const jobId = uuid();

    if (schedulingTime) {
      console.log(`Scheduling scrape for ${url} at ${schedulingTime}`);
      await agenda.schedule(schedulingTime, 'scrape job', {
        jobId,
        url,
        pincode
      });
      return res.json({ message: 'Job scheduled successfully', jobId });
    } else if (recurrence) {
      // For recurring jobs
      console.log(`Creating recurring scrape for ${url} with recurrence ${recurrence}`);
      await agenda.every(recurrence, 'scrape job', {
        jobId,
        url,
        pincode
      });
      return res.json({ message: 'Recurring job created successfully', jobId });
    } else {
      // Immediate scrape
      console.log(`Starting immediate scrape for ${url}`);
      await agenda.now('scrape job', {
        jobId,
        url,
        pincode
      });
      return res.json({ jobId, message: `Scraping started for ${url}` });
    }
  } catch (error) {
    console.error('Error scraping:', error);
    return res.status(500).json({ error: 'Error scraping' });
  }
});

// Endpoint to check the status of the scrape

app.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await agenda.jobs({ 'data.jobId': jobId });

    if (!job || job.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobData = job[0].attrs.data;
    const nextRunAt = job[0].attrs.nextRunAt;
    const repeatInterval = job[0].attrs.repeatInterval;
    const lastFinishedAt = job[0].attrs.lastFinishedAt;
    let status;
    if (nextRunAt && nextRunAt > Date.now()) {
      status = 'queued';
    } else if (jobData.status === 'completed') {
      status = 'completed';
    } else if (jobData.status === 'failed') {
      status = 'failed';
    } else {
      status = 'running';
    }
    // console.log(`Job Data: ${JSON.stringify(job[0].attrs, null, 2)}`); // Pretty print with 2-space indentation

    const response = {
      jobId,
      status,
      recurrence: repeatInterval || null, // Include recurrence information
      nextRunAt: repeatInterval ? nextRunAt : null, // Set to null if not recurring
      completedTime: status === 'completed' ? lastFinishedAt : null
    };
    // Include fail count and fail reason only if the status is 'failed'
    if (jobData.failCount && status != 'completed') {
      response.failCount = job[0].attrs.data.failCount || 0;
      response.failReason = job[0].attrs.data.failReason || null;
      response.failedAt = job[0].attrs.data.failedAt || null;
    }
    return res.json(response);
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ error: 'Error getting status' });
  }
});

app.get('/download/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const scrapeData = await ScrapeData.findOne({ jobId });
    if (!scrapeData) {
      return res.status(404).json({ error: 'Data not found' });
    }
    return res.json(scrapeData);
  } catch (error) {
    console.error('Error downloading data:', error);
    return res.status(500).json({ error: 'Error downloading data' });
  }
});

app.post('/stop/', async (req, res) => {
  const { jobId } = req.body;
  try {
    const job = await agenda.jobs({ 'data.jobId': jobId });
    if (!job || job.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    await job[0].remove();
    return res.json({ message: 'Job stopped successfully' });
  } catch (error) {
    console.error('Error stopping job:', error);
    return res.status(500).json({ error: 'Error stopping job' });
  }
});

// now we want to make 2 endpoints
// one to list all the jobs with their status
// the other to list all the recurrent jobs scraped data to allow the user download them

// Endpoint to list all jobs
app.get('/jobs', async (req, res) => {
  try {
    // get agenda jobs sorted by time
    const agendaJobs = await agenda.jobs({}, { lastRunAt: -1 });
    /*
export type Job = {
  id: string;
  url: string;
  pincode: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  type: 'immediate' | 'scheduled' | 'recurring';
  repeatInterval: string;
  nextRunTime: string;
  completedAt: string;
  failedAt: string;
  failReason: string;
};
    */
    const jobs = agendaJobs.map((job) => {
      const jobData = job.attrs.data;
      const nextRunAt = job.attrs.nextRunAt;
      const repeatInterval = job.attrs.repeatInterval;
      const lastFinishedAt = job.attrs.lastFinishedAt;
      let status;
      if (nextRunAt && nextRunAt > Date.now()) {
        status = 'queued';
      } else if (jobData.status === 'completed') {
        status = 'completed';
        jobData.failedAt = null;
        jobData.failReason = null;
      } else if (jobData.status === 'failed') {
        status = 'failed';
      } else {
        status = 'running';
      }
      return {
        jobId: jobData.jobId,
        url: jobData.url,
        pincode: jobData.pincode,
        status,
        type: repeatInterval ? 'recurring' : 'immediate',
        repeatInterval: repeatInterval || null,
        nextRunTime: repeatInterval ? nextRunAt : null,
        completedAt: status === 'completed' ? lastFinishedAt : null,
        failedAt: jobData.failedAt || null,
        failReason: jobData.failReason || null
      };
    });
    return res.json(jobs);
  } catch (error) {
    console.error('Error getting jobs:', error);
    return res.status(500).json({ error: 'Error getting jobs' });
  }
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the error stack trace for debugging
  res.status(500).json({ error: 'Something went wrong!' }); // Send a consistent error response
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('Server is running on port 3000');
  // connect to the database
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('Connected to the database');
  } catch (error) {
    console.error('Error connecting to the database:', error);
  }
  await agenda.start();
});
