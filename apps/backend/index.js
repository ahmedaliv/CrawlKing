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
// moment.tz.setDefault('Asia/Kolkata');

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
app.use('/api/jobs', authMiddleware, jobsRoutes);
app.use('/api', authMiddleware,scrapingRoutes);

app.get('/api/validate-token', authMiddleware, (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Step 1: Connect to the database
    await connectDatabase();
    console.log('Database connection established');

    // Step 2: Start Agenda
    await agenda.start();
    console.log('Agenda started successfully');

    // Step 3: Start the Express server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error during server startup:', error);
    process.exit(1); // Exit the process if there's an error
  }
};

// Start the server
startServer();
