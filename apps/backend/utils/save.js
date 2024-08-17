import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';

export async function appendToJsonFile(filePath, newData) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it with an initial array
        await fs.writeFile(filePath, JSON.stringify([newData], null, 2));
        return;
      }
      throw error;
    }

    if (stats.size === 0) {
      // File is empty, create it with an initial array
      await fs.writeFile(filePath, JSON.stringify([newData], null, 2));
      return;
    }

    // File exists and has content
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath, {
        flags: 'r+',
        start: stats.size - 1
      });

      stream.write(stats.size > 2 ? ',' : '');
      stream.write('\n');
      stream.write(JSON.stringify(newData, null, 2));
      stream.write('\n]');

      stream.end(() => {
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error appending to JSON file:', error);
    throw error;
  }
}