import Agenda from 'agenda';
import { configDotenv } from 'dotenv';
// Setup Agenda
configDotenv();
const agenda = new Agenda({
  db: { address: process.env.DB_URL, collection: 'agendaJobs' },
  processEvery: '30 seconds',
  maxConcurrency: 5,
  defaultLockLifetime: 30 * 60 * 1000 // 30 minutes
});

agenda.on('ready', () => {
  console.log('Agenda is ready to process jobs');
});

agenda.on('error', (error) => {
  console.error('Agenda encountered an error:', error);
});

import defineScrapeJob from '../jobs/scrapeJob.js';
// Define all jobs here
defineScrapeJob(agenda); // Load the scrape job

export default agenda;
