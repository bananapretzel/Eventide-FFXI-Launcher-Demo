import { promises as fs, createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function writeJson(path: string, data: any): Promise<void> {
  const tmp = join(tmpdir(), `tmp-${Date.now()}.json`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, path);
}

export async function extractZip(zipPath: string, dest: string): Promise<void> {
  const extract = (await import('extract-zip')).default;
  await fs.mkdir(dest, { recursive: true });

  // Debug: log file size and first 100 bytes
  try {
    const stat = await fs.stat(zipPath);
    // eslint-disable-next-line no-console
    console.log(`[extractZip] File size: ${stat.size} bytes`);
    if (stat.size < 2048) {
      const buf = Buffer.alloc(Math.min(stat.size, 100));
      const fd = await fs.open(zipPath, 'r');
      await fd.read(buf, 0, buf.length, 0);
      await fd.close();
      // eslint-disable-next-line no-console
      console.warn(`[extractZip] Warning: Patch file is small (${stat.size} bytes). Proceeding with extraction.`);
      console.log('[extractZip] First bytes:', buf.toString('utf8'));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[extractZip] Could not stat/read file:', e);
    throw e;
  }

  await extract(zipPath, { dir: dest });
}

export async function moveFile(src: string, dest: string): Promise<void> {
  await fs.rename(src, dest);
}
