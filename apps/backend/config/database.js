import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';

configDotenv(); // Load environment variables

export const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log(process.env.DB_URL)
    console.log('Connected to the database');
  } catch (error) {
    console.error('Error connecting to the database:', error);
    // process.exit(1); // Exit the application if database connection fails
  }
};
