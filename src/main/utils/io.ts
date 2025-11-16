import fs from 'fs-extra';
import axios, { AxiosResponse } from 'axios';
import path from 'path';

/**
 * Fetch JSON from a remote URL.
 * @param url The URL to fetch.
 * @returns Parsed JSON data.
 * @throws Error if the request fails or response is not valid JSON.
 */
export async function fetchJson<T = any>(url: string): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios.get(url, { responseType: 'json' });
    return response.data;
  } catch (err: any) {
    if (err.response) {
      // eslint-disable-next-line no-console
      console.error(`[fetchJson] Axios error for ${url}. Status: ${err.response.status}. Data:`, err.response.data);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[fetchJson] Axios error for ${url}:`, err);
    }
    throw new Error(`fetchJson failed for ${url}: ${err?.message || err}`);
  }
}

/**
 * Download a file from a URL to a destination path.
 * @param url The URL to download from.
 * @param dest The destination file path.
 * @returns Promise that resolves when the file is written.
 */
export async function downloadToFile(url: string, dest: string): Promise<void> {
  const writer = fs.createWriteStream(dest);
  try {
    const response = await axios.get(url, { responseType: 'stream' });
    response.data.pipe(writer);
    return await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });
  } catch (err: any) {
    throw new Error(`downloadToFile failed for ${url} -> ${dest}: ${err?.message || err}`);
  }
}

/**
 * Read and parse a JSON file.
 * @param filePath Path to the JSON file.
 * @returns Parsed data, or undefined if file does not exist or is invalid.
 */
export function readJsonFile<T = any>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return fs.readJsonSync(filePath);
  } catch (err) {
    return undefined;
  }
}

/**
 * Write data to a JSON file.
 * @param filePath Path to write to.
 * @param data Data to serialize.
 * @returns True if successful, false otherwise.
 */
export function writeJsonFile(filePath: string, data: any): boolean {
  try {
    fs.writeJsonSync(filePath, data, { spaces: 2 });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get the absolute path to a resource in the app root.
 * @param filename The file name or relative path.
 * @returns Absolute path string.
 */
export function getRootPath(filename: string): string {
  return process.env.NODE_ENV === 'production'
    ? path.join(process.resourcesPath, filename)
    : path.join(__dirname, `../../../${filename}`);
}
