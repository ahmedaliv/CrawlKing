import fs from 'fs';
import path from 'path';
const __dirname = path.resolve();
const jobsDir = path.join(__dirname, 'jobs');
const indexFilepath = path.join(jobsDir, 'index.json');
export function checkFileExists(file) {
  return fs.promises.access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}
export function getIndex() {
  return global.index;
}
export const readIndexFile = async () => {
  try {
    if (await checkFileExists(indexFilepath)) {
      const indexData = await fs.promises.readFile(indexFilepath, 'utf8');
      return JSON.parse(indexData);
    } else {
      // if the index does not exist create an empty one and return empty object
      await writeIndexFile({});
      return {};
    }
  } catch (error) {
    console.error('Error reading index file:', error);
    throw new Error('Error reading index file');
  }
};

export const writeIndexFile = async (index) => {
  try {
    if (!await checkFileExists(jobsDir)) {
      await fs.promises.mkdir(jobsDir, { recursive: true });
    }
    await fs.promises.writeFile(indexFilepath, JSON.stringify(index));
  } catch (error) {
    console.error('Error writing index file:', error);
    throw new Error('Error writing index file');
  }
};
