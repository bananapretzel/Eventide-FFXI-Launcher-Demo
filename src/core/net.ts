import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { get } from 'https';
import { IncomingMessage } from 'http';
import log from 'electron-log';
import chalk from 'chalk';

export async function fetchJson<T>(url: string): Promise<T> {
  log.info(chalk.cyan(`[fetchJson] Fetching: ${url}`));
  const res = await fetch(url);
  if (!res.ok) {
    log.error(chalk.red(`[fetchJson] Failed to fetch ${url}: HTTP ${res.status}`));
    throw new Error(`Failed to fetch: ${url} (status: ${res.status})`);
  }
  try {
    const data = await res.json() as T;
    log.info(chalk.green(`[fetchJson] Successfully fetched and parsed JSON from ${url}`));
    return data;
  } catch (err) {
    const text = await res.text();
    log.error(chalk.red(`[fetchJson] Failed to parse JSON from ${url}. Status: ${res.status}`));
    log.error(chalk.red(`[fetchJson] Response text: ${text.substring(0, 200)}...`));
    throw new Error(`fetchJson: Failed to parse JSON from ${url}. Status: ${res.status}. Error: ${err}`);
  }
}

export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (dl: number, total: number) => void,
  _redirectCount = 0,
  _retryCount = 0,
  expectedSize?: number
): Promise<void> {
  const MAX_REDIRECTS = 10;
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second

  if (_redirectCount === 0 && _retryCount === 0) {
    log.info(chalk.cyan(`[downloadFile] Starting download from: ${url}`));
    log.info(chalk.cyan(`[downloadFile] Destination: ${dest}`));
    if (expectedSize) {
      log.info(chalk.cyan(`[downloadFile] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`));
    }
  }

  return new Promise((resolve, reject) => {
    get(url, (res: IncomingMessage) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        if (_redirectCount >= MAX_REDIRECTS) {
          log.error(chalk.red(`[downloadFile] Too many redirects (${MAX_REDIRECTS}) for URL: ${url}`));
          return reject(new Error(`Too many redirects for URL: ${url}`));
        }
        const location = res.headers.location;
        if (!location) {
          log.error(chalk.red(`[downloadFile] Redirect with no Location header for: ${url}`));
          return reject(new Error(`Redirect with no Location header for URL: ${url}`));
        }
        log.info(chalk.yellow(`[downloadFile] Following redirect to: ${location}`));
        // Recursively follow the redirect
        return resolve(downloadFile(location, dest, onProgress, _redirectCount + 1, _retryCount, expectedSize));
      }
      if (res.statusCode !== 200) {
        log.error(chalk.red(`[downloadFile] HTTP ${res.statusCode} for URL: ${url}`));
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      log.info(chalk.cyan(`[downloadFile] Download size: ${(total / 1024 / 1024).toFixed(2)} MB`));

      // Verify expected size if provided
      if (expectedSize && total !== expectedSize) {
        log.error(chalk.red(`[downloadFile] Size mismatch! Expected: ${expectedSize}, Got: ${total}`));
        return reject(new Error(`Size mismatch: expected ${expectedSize} bytes, got ${total} bytes`));
      }

      let dl = 0;
      const file = createWriteStream(dest);

      // Emit initial progress (0 bytes)
      if (onProgress) {
        onProgress(dl, total);
      }
      res.on('data', chunk => {
        dl += chunk.length;
        onProgress?.(dl, total);
      });
      res.pipe(file);
      file.on('finish', () => {
        // Emit final progress (total bytes)
        if (onProgress && dl < total) {
          onProgress(total, total);
        }
        log.info(chalk.green(`[downloadFile] ✓ Download complete: ${dest}`));
        file.close(err => err ? reject(err) : resolve());
      });
      file.on('error', (err) => {
        log.error(chalk.red('[downloadFile] File write error:'), err);
        reject(err);
      });
    }).on('error', (err) => {
      log.error(chalk.red(`[downloadFile] Network error (attempt ${_retryCount + 1}/${MAX_RETRIES + 1}):`, err));

      // Retry with exponential backoff
      if (_retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, _retryCount);
        log.warn(chalk.yellow(`[downloadFile] Retrying in ${delay}ms...`));
        setTimeout(() => {
          resolve(downloadFile(url, dest, onProgress, _redirectCount, _retryCount + 1, expectedSize));
        }, delay);
      } else {
        log.error(chalk.red(`[downloadFile] All retries exhausted. Download failed.`));
        reject(err);
      }
    });
  });
}
