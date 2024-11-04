import Agenda from 'agenda';

// Setup Agenda
const agenda = new Agenda({
  db: { address: process.env.DB_URL, collection: 'agendaJobs' }
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
