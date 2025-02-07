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
      await agenda
        .create('scrape job', {
          jobId,
          url,
          pincode,
          type
        })
        .unique({ url, pincode, schedulingTime }) // Ensure uniqueness
        .schedule(schedulingTime)
        .save();

      return res.json({
        message: 'Job scheduled successfully',
        jobId,
        jobType: type
      });
    } else if (recurring && repeatInterval) {
      console.log(
        `Creating recurring scrape for ${url} with interval ${repeatInterval}`
      );
      type = 'recurring';

      const scheduledMoment = moment(schedulingTime);
      const hour = scheduledMoment.format('HH');
      const minute = scheduledMoment.format('mm');
      
      let interval = '';

      if (repeatInterval === 'daily') {
        interval = `0 ${minute} ${hour} * * *`;
      } else if (repeatInterval === 'weekly') {
        const dayOfWeek = scheduledMoment.format('d');
        interval = `0 ${minute} ${hour} * * ${dayOfWeek}`;
      } else if (repeatInterval === 'monthly') {
        const dayOfMonth = scheduledMoment.format('D');
        interval = `0 ${minute} ${hour} ${dayOfMonth} * *`;
      }

      await agenda
        .create('scrape job', {
          jobId,
          url,
          pincode,
          type
        })
        .unique({ url, pincode, interval }) // Ensure uniqueness
        .repeatEvery(interval,{
          timezone: 'Asia/Kolkata'
        })
        .save();

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
