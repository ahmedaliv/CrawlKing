import cors from 'cors';
import { configDotenv } from 'dotenv';
import express from 'express';
import moment from 'moment-timezone';
import agenda from './config/agenda.js';
import { connectDatabase } from './config/database.js';
import authMiddleware from './middlewares/authMiddleware.js';
import errorMiddleware from './middlewares/errorMiddleware.js';
import userRoutes from './routes/userRoutes.js';
import scrapingRoutes from './routes/scrapingRoutes.js';

// Load environment variables from .env file
configDotenv();

// Set the default time zone to Indian Standard Time (IST)
moment.tz.setDefault('Asia/Kolkata');

const app = express();
app.use(express.json({ limit: '100mb' }));
// cors
app.use(
  cors({
    origin: process.env.FRONTEND_URL
  })
);
await connectDatabase();
// Routes
app.use('/api/users', userRoutes);

app.use('/api', scrapingRoutes);

app.get('/api/validate-token', authMiddleware, (req, res) => {
  res.status(200).json({ message: 'Token is valid', user: req.user });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('Server is running on port 3000');
  // connect to the database
  await agenda.start();
});

// Graceful shutdown
// process.on('SIGINT', async () => {
//   console.log('Shutting down server...');
//   await agenda.stop();
//   process.exit(0);
// });
