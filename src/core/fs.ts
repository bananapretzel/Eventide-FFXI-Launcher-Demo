import { promises as fs, createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import log from 'electron-log';
import chalk from 'chalk';

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

export async function extractZip(
  zipPath: string,
  dest: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  log.info(chalk.cyan(`[extractZip] Extracting archive: ${zipPath}`));
  log.info(chalk.cyan(`[extractZip] Destination: ${dest}`));

  const extract = (await import('extract-zip')).default;
  await fs.mkdir(dest, { recursive: true });

  // Check file size
  try {
    const stat = await fs.stat(zipPath);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
    log.info(chalk.cyan(`[extractZip] Archive size: ${sizeMB} MB`));

    if (stat.size < 2048) {
      log.warn(chalk.yellow(`[extractZip] Warning: Archive is very small (${stat.size} bytes)`));
      const buf = Buffer.alloc(Math.min(stat.size, 100));
      const fd = await fs.open(zipPath, 'r');
      await fd.read(buf, 0, buf.length, 0);
      await fd.close();
      log.warn(chalk.yellow(`[extractZip] First bytes: ${buf.toString('utf8')}`));
    }
  } catch (e) {
    log.error(chalk.red('[extractZip] Could not stat/read file:'), e);
    throw e;
  }

  log.info(chalk.cyan('[extractZip] Starting extraction...'));

  // Use extract-zip with progress tracking
  if (onProgress) {
    // extract-zip doesn't provide built-in progress, so we'll use a workaround
    // We'll track extraction by monitoring the extraction process
    await extract(zipPath, {
      dir: dest,
      onEntry: (entry, zipfile) => {
        // Report progress based on entry count
        const totalEntries = zipfile.entryCount;
        const currentEntry = zipfile.entriesRead || 0;
        onProgress(currentEntry, totalEntries);
      }
    });
    // Emit final progress
    onProgress(100, 100);
  } else {
    await extract(zipPath, { dir: dest });
  }

  log.info(chalk.green('[extractZip] ✓ Extraction complete'));
}

// Add file count verification function
export async function verifyExtractedFiles(destDir: string, expectedMinFiles?: number): Promise<{ success: boolean; fileCount: number }> {
  try {
    log.info(chalk.cyan(`[verifyExtractedFiles] Verifying extracted files in: ${destDir}`));

    let fileCount = 0;

    async function countFilesRecursive(dir: string): Promise<number> {
      let count = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          count++;
        } else if (entry.isDirectory()) {
          count += await countFilesRecursive(join(dir, entry.name));
        }
      }

      return count;
    }

    fileCount = await countFilesRecursive(destDir);
    log.info(chalk.cyan(`[verifyExtractedFiles] Found ${fileCount} files`));

    if (expectedMinFiles && fileCount < expectedMinFiles) {
      log.error(chalk.red(`[verifyExtractedFiles] File count too low! Expected at least ${expectedMinFiles}, found ${fileCount}`));
      return { success: false, fileCount };
    }

    log.info(chalk.green(`[verifyExtractedFiles] ✓ Verification complete: ${fileCount} files`));
    return { success: true, fileCount };
  } catch (e) {
    log.error(chalk.red('[verifyExtractedFiles] Verification failed:'), e);
    return { success: false, fileCount: 0 };
  }
}

export async function moveFile(src: string, dest: string): Promise<void> {
  await fs.rename(src, dest);
}
