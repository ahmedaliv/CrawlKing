import Agenda from 'agenda';
import { configDotenv } from 'dotenv';
// Setup Agenda
configDotenv();
const agenda = new Agenda({
  db: { address: process.env.DB_URL, collection: 'agendaJobs' },
  processEvery: '30 seconds',
  maxConcurrency: 2,
  defaultLockLifetime: 2 * 60 * 60 * 1000 // 2 hours
});

agenda.on('ready', () => {
  console.log('Agenda is ready to process jobs');
});

agenda.on('error', (error) => {
  console.error('Agenda encountered an error:', error);
});

import defineScrapeJob, { defineScrapeGroup } from '../jobs/scrapeJob.js';
// Define all jobs here
defineScrapeJob(agenda); // Load the scrape job
defineScrapeGroup(agenda); // Load the scrape job

export default agenda;
