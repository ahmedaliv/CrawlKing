import mongoose from 'mongoose';

// Define the schema for scraped data
const scrapedDataSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true },
    data: { type: Array, required: true },
  },
  { timestamps: true }
);

// Create the model from the schema
const ScrapeData = mongoose.model('ScrapeData', scrapedDataSchema);

export default ScrapeData;
