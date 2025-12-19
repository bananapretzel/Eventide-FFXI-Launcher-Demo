import { createWriteStream, statSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { get } from 'https';
import { IncomingMessage } from 'http';
import log from 'electron-log';
import chalk from 'chalk';

// AbortController for managing download cancellation/pause
let currentDownloadController: AbortController | null = null;

export function getDownloadController(): AbortController | null {
  return currentDownloadController;
}

export function createDownloadController(): AbortController {
  currentDownloadController = new AbortController();
  return currentDownloadController;
}

export function abortDownload(): void {
  if (currentDownloadController) {
    currentDownloadController.abort();
    currentDownloadController = null;
  }
}

export function clearDownloadController(): void {
  currentDownloadController = null;
}

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

export interface ResumableDownloadResult {
  completed: boolean;
  bytesDownloaded: number;
  totalBytes: number;
  wasPaused: boolean;
  error?: string;
}

/**
 * Download a file with support for pause/resume functionality.
 * Uses HTTP Range requests to resume from where a previous download left off.
 *
 * @param url - The URL to download from
 * @param dest - The destination file path
 * @param startByte - Byte position to resume from (0 for new download)
 * @param expectedSize - Expected total file size
 * @param onProgress - Progress callback (bytesDownloaded, totalBytes)
 * @param signal - AbortSignal for cancellation/pause
 * @returns Result with completion status and bytes downloaded
 */
export async function downloadFileResumable(
  url: string,
  dest: string,
  startByte: number = 0,
  expectedSize?: number,
  onProgress?: (dl: number, total: number) => void,
  signal?: AbortSignal,
  _redirectCount = 0
): Promise<ResumableDownloadResult> {
  const MAX_REDIRECTS = 10;

  if (_redirectCount === 0) {
    log.info(chalk.cyan(`[downloadFileResumable] Starting resumable download from: ${url}`));
    log.info(chalk.cyan(`[downloadFileResumable] Destination: ${dest}`));
    log.info(chalk.cyan(`[downloadFileResumable] Starting from byte: ${startByte}`));
    if (expectedSize) {
      log.info(chalk.cyan(`[downloadFileResumable] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`));
    }
  }

  return new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      log.info(chalk.yellow(`[downloadFileResumable] Download was already aborted/paused`));
      return resolve({
        completed: false,
        bytesDownloaded: startByte,
        totalBytes: expectedSize || 0,
        wasPaused: true,
      });
    }

    // Build request options with Range header for resuming
    const urlObj = new URL(url);
    const options: any = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {} as Record<string, string>,
    };

    // Add Range header if resuming
    if (startByte > 0) {
      options.headers['Range'] = `bytes=${startByte}-`;
      log.info(chalk.cyan(`[downloadFileResumable] Requesting Range: bytes=${startByte}-`));
    }

    const req = get(url, options, (res: IncomingMessage) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        if (_redirectCount >= MAX_REDIRECTS) {
          log.error(chalk.red(`[downloadFileResumable] Too many redirects (${MAX_REDIRECTS})`));
          return reject(new Error(`Too many redirects for URL: ${url}`));
        }
        const location = res.headers.location;
        if (!location) {
          log.error(chalk.red(`[downloadFileResumable] Redirect with no Location header`));
          return reject(new Error(`Redirect with no Location header for URL: ${url}`));
        }
        log.info(chalk.yellow(`[downloadFileResumable] Following redirect to: ${location}`));
        // Recursively follow the redirect
        return resolve(
          downloadFileResumable(location, dest, startByte, expectedSize, onProgress, signal, _redirectCount + 1)
        );
      }

      // Handle response codes
      // 200 = full content (server doesn't support Range or startByte was 0)
      // 206 = partial content (resuming)
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        log.error(chalk.red(`[downloadFileResumable] HTTP ${res.statusCode} for URL: ${url}`));
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      // Determine total size and starting position
      let total: number;
      let currentByte: number;

      if (res.statusCode === 206) {
        // Partial content - parse Content-Range header
        const contentRange = res.headers['content-range'];
        if (contentRange) {
          // Format: "bytes start-end/total"
          const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
          if (match) {
            currentByte = parseInt(match[1], 10);
            total = parseInt(match[3], 10);
            log.info(chalk.cyan(`[downloadFileResumable] Resuming from byte ${currentByte} of ${total}`));
          } else {
            currentByte = startByte;
            total = expectedSize || parseInt(res.headers['content-length'] || '0', 10) + startByte;
          }
        } else {
          currentByte = startByte;
          total = expectedSize || parseInt(res.headers['content-length'] || '0', 10) + startByte;
        }
      } else {
        // Full content (200) - server doesn't support Range or this is a fresh download
        currentByte = 0;
        total = parseInt(res.headers['content-length'] || '0', 10);
        log.info(chalk.cyan(`[downloadFileResumable] Starting fresh download, total size: ${(total / 1024 / 1024).toFixed(2)} MB`));

        // If we expected to resume but got full content, and file exists, need to start over
        if (startByte > 0) {
          log.warn(chalk.yellow(`[downloadFileResumable] Server doesn't support Range requests, starting from beginning`));
        }
      }

      // Verify expected size if provided
      if (expectedSize && total !== expectedSize) {
        log.error(chalk.red(`[downloadFileResumable] Size mismatch! Expected: ${expectedSize}, Got: ${total}`));
        return reject(new Error(`Size mismatch: expected ${expectedSize} bytes, got ${total} bytes`));
      }

      let dl = currentByte;
      let fileEnded = false;
      // Use append mode if resuming with 206, otherwise overwrite
      const writeOptions = res.statusCode === 206 ? { flags: 'a' } : { flags: 'w' };
      const file = createWriteStream(dest, writeOptions);

      // Helper to safely end the file stream
      const safeEndFile = (callback?: () => void) => {
        if (!fileEnded && file.writable) {
          fileEnded = true;
          file.end(callback);
        } else if (callback) {
          callback();
        }
      };

      // Emit initial progress
      if (onProgress) {
        onProgress(dl, total);
      }

      // Handle abort signal
      const abortHandler = () => {
        log.info(chalk.yellow(`[downloadFileResumable] Download paused/aborted at ${dl} bytes`));
        req.destroy();
        // Wait for file to close before resolving to ensure bytes are flushed to disk
        safeEndFile(() => {
          resolve({
            completed: false,
            bytesDownloaded: dl,
            totalBytes: total,
            wasPaused: true,
          });
        });
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      res.on('data', chunk => {
        // Check if aborted
        if (signal?.aborted) {
          return;
        }
        dl += chunk.length;
        onProgress?.(dl, total);
      });

      // Use { end: false } to prevent auto-ending when response stream closes
      // This allows us to control when the file stream ends
      res.pipe(file, { end: false });

      // Manually end the file stream when response ends
      res.on('end', () => {
        // Only end if not already aborted
        if (!signal?.aborted) {
          safeEndFile();
        }
      });

      file.on('finish', () => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }

        // Check if we were aborted during write
        if (signal?.aborted) {
          return; // Already resolved in abortHandler
        }

        // Emit final progress
        if (onProgress && dl < total) {
          onProgress(total, total);
        }
        log.info(chalk.green(`[downloadFileResumable] ✓ Download complete: ${dest}`));
        file.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve({
              completed: true,
              bytesDownloaded: total,
              totalBytes: total,
              wasPaused: false,
            });
          }
        });
      });

      file.on('error', (err) => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        log.error(chalk.red('[downloadFileResumable] File write error:'), err);
        reject(err);
      });

      res.on('error', (err) => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        // Don't log or reject if this was an intentional abort/pause
        if (signal?.aborted) {
          log.info(chalk.yellow('[downloadFileResumable] Response closed due to pause/abort'));
          return; // Already resolved in abortHandler
        }
        log.error(chalk.red('[downloadFileResumable] Response error:'), err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      // Check if this was an intentional abort
      if (signal?.aborted) {
        log.info(chalk.yellow(`[downloadFileResumable] Request aborted (paused)`));
        return resolve({
          completed: false,
          bytesDownloaded: startByte,
          totalBytes: expectedSize || 0,
          wasPaused: true,
        });
      }
      log.error(chalk.red(`[downloadFileResumable] Network error:`, err));
      reject(err);
    });
  });
}

/**
 * Get the size of a partially downloaded file, if it exists.
 */
export function getPartialDownloadSize(filePath: string): number {
  try {
    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      return stats.size;
    }
  } catch (err) {
    log.warn(chalk.yellow(`[getPartialDownloadSize] Could not check file: ${err}`));
  }
  return 0;
}
