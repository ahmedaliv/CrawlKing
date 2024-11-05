import express from 'express';
import agenda from '../config/agenda.js';
import ScrapeData from '../models/ScrapeData.js';

const router = express.Router();

// Endpoint to check the status of a job
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
    const progress = job[0].attrs.data.progress || 0;
    const totalProducts = job[0].attrs.data.total_products || "unknown";

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
      progress,
      totalProducts,
      recurrence: repeatInterval || null,
      nextRunAt: repeatInterval ? nextRunAt : null,
      completedTime: status === 'completed' ? lastFinishedAt : null,
      failCount: jobData.failCount || 0,
      failReason: jobData.failReason || null,
      failedAt: jobData.failedAt || null
    };

    return res.json(response);
  } catch (error) {
    console.error('Error getting status:', error);
    return res.status(500).json({ error: 'Error getting status' });
  }
});

// Endpoint to stop a job
router.post('/stop', async (req, res) => {
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
router.get('/', async (req, res) => {
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
      } else if (jobData.status === 'failed') {
        status = 'failed';
      } else {
        status = 'running';
      }

      if (
        (jobData.type === 'immediate' || jobData.type === 'scheduled') &&
        status === 'completed'
      ) {
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

// Endpoint to download scraped data
router.get('/download/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const scrapeData = await ScrapeData.findOne({ jobId });
    // get also data from the agendajobs collection
    const job = await agenda.jobs({ 'data.jobId': jobId });
    const fileName = job[0]?.attrs?.data?.fileName || `data-${jobId}.json`;

    // Convert data to JSON string for file download

    if (!scrapeData) {
      return res.status(404).json({ error: 'Data not found' });
    }
    const dataToDownload = JSON.stringify(scrapeData, null, 2);

    // Set headers to indicate a file download with specified filename
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Send the file content
    return res.json(dataToDownload);
  } catch (error) {
    console.error('Error downloading data:', error);
    return res.status(500).json({ error: 'Error downloading data' });
  }
});

export default router;
