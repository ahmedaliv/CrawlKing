import cors from 'cors';
import { configDotenv } from 'dotenv';
import express from 'express';
import moment from 'moment-timezone';
import agenda from './config/agenda.js';
import { connectDatabase } from './config/database.js';
import authMiddleware from './middlewares/authMiddleware.js';
import errorMiddleware from './middlewares/errorMiddleware.js';
import userRoutes from './routes/users.js';
import scrapingRoutes from './routes/scrape.js';
import jobsRoutes from './routes/jobs.js';
// Load environment variables from .env file
configDotenv();

// Set the default time zone to Indian Standard Time (IST)
moment.tz.setDefault('Asia/Kolkata');

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '100mb' }));
// cors
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    exposedHeaders: ['Content-Disposition']
  })
);
// Routes
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api', scrapingRoutes);

app.get('/api/validate-token', authMiddleware, (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('Server is running on port 3000');
  // connect to the database
  await connectDatabase();
  await agenda.start();
});
