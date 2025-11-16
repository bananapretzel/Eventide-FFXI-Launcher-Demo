import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { get } from 'https';
import { IncomingMessage } from 'http';

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url} (status: ${res.status})`);
  try {
    return await res.json() as T;
  } catch (err) {
    const text = await res.text();
    // eslint-disable-next-line no-console
    console.error(`[fetchJson] Failed to parse JSON from ${url}. Status: ${res.status}. Response text:`, text);
    throw new Error(`fetchJson: Failed to parse JSON from ${url}. Status: ${res.status}. Error: ${err}`);
  }
}

export async function downloadFile(url: string, dest: string, onProgress?: (dl: number, total: number) => void, _redirectCount = 0): Promise<void> {
  const MAX_REDIRECTS = 10;
  console.log('[core/net] downloadFile called', url, dest);
  return new Promise((resolve, reject) => {
    get(url, (res: IncomingMessage) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        if (_redirectCount >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects for URL: ${url}`));
        }
        const location = res.headers.location;
        if (!location) return reject(new Error(`Redirect with no Location header for URL: ${url}`));
        // Recursively follow the redirect
        return resolve(downloadFile(location, dest, onProgress, _redirectCount + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let dl = 0;
      const file = createWriteStream(dest);
      // Emit initial progress (0 bytes)
      if (onProgress) {
        console.log('[core/net] progress (initial)', dl, total);
        onProgress(dl, total);
      }
      res.on('data', chunk => {
        dl += chunk.length;
        if (onProgress) {
          console.log('[core/net] progress', dl, total);
        }
        onProgress?.(dl, total);
      });
      res.pipe(file);
      file.on('finish', () => {
        // Emit final progress (total bytes)
        if (onProgress && dl < total) {
          console.log('[core/net] progress (final)', total, total);
          onProgress(total, total);
        }
        file.close(err => err ? reject(err) : resolve());
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}
