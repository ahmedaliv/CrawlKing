import cors from 'cors';
import { CronJob } from 'cron';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { main as scrapeDMart } from './spiders/scrapeDMart.js';
import { main as scrapeJioMart } from './spiders/scrapeJioMart.js';
import {
  checkFileExists,
  getIndex,
  readIndexFile,
  writeIndexFile
} from './utils/caching.js';
import mongoose from 'mongoose';
import userRoutes from './users/userRoutes.js';
import authMiddleware from './users/authMiddleware.js';
import { configDotenv } from 'dotenv';

configDotenv();
const __dirname = path.resolve();
const jobsDir = path.join(__dirname, 'jobs');

export async function getStatus(jobId) {
  // check if in memory
  if (scrapeJobs[jobId]) {
    return scrapeJobs[jobId];
  }
  try {
    // check if the job exists
    const jobDir = path.join(jobsDir, jobId);
    const jobExists = await checkFileExists(jobDir);
    if (!jobExists) {
      return { error: 'Job not found' };
    }
    // read stats file and return it
    const statsFilepath = path.join(jobsDir, jobId, 'stats.json');
    const stats = await fs.readFile(statsFilepath, 'utf8');
    // add cached:true then return stats
    return { ...JSON.parse(stats), cached: true };
  } catch (error) {
    console.error('Error getting status, file not found');
    return { error: 'Error getting status' };
  }
}
export const scrapeJobs = {}; // In-memory storage for scrape statuses

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

app.post('/scrape', authMiddleware, async (req, res) => {
  const { url, pincode, fetchNew } = req.body;
  if (!url || !pincode) {
    return res.status(400).json({ error: 'URL and pincode are required' });
  }
  console.log(`Scraping ${url} for pincode ${pincode}`);
  const index = getIndex();
  try {
    const key = `${url}:${pincode}`;
    if (fetchNew) {
      const _index = ['dmart.in', 'jiomart.com'].findIndex((element) =>
        url.includes(element)
      );
      if (_index === -1) {
        return res.status(400).json({ error: 'Invalid URL' });
      }
      const jobId = url.includes('dmart.in')
        ? await scrapeDMart(url, pincode)
        : await scrapeJioMart(url, pincode);
      if (key in index) {
        try {
          // Delete from disk
          await fs.rm(`./jobs/${index[key]}`, {
            recursive: true,
            force: true
          });
          // Delete from memory too
          delete scrapeJobs[index[key]];
        } catch (deleteError) {
          console.error('Error deleting old job data:', deleteError);
          return res.status(500).json({ error: 'Error deleting old job data' });
        }
      }
      index[key] = jobId;
      await writeIndexFile(index);
      return res.json({
        jobId,
        age: {
          hours: 0,
          minutes: 0
        }
      });
    }

    if (index[key]) {
      console.log('getting from cache');
      const jobId = index[key];
      const jobFilepath = path.join(__dirname, 'jobs', jobId);

      // Get the creation time of the directory
      const stats = await fs.stat(jobFilepath);
      const creationTime = stats.birthtime;

      const timeDiff = Date.now() - creationTime.getTime();

      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

      return res.json({
        jobId,
        age: {
          hours,
          minutes
        }
      });
    } else {
      // return a job ID immediately to help the client check the status
      const _index = ['dmart.in', 'jiomart.com'].findIndex((element) =>
        url.includes(element)
      );
      if (_index === -1) {
        return res.status(400).json({ error: 'Invalid URL' });
      }
      const jobId = url.includes('dmart.in')
        ? await scrapeDMart(url, pincode)
        : await scrapeJioMart(url, pincode);
      index[key] = jobId;
      await writeIndexFile(index);
      return res.json({
        jobId,
        age: {
          hours: 0,
          minutes: 0
        }
      });
    }
  } catch (error) {
    console.error('Scraping error:', error);
    return res.status(500).json({ error: 'An error occurred while scraping' });
  }
});
// Endpoint to check the status of the scrape
app.get('/status/:jobId', authMiddleware, async (req, res) => {
  const { jobId } = req.params;
  try {
    const status = await getStatus(jobId);
    return res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ error: 'Error getting status' });
  }
});

app.get('/download/:jobId', authMiddleware, async (req, res) => {
  const { jobId } = req.params;
  const index = getIndex();

  try {
    console.log('checking in memory jobs');
    // Get filename from stats
    const stats = await fs.readFile(`./jobs/${jobId}/stats.json`, 'utf8');
    const filename = (await JSON.parse(stats)).filename;
    // Check if scrapeJobs[jobId] is defined
    if (scrapeJobs[jobId]) {
      if (scrapeJobs[jobId].status !== 'completed') {
        return res.status(400).json({ error: 'Job is still in progress' });
      }
      return res.status(200).download(`./jobs/${jobId}/${filename}.json`);
    }

    // If not found in scrapeJobs, check the index
    console.log(index);
    if (!index[Object.keys(index).find((key) => index[key] === jobId)]) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.download(`./jobs/${jobId}/${filename}.json`, (err) => {
      if (err) {
        console.error(`Error downloading file for job ${jobId}:`, err);
        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(404).json({ error: 'Job data not found on disk' });
        }
      }
    });
  } catch (error) {
    console.log('An error occurred:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/stop/', authMiddleware, async (req, res) => {
  const { jobId } = req.body;
  const index = getIndex();
  console.log(`job with id ${jobId} is being stopped`);
  if (!scrapeJobs[jobId]) {
    return res.status(200).json({ error: 'job not found' });
  }
  if (scrapeJobs[jobId].status === 'completed') {
    return res.status(200).json({ error: 'Job already completed' });
  }
  scrapeJobs[jobId].status = 'cancelled';
  // clean up the job
  // delete from the index
  for (const key in index) {
    if (index[key] === jobId) {
      delete index[key];
    }
  }
  await writeIndexFile(index);
  // delete the job from the disk
  try {
    fs.rm(`./jobs/${jobId}`, {
      recursive: true,
      force: true
    });
  } catch (e) {
    console.error('Error deleting job from disk:', e);
    return res.status(500).json({
      error: 'Error deleting job from disk'
    });
  }
  return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('Server is running on port 3000');
  // read the index data when the app starts and save it in a global var to be used
  global.index = await readIndexFile();
  // connect to the database
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('Connected to the database');
  } catch (error) {
    console.error('Error connecting to the database:', error);
  }
});

// Cron job to delete old jobs every day at midnight
const deleteOldJobs = CronJob.from({
  cronTime: '0 0 * * *',
  onTick: async () => {
    try {
      console.log('Deleting old jobs');
      const jobs = await fs.readdir('./jobs');
      for (const job of jobs) {
        const { birthtime } = await fs.promises.stat(`./jobs/${job}`);
        const oneDay = 1000 * 60 * 60 * 24;
        if (Date.now() - new Date(birthtime).getTime() > oneDay) {
          // delete the job from in the in-memory DS
          delete scrapeJobs[job];
          await fs.promises.rm(`./jobs/${job}`, {
            recursive: true,
            force: true
          });

          // also delete the job from the index file
          const index = getIndex();
          for (const key in index) {
            if (index[key] === job) {
              delete index[key];
            }
          }
          await writeIndexFile(index);
        }
      }
    } catch (error) {
      console.error('Error deleting old jobs:', error);
    }
  },
  start: true
});

deleteOldJobs.start();

