import express from 'express';
import agenda from '../config/agenda.js'; // Adjust path if necessary
import moment from 'moment-timezone';
import { v4 as uuid } from 'uuid';

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

export default router;
