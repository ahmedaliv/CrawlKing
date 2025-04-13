import express from 'express';
import agenda from '../config/agenda.js'; // Adjust path if necessary
import moment from 'moment-timezone';
import { v4 as uuid } from 'uuid';

/**
 * can schedule a scrape job or a group
 */
async function scheduleScrape(
  res,
  schedulingTime,
  recurring,
  repeatInterval,
  scrapeType,
  scrapeData
) {
  try {
    const jobId = uuid();
    let type = 'immediate';

    if (schedulingTime && !recurring) {
      console.log(`Scheduling scrape for ${scrapeData} at ${schedulingTime}`);
      type = 'scheduled';
      await agenda
        .create(scrapeType, { ...scrapeData, jobId, type })
        .unique({ ...scrapeData, schedulingTime }) // Ensure uniqueness
        .schedule(schedulingTime)
        .save();

      return res.json({
        message: 'Job scheduled successfully',
        jobId,
        jobType: type
      });
    } else if (recurring && repeatInterval) {
      console.log(
        `Creating recurring scrape for ${scrapeData} with interval ${repeatInterval}`
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
        .create(scrapeType, { ...scrapeData, jobId, type })
        .unique({ ...scrapeData, interval }) // Ensure uniqueness
        .repeatEvery(interval, {
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
      console.log(`Starting immediate scrape for ${scrapeData}`);
      type = 'immediate';
      const jj = await agenda.now(scrapeType, { ...scrapeData, jobId, type });
      return res.json({
        message: `Scraping started for ${scrapeData}`,
        jobId,
        jobType: type
      });
    }
  } catch (error) {
    console.error('Error scraping:', error);
    return res.status(500).json({ error: 'Error scraping' });
  }
}

const router = express.Router();

router.post('/scrape', async (req, res) => {
  const { url, pincode, schedulingTime, recurring, repeatInterval } = req.body;

  if (!url || !pincode) {
    return res.status(400).json({ error: 'URL and pincode are required' });
  }
  return scheduleScrape(
    res,
    schedulingTime,
    recurring,
    repeatInterval,
    'scrape job',
    { url, pincode }
  );
});

router.post('/scrape-group', async (req, res) => {
  const { urls, pincode, schedulingTime, recurring, repeatInterval } = req.body;

  if (!urls || !pincode) {
    return res.status(400).json({ error: 'URL and pincode are required' });
  }
  return scheduleScrape(
    res,
    schedulingTime,
    recurring,
    repeatInterval,
    'scrape group',
    { urls, pincode }
  );
});

export default router;
