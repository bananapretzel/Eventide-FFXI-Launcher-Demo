import { createWriteStream, statSync, existsSync } from 'fs';
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
    log.error(
      chalk.red(`[fetchJson] Failed to fetch ${url}: HTTP ${res.status}`),
    );
    throw new Error(`Failed to fetch: ${url} (status: ${res.status})`);
  }
  try {
    const data = (await res.json()) as T;
    log.info(
      chalk.green(
        `[fetchJson] Successfully fetched and parsed JSON from ${url}`,
      ),
    );
    return data;
  } catch (err) {
    const text = await res.text();
    log.error(
      chalk.red(
        `[fetchJson] Failed to parse JSON from ${url}. Status: ${res.status}`,
      ),
    );
    log.error(
      chalk.red(`[fetchJson] Response text: ${text.substring(0, 200)}...`),
    );
    throw new Error(
      `fetchJson: Failed to parse JSON from ${url}. Status: ${res.status}. Error: ${err}`,
    );
  }
}

export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (dl: number, total: number) => void,
  expectedSize?: number,
  _redirectCount = 0,
  _retryCount = 0,
): Promise<void> {
  const MAX_REDIRECTS = 10;
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second

  if (_redirectCount === 0 && _retryCount === 0) {
    log.info(chalk.cyan(`[downloadFile] Starting download from: ${url}`));
    log.info(chalk.cyan(`[downloadFile] Destination: ${dest}`));
    if (expectedSize) {
      log.info(
        chalk.cyan(
          `[downloadFile] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`,
        ),
      );
    }
  }

  return new Promise((resolve, reject) => {
    get(url, (res: IncomingMessage) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        if (_redirectCount >= MAX_REDIRECTS) {
          log.error(
            chalk.red(
              `[downloadFile] Too many redirects (${MAX_REDIRECTS}) for URL: ${url}`,
            ),
          );
          reject(new Error(`Too many redirects for URL: ${url}`));
          return;
        }
        const { location } = res.headers;
        if (!location) {
          log.error(
            chalk.red(
              `[downloadFile] Redirect with no Location header for: ${url}`,
            ),
          );
          reject(new Error(`Redirect with no Location header for URL: ${url}`));
          return;
        }
        log.info(
          chalk.yellow(`[downloadFile] Following redirect to: ${location}`),
        );
        // Recursively follow the redirect
        resolve(
          downloadFile(
            location,
            dest,
            onProgress,
            expectedSize,
            _redirectCount + 1,
            _retryCount,
          ),
        );
        return;
      }
      if (res.statusCode !== 200) {
        log.error(
          chalk.red(`[downloadFile] HTTP ${res.statusCode} for URL: ${url}`),
        );
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      log.info(
        chalk.cyan(
          `[downloadFile] Download size: ${(total / 1024 / 1024).toFixed(2)} MB`,
        ),
      );

      // Verify expected size if provided
      if (expectedSize && total !== expectedSize) {
        log.error(
          chalk.red(
            `[downloadFile] Size mismatch! Expected: ${expectedSize}, Got: ${total}`,
          ),
        );
        reject(
          new Error(
            `Size mismatch: expected ${expectedSize} bytes, got ${total} bytes`,
          ),
        );
        return;
      }

      let dl = 0;
      const file = createWriteStream(dest);

      // Emit initial progress (0 bytes)
      if (onProgress) {
        onProgress(dl, total);
      }
      res.on('data', (chunk) => {
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
        file.close((err) => (err ? reject(err) : resolve()));
      });
      file.on('error', (err) => {
        log.error(chalk.red('[downloadFile] File write error:'), err);
        reject(err);
      });
    }).on('error', (err) => {
      log.error(
        chalk.red(
          `[downloadFile] Network error (attempt ${_retryCount + 1}/${MAX_RETRIES + 1}):`,
          err,
        ),
      );

      // Retry with exponential backoff
      if (_retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * 2 ** _retryCount;
        log.warn(chalk.yellow(`[downloadFile] Retrying in ${delay}ms...`));
        setTimeout(() => {
          resolve(
            downloadFile(
              url,
              dest,
              onProgress,
              expectedSize,
              _redirectCount,
              _retryCount + 1,
            ),
          );
        }, delay);
      } else {
        log.error(
          chalk.red(`[downloadFile] All retries exhausted. Download failed.`),
        );
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
  startByte: number,
  expectedSize?: number,
  onProgress?: (dl: number, total: number) => void,
  signal?: AbortSignal,
  _redirectCount = 0,
): Promise<ResumableDownloadResult> {
  const MAX_REDIRECTS = 10;
  const MAX_RETRIES = 5;
  const INITIAL_RETRY_DELAY_MS = 1000;
  const REQUEST_TIMEOUT_MS = 45_000;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const isRetryableNetworkError = (err: unknown): boolean => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    // Node sometimes reports dropped connections as just "aborted".
    return (
      msg.includes('aborted') ||
      msg.includes('socket hang up') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('eai_again') ||
      msg.includes('ehostunreach') ||
      msg.includes('enotfound') ||
      msg.includes('network')
    );
  };

  const downloadOnce = async (
    attemptUrl: string,
    attemptStartByte: number,
    redirectCount: number,
  ): Promise<ResumableDownloadResult> => {
    if (redirectCount === 0) {
      log.info(
        chalk.cyan(
          `[downloadFileResumable] Starting resumable download from: ${attemptUrl}`,
        ),
      );
      log.info(chalk.cyan(`[downloadFileResumable] Destination: ${dest}`));
      log.info(
        chalk.cyan(
          `[downloadFileResumable] Starting from byte: ${attemptStartByte}`,
        ),
      );
      if (expectedSize) {
        log.info(
          chalk.cyan(
            `[downloadFileResumable] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`,
          ),
        );
      }
    }

    return new Promise((resolve, reject) => {
      // Check if already aborted
      if (signal?.aborted) {
        log.info(
          chalk.yellow(
            `[downloadFileResumable] Download was already aborted/paused`,
          ),
        );
        resolve({
          completed: false,
          bytesDownloaded: attemptStartByte,
          totalBytes: expectedSize || 0,
          wasPaused: true,
        });
        return;
      }

      const urlObj = new URL(attemptUrl);
      const headers: Record<string, string> = {
        // Some CDNs behave better with an explicit UA.
        'User-Agent': 'EventideLauncher',
        Accept: '*/*',
      };

      // Add Range header if resuming
      if (attemptStartByte > 0) {
        headers.Range = `bytes=${attemptStartByte}-`;
        log.info(
          chalk.cyan(
            `[downloadFileResumable] Requesting Range: bytes=${attemptStartByte}-`,
          ),
        );
      }

      const req = get(
        urlObj,
        {
          method: 'GET',
          headers,
        },
        (res: IncomingMessage) => {
          // Handle redirects
          if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
            if (redirectCount >= MAX_REDIRECTS) {
              log.error(
                chalk.red(
                  `[downloadFileResumable] Too many redirects (${MAX_REDIRECTS})`,
                ),
              );
              reject(new Error(`Too many redirects for URL: ${attemptUrl}`));
              return;
            }
            const { location } = res.headers;
            if (!location) {
              log.error(
                chalk.red(
                  `[downloadFileResumable] Redirect with no Location header`,
                ),
              );
              reject(
                new Error(
                  `Redirect with no Location header for URL: ${attemptUrl}`,
                ),
              );
              return;
            }
            log.info(
              chalk.yellow(
                `[downloadFileResumable] Following redirect to: ${location}`,
              ),
            );
            resolve(downloadOnce(location, attemptStartByte, redirectCount + 1));
            return;
          }

          // Handle response codes
          // 200 = full content (server doesn't support Range or startByte was 0)
          // 206 = partial content (resuming)
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            log.error(
              chalk.red(
                `[downloadFileResumable] HTTP ${res.statusCode} for URL: ${attemptUrl}`,
              ),
            );
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          // Determine total size and starting position
          let total: number;
          let currentByte: number;

          if (res.statusCode === 206) {
            const contentRange = res.headers['content-range'];
            if (contentRange) {
              const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
              if (match) {
                currentByte = parseInt(match[1], 10);
                total = parseInt(match[3], 10);
                log.info(
                  chalk.cyan(
                    `[downloadFileResumable] Resuming from byte ${currentByte} of ${total}`,
                  ),
                );
              } else {
                currentByte = attemptStartByte;
                total =
                  expectedSize ||
                  parseInt(res.headers['content-length'] || '0', 10) +
                    attemptStartByte;
              }
            } else {
              currentByte = attemptStartByte;
              total =
                expectedSize ||
                parseInt(res.headers['content-length'] || '0', 10) +
                  attemptStartByte;
            }
          } else {
            currentByte = 0;
            total = parseInt(res.headers['content-length'] || '0', 10);
            log.info(
              chalk.cyan(
                `[downloadFileResumable] Starting fresh download, total size: ${(total / 1024 / 1024).toFixed(2)} MB`,
              ),
            );
            if (attemptStartByte > 0) {
              log.warn(
                chalk.yellow(
                  `[downloadFileResumable] Server doesn't support Range requests, starting from beginning`,
                ),
              );
            }
          }

          if (expectedSize && total !== expectedSize) {
            log.error(
              chalk.red(
                `[downloadFileResumable] Size mismatch! Expected: ${expectedSize}, Got: ${total}`,
              ),
            );
            reject(
              new Error(
                `Size mismatch: expected ${expectedSize} bytes, got ${total} bytes`,
              ),
            );
            return;
          }

          let dl = currentByte;
          let fileEnded = false;

          const writeOptions =
            res.statusCode === 206 ? { flags: 'a' } : { flags: 'w' };
          const file = createWriteStream(dest, writeOptions);

          const safeEndFile = (callback?: () => void) => {
            if (!fileEnded && file.writable) {
              fileEnded = true;
              file.end(callback);
            } else if (callback) {
              callback();
            }
          };

          const finishAsPaused = (bytesDownloaded: number) => {
            safeEndFile(() => {
              resolve({
                completed: false,
                bytesDownloaded,
                totalBytes: total,
                wasPaused: true,
              });
            });
          };

          // Emit initial progress
          onProgress?.(dl, total);

          const abortHandler = () => {
            log.info(
              chalk.yellow(
                `[downloadFileResumable] Download paused/aborted at ${dl} bytes`,
              ),
            );
            req.destroy();
            finishAsPaused(dl);
          };

          if (signal) {
            signal.addEventListener('abort', abortHandler, { once: true });
          }

          // If the remote end aborts mid-stream, Node can emit an 'aborted' event on the response.
          res.on('aborted', () => {
            if (signal?.aborted) return;
            if (signal) {
              signal.removeEventListener('abort', abortHandler);
            }
            safeEndFile(() => {
              reject(new Error('aborted'));
            });
          });

          res.on('data', (chunk) => {
            if (signal?.aborted) return;
            dl += chunk.length;
            onProgress?.(dl, total);
          });

          res.pipe(file, { end: false });

          res.on('end', () => {
            if (!signal?.aborted) {
              safeEndFile();
            }
          });

          file.on('finish', () => {
            if (signal) {
              signal.removeEventListener('abort', abortHandler);
            }
            if (signal?.aborted) return;
            if (dl < total) {
              onProgress?.(total, total);
            }
            log.info(
              chalk.green(
                `[downloadFileResumable] ✓ Download complete: ${dest}`,
              ),
            );
            file.close((err) => {
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
            log.error(
              chalk.red('[downloadFileResumable] File write error:'),
              err,
            );
            reject(err);
          });

          res.on('error', (err) => {
            if (signal) {
              signal.removeEventListener('abort', abortHandler);
            }
            if (signal?.aborted) {
              log.info(
                chalk.yellow(
                  '[downloadFileResumable] Response closed due to pause/abort',
                ),
              );
              return;
            }
            log.error(
              chalk.red('[downloadFileResumable] Response error:'),
              err,
            );
            safeEndFile(() => reject(err));
          });
        },
      );

      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        if (signal?.aborted) return;
        req.destroy(new Error('ETIMEDOUT'));
      });

      req.on('error', (err) => {
        if (signal?.aborted) {
          log.info(
            chalk.yellow(`[downloadFileResumable] Request aborted (paused)`),
          );
          resolve({
            completed: false,
            bytesDownloaded: attemptStartByte,
            totalBytes: expectedSize || 0,
            wasPaused: true,
          });
          return;
        }
        log.error(chalk.red(`[downloadFileResumable] Network error:`), err);
        reject(err);
      });
    });
  };

  // Retry loop: if the server/network drops the connection ("aborted"), resume from disk.
  // Do NOT retry if the user explicitly paused/canceled.
  let effectiveStartByte = startByte;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      return {
        completed: false,
        bytesDownloaded: getPartialDownloadSize(dest) || effectiveStartByte,
        totalBytes: expectedSize || 0,
        wasPaused: true,
      };
    }

    // On retries, always trust disk as the source of truth.
    if (attempt > 0) {
      effectiveStartByte = getPartialDownloadSize(dest);
    }

    try {
      return await downloadOnce(url, effectiveStartByte, _redirectCount);
    } catch (err) {
      if (signal?.aborted) {
        return {
          completed: false,
          bytesDownloaded: getPartialDownloadSize(dest) || effectiveStartByte,
          totalBytes: expectedSize || 0,
          wasPaused: true,
        };
      }

      if (attempt >= MAX_RETRIES || !isRetryableNetworkError(err)) {
        throw err;
      }

      const backoff = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      log.warn(
        chalk.yellow(
          `[downloadFileResumable] Transient network failure (${err instanceof Error ? err.message : String(err)}). Retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`,
        ),
      );
      await delay(backoff);
    }
  }

  // Should be unreachable, but keep TS happy.
  return {
    completed: false,
    bytesDownloaded: getPartialDownloadSize(dest) || startByte,
    totalBytes: expectedSize || 0,
    wasPaused: true,
  };
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
    log.warn(
      chalk.yellow(`[getPartialDownloadSize] Could not check file: ${err}`),
    );
  }
  return 0;
}
