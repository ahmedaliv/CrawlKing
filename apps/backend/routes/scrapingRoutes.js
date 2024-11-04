import express from 'express';
import ScrapeData from '../models/ScrapeData.js'; // Adjust path if necessary
import agenda from '../config/agenda.js'; // Adjust path if necessary
import moment from 'moment-timezone';
import { uuid } from 'uuidv4';

const router = express.Router();

router.post('/scrape', async (req, res) => {
  const { url, pincode, schedulingTime, recurring, repeatInterval } = req.body;

  if (!url || !pincode) {
    return res.status(400).json({ error: 'URL and pincode are required' });
  }

  try {
    const jobId = uuid();
    let type = 'immediate';

    if (schedulingTime && !recurring) {
      console.log(`Scheduling scrape for ${url} at ${schedulingTime}`);
      type = 'scheduled';
      await agenda.schedule(schedulingTime, 'scrape job', {
        jobId,
        url,
        pincode,
        type
      });
      return res.json({
        message: 'Job scheduled successfully',
        jobId,
        jobType: type
      });
    } else if (recurring && repeatInterval) {
      // For recurring jobs
      console.log(
        `Creating recurring scrape for ${url} with interval ${repeatInterval}`
      );
      type = 'recurring';

      // Parse schedulingTime using moment.js to get the exact time
      const scheduledMoment = moment(schedulingTime);

      // Extract time components
      const hour = scheduledMoment.format('HH'); // 24-hour format hour
      const minute = scheduledMoment.format('mm'); // minute

      // Schedule based on repeatInterval value
      if (repeatInterval === 'daily') {
        // Every day at the specific hour and minute
        await agenda.every(`0 ${minute} ${hour} * * *`, 'scrape job', {
          jobId,
          url,
          pincode,
          type
        });
      } else if (repeatInterval === 'weekly') {
        const dayOfWeek = scheduledMoment.format('d'); // 0 (Sunday) to 6 (Saturday)

        // Every week on the specific day and time
        await agenda.every(
          `0 ${minute} ${hour} * * ${dayOfWeek}`,
          'scrape job',
          {
            jobId,
            url,
            pincode,
            type
          }
        );
      } else if (repeatInterval === 'monthly') {
        const dayOfMonth = scheduledMoment.format('D'); // Day of the month, 1-31

        // Every month on the specific day and time
        await agenda.every(
          `0 ${minute} ${hour} ${dayOfMonth} * *`,
          'scrape job',
          {
            jobId,
            url,
            pincode,
            type
          }
        );
      }

      return res.json({
        message: 'Recurring job created successfully',
        jobId,
        jobType: type
      });
    } else {
      // Immediate scrape
      console.log(`Starting immediate scrape for ${url}`);
      type = 'immediate';
      await agenda.now('scrape job', {
        jobId,
        url,
        pincode,
        type
      });
      return res.json({
        message: `Scraping started for ${url}`,
        jobId,
        jobType: type
      });
    }
  } catch (error) {
    console.error('Error scraping:', error);
    return res.status(500).json({ error: 'Error scraping' });
  }
});

// Endpoint to check the status of the scrape
router.get('/status/:jobId', async (req, res) => {
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

    const response = {
      jobId,
      status,
      recurrence: repeatInterval || null,
      nextRunAt: repeatInterval ? nextRunAt : null,
      completedTime: status === 'completed' ? lastFinishedAt : null
    };

    // Include fail count and reason only if the status is 'failed'
    if (jobData.failCount && status !== 'completed') {
      response.failCount = jobData.failCount || 0;
      response.failReason = jobData.failReason || null;
      response.failedAt = jobData.failedAt || null;
    }
    
    return res.json(response);
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ error: 'Error getting status' });
  }
});

// Endpoint to download scraped data
router.get('/download/:jobId', async (req, res) => {
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

// Endpoint to stop a job
router.post('/stop/', async (req, res) => {
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

// Endpoint to list all jobs
router.get('/jobs', async (req, res) => {
  try {
    const agendaJobs = await agenda.jobs({}, { lastRunAt: -1 });
    const jobs = agendaJobs.map((job) => {
      const jobData = job.attrs.data;
      let nextRunAt = job.attrs.nextRunAt;
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

      if ((jobData.type === 'immediate' || jobData.type === 'scheduled') && status === 'completed') {
        nextRunAt = null;
      }

      return {
        jobId: jobData.jobId,
        url: jobData.url,
        pincode: jobData.pincode,
        status,
        type: jobData.type,
        repeatInterval: repeatInterval || null,
        nextRunAt: nextRunAt || null,
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

export default router;
