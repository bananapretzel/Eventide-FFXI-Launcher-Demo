import { promises as fs, statfsSync } from 'fs';
import path, { join, dirname } from 'path';
import { tmpdir } from 'os';
import log from 'electron-log';
import chalk from 'chalk';
import * as os from 'os';

type PivotOverlayOrderResult = {
  success: boolean;
  overlays?: string[];
  error?: string;
};

/**
 * Sets write permissions on a file before writing to it
 * This ensures config files can be written even if they were read-only
 * @param filePath Path to the file
 */
export async function ensureFileWritable(filePath: string): Promise<void> {
  try {
    // Check if file exists first
    const exists = await fileExists(filePath);
    if (!exists) {
      // File doesn't exist, no need to change permissions
      return;
    }

    // On Windows, use fs.chmod to set write permissions
    if (process.platform === 'win32') {
      // 0o666 = read+write for owner, group, and others
      await fs.chmod(filePath, 0o666);
      log.info(
        chalk.cyan(
          `[ensureFileWritable] Set write permissions on: ${filePath}`,
        ),
      );
    } else {
      // On Unix-like systems, use fs.chmod with standard permissions
      await fs.chmod(filePath, 0o644);
      log.info(
        chalk.cyan(
          `[ensureFileWritable] Set write permissions on: ${filePath}`,
        ),
      );
    }
  } catch (err) {
    // Log warning but don't fail - we'll try writing anyway
    log.warn(
      chalk.yellow(
        `[ensureFileWritable] Could not set permissions on ${filePath}:`,
      ),
      err,
    );
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function writeJson(destPath: string, data: any): Promise<void> {
  // Ensure parent directory exists
  const parentDir = dirname(destPath);
  await fs.mkdir(parentDir, { recursive: true });

  // Ensure the file is writable before writing
  await ensureFileWritable(destPath);

  // Use atomic write with a unique temp file to prevent race conditions
  const tmp = join(
    tmpdir(),
    `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');

  try {
    await fs.rename(tmp, destPath);
  } catch (_renameErr) {
    // If rename fails (e.g., cross-device), fall back to copy + delete
    await fs.copyFile(tmp, destPath);
    await fs.unlink(tmp).catch(() => {}); // Clean up temp file, ignore errors
  }
}

/**
 * Validates that a file is a valid ZIP archive by checking for ZIP signature
 * @param zipPath Path to the ZIP file
 * @returns true if valid ZIP, false otherwise
 */
async function validateZipFile(
  zipPath: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const stat = await fs.stat(zipPath);

    // ZIP files must be at least 22 bytes (minimum for end of central directory record)
    if (stat.size < 22) {
      return {
        valid: false,
        error: `File too small to be a valid ZIP (${stat.size} bytes)`,
      };
    }

    // Read first 4 bytes to check for ZIP signature (PK\x03\x04 or PK\x05\x06)
    const fd = await fs.open(zipPath, 'r');
    const headerBuf = Buffer.alloc(4);
    await fd.read(headerBuf, 0, 4, 0);

    // Also read last 22 bytes to check for end of central directory signature
    const eocdrBuf = Buffer.alloc(22);
    await fd.read(eocdrBuf, 0, 22, stat.size - 22);
    await fd.close();

    // Check for ZIP local file header signature (0x04034b50)
    const hasLocalFileHeader =
      headerBuf[0] === 0x50 &&
      headerBuf[1] === 0x4b &&
      headerBuf[2] === 0x03 &&
      headerBuf[3] === 0x04;

    // Check for end of central directory signature (0x06054b50)
    const hasEOCDR =
      eocdrBuf[0] === 0x50 &&
      eocdrBuf[1] === 0x4b &&
      eocdrBuf[2] === 0x05 &&
      eocdrBuf[3] === 0x06;

    if (!hasLocalFileHeader && !hasEOCDR) {
      // Not a ZIP file - might be HTML error page or corrupt download
      const previewBuf = Buffer.alloc(Math.min(stat.size, 200));
      const previewFd = await fs.open(zipPath, 'r');
      await previewFd.read(previewBuf, 0, previewBuf.length, 0);
      await previewFd.close();

      const preview = previewBuf.toString('utf8').replace(/[^\x20-\x7E]/g, '.');

      return {
        valid: false,
        error: `Not a valid ZIP file. File starts with: ${preview.substring(0, 100)}`,
      };
    }

    if (!hasEOCDR) {
      return {
        valid: false,
        error:
          'ZIP file is incomplete or corrupted (missing end of central directory record)',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate ZIP: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function extractZip(
  zipPath: string,
  dest: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  log.info(chalk.cyan(`[extractZip] Extracting archive: ${zipPath}`));
  log.info(chalk.cyan(`[extractZip] Destination: ${dest}`));

  // Validate ZIP file before attempting extraction
  const validation = await validateZipFile(zipPath);
  if (!validation.valid) {
    log.error(
      chalk.red(`[extractZip] ZIP validation failed: ${validation.error}`),
    );
    throw new Error(`Invalid ZIP file: ${validation.error}`);
  }

  const extract = (await import('extract-zip')).default;
  await fs.mkdir(dest, { recursive: true });

  // Check file size
  try {
    const stat = await fs.stat(zipPath);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
    log.info(chalk.cyan(`[extractZip] Archive size: ${sizeMB} MB`));
    log.info(chalk.green(`[extractZip] ZIP validation passed`));
  } catch (e) {
    log.error(chalk.red('[extractZip] Could not stat file:'), e);
    throw e;
  }

  log.info(chalk.cyan('[extractZip] Starting extraction...'));

  const destResolved = path.resolve(dest);
  const isSafeZipEntryPath = (fileName: string): boolean => {
    const normalized = String(fileName || '').replace(/\\/g, '/');
    if (!normalized || normalized === '.' || normalized === './') {
      return true;
    }
    if (normalized.startsWith('/') || normalized.startsWith('\\')) {
      return false;
    }
    if (normalized.includes('\u0000')) {
      return false;
    }

    const outPath = path.resolve(destResolved, normalized);
    if (outPath === destResolved) {
      return true;
    }
    return outPath.startsWith(destResolved + path.sep);
  };

  try {
    // Use extract-zip with progress tracking
    await extract(zipPath, {
      dir: dest,
      onEntry: (entry, zipfile) => {
        const fileName = (entry as any)?.fileName;
        if (!isSafeZipEntryPath(fileName)) {
          throw new Error(`Blocked unsafe ZIP entry path: ${fileName}`);
        }

        if (onProgress) {
          const totalEntries = zipfile.entryCount;
          const currentEntry = zipfile.entriesRead || 0;
          onProgress(currentEntry, totalEntries);
        }
      },
    });

    log.info(chalk.green('[extractZip] ✓ Extraction complete'));
  } catch (error) {
    log.error(chalk.red('[extractZip] Extraction failed:'), error);
    throw new Error(
      `ZIP extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extracts a ZIP file and merges its contents with the destination directory.
 * If the ZIP contains a single root folder, its contents are extracted directly to the destination
 * instead of creating a nested folder structure.
 *
 * This is useful for patches that contain a "ROM" folder - instead of creating ROM/ROM,
 * the contents are merged into the existing ROM folder.
 */
export async function extractAndMergeZip(
  zipPath: string,
  dest: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  log.info(
    chalk.cyan(
      `[extractAndMergeZip] Extracting and merging archive: ${zipPath}`,
    ),
  );
  log.info(chalk.cyan(`[extractAndMergeZip] Destination: ${dest}`));

  // Create a temporary extraction directory
  const tempDir = join(tmpdir(), `eventide-extract-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // First, extract to temp directory
    await extractZip(zipPath, tempDir, onProgress);

    // Check if there's a single root directory
    const entries = await fs.readdir(tempDir, { withFileTypes: true });

    let sourceDir = tempDir;
    if (entries.length === 1 && entries[0].isDirectory()) {
      // Single root folder detected - use its contents instead
      const rootFolderName = entries[0].name;
      sourceDir = join(tempDir, rootFolderName);
      log.info(
        chalk.cyan(
          `[extractAndMergeZip] Single root folder detected: ${rootFolderName}`,
        ),
      );
      log.info(
        chalk.cyan(
          `[extractAndMergeZip] Will merge contents instead of creating nested structure`,
        ),
      );
    }

    // Ensure destination exists
    await fs.mkdir(dest, { recursive: true });

    // Copy each item from sourceDir to dest (merge contents, not the directory itself)
    log.info(
      chalk.cyan(
        `[extractAndMergeZip] Merging contents from ${sourceDir} to ${dest}`,
      ),
    );
    const sourceEntries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of sourceEntries) {
      const sourcePath = join(sourceDir, entry.name);
      const destPath = join(dest, entry.name);

      // Use fs.cp to recursively copy each item, overwriting existing files
      await fs.cp(sourcePath, destPath, { recursive: true, force: true });
      log.info(chalk.gray(`[extractAndMergeZip] Merged: ${entry.name}`));
    }

    log.info(
      chalk.green('[extractAndMergeZip] ✓ Extraction and merge complete'),
    );
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      log.info(
        chalk.cyan('[extractAndMergeZip] Cleaned up temporary directory'),
      );
    } catch (e) {
      log.warn(
        chalk.yellow('[extractAndMergeZip] Failed to clean up temp directory:'),
        e,
      );
    }
  }
}

// Add file count verification function
export async function verifyExtractedFiles(
  destDir: string,
  expectedMinFiles?: number,
): Promise<{ success: boolean; fileCount: number }> {
  const countFilesRecursive = async (dir: string): Promise<number> => {
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
  };

  try {
    log.info(
      chalk.cyan(
        `[verifyExtractedFiles] Verifying extracted files in: ${destDir}`,
      ),
    );

    let fileCount = 0;

    fileCount = await countFilesRecursive(destDir);
    log.info(chalk.cyan(`[verifyExtractedFiles] Found ${fileCount} files`));

    if (expectedMinFiles && fileCount < expectedMinFiles) {
      log.error(
        chalk.red(
          `[verifyExtractedFiles] File count too low! Expected at least ${expectedMinFiles}, found ${fileCount}`,
        ),
      );
      return { success: false, fileCount };
    }

    log.info(
      chalk.green(
        `[verifyExtractedFiles] ✓ Verification complete: ${fileCount} files`,
      ),
    );
    return { success: true, fileCount };
  } catch (e) {
    log.error(chalk.red('[verifyExtractedFiles] Verification failed:'), e);
    return { success: false, fileCount: 0 };
  }
}

export async function moveFile(src: string, dest: string): Promise<void> {
  await fs.rename(src, dest);
}

/**
 * Check available disk space for a given path
 * @param path Directory path to check
 * @returns Available space in bytes, or null if check fails
 */
export function getAvailableDiskSpace(dirPath: string): number | null {
  try {
    if (process.platform === 'win32') {
      // On Windows, use a different approach
      // We'll use wmic for Windows disk space check
      // For now, return null and let the caller handle it
      // This will be a synchronous approximation
      return null; // Windows requires async handling
    }
    // On Unix-like systems, use statfs
    const stats = statfsSync(dirPath);
    const availableBytes = stats.bavail * stats.bsize;
    return availableBytes;
  } catch (err) {
    log.error(
      chalk.red('[getAvailableDiskSpace] Error checking disk space:'),
      err,
    );
    return null;
  }
}

/**
 * Check if there's enough disk space for an operation
 * @param path Directory path to check
 * @param requiredBytes Bytes required
 * @returns true if enough space, false otherwise
 */
export async function checkDiskSpace(
  targetPath: string,
  requiredBytes: number,
): Promise<{ hasSpace: boolean; availableBytes: number; message?: string }> {
  try {
    log.info(
      chalk.cyan(
        `[checkDiskSpace] Checking disk space for ${targetPath}, required: ${(requiredBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      ),
    );

    // For cross-platform support, use check-disk-space package if available
    // Otherwise provide a basic check
    try {
      const checkDiskSpaceModule = require('check-disk-space').default;
      const diskSpace = await checkDiskSpaceModule(targetPath);
      const available = diskSpace.free;

      log.info(
        chalk.cyan(
          `[checkDiskSpace] Available: ${(available / 1024 / 1024 / 1024).toFixed(2)} GB`,
        ),
      );

      if (available < requiredBytes) {
        const shortfall = requiredBytes - available;
        return {
          hasSpace: false,
          availableBytes: available,
          message: `Insufficient disk space. Need ${(requiredBytes / 1024 / 1024 / 1024).toFixed(2)} GB, but only ${(available / 1024 / 1024 / 1024).toFixed(2)} GB available. Please free up at least ${(shortfall / 1024 / 1024 / 1024).toFixed(2)} GB.`,
        };
      }

      return { hasSpace: true, availableBytes: available };
    } catch (_importErr) {
      // If check-disk-space is not available, return a permissive result
      log.warn(
        chalk.yellow(
          '[checkDiskSpace] check-disk-space module not available, skipping disk space check',
        ),
      );
      return { hasSpace: true, availableBytes: 0 };
    }
  } catch (err) {
    log.error(chalk.red('[checkDiskSpace] Error checking disk space:'), err);
    // On error, be permissive and allow the operation
    return { hasSpace: true, availableBytes: 0 };
  }
}

/**
 * Check if directory is writable
 * @param dirPath Directory to check
 * @returns true if writable, false otherwise
 */
export async function checkDirectoryWritable(
  dirPath: string,
): Promise<{ writable: boolean; error?: string }> {
  try {
    log.info(
      chalk.cyan(
        `[checkDirectoryWritable] Checking write permissions for: ${dirPath}`,
      ),
    );

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Try to write a test file
    const testFile = join(dirPath, `.write-test-${Date.now()}`);
    try {
      await fs.writeFile(testFile, 'test', 'utf-8');
      await fs.unlink(testFile);
      log.info(
        chalk.green(
          `[checkDirectoryWritable] Directory is writable: ${dirPath}`,
        ),
      );
      return { writable: true };
    } catch (err) {
      log.error(
        chalk.red(
          `[checkDirectoryWritable] Directory is NOT writable: ${dirPath}`,
        ),
        err,
      );
      return {
        writable: false,
        error: `Cannot write to directory: ${dirPath}. Please check folder permissions or try running as administrator.`,
      };
    }
  } catch (err) {
    log.error(
      chalk.red(`[checkDirectoryWritable] Error checking directory:`, err),
    );
    return {
      writable: false,
      error: `Cannot access directory: ${dirPath}. ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Creates or updates pivot.ini configuration file for Pivot plugin overlay system
 * This fixes the "incorrect pivot root_path configuration" bug
 * @param gameRoot Root game installation directory
 */
export async function createPivotIni(
  gameRoot: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const pivotConfigDir = join(gameRoot, 'config', 'pivot');
    const pivotIniPath = join(pivotConfigDir, 'pivot.ini');

    log.info(
      chalk.cyan(
        `[createPivotIni] Configuring Pivot overlay system at: ${pivotIniPath}`,
      ),
    );

    // Check write permissions first
    const writeCheck = await checkDirectoryWritable(pivotConfigDir);
    if (!writeCheck.writable) {
      log.error(
        chalk.red(`[createPivotIni] Cannot write to pivot config directory`),
      );
      return { success: false, error: writeCheck.error };
    }

    // Pivot.ini content with correct root_path configuration
    // NOTE: This function is currently not used - patches now extract directly to game root
    const pivotIniContent = `[Settings]
; Pivot DAT Overlay Configuration
; Generated by Eventide Launcher

; Root path for DAT overlays (relative to game root)
root_path=polplugins/DATs/

; Overlay priority order (higher number = higher priority)
[Overlays]
Eventide=1
`;

    await fs.writeFile(pivotIniPath, pivotIniContent, 'utf-8');
    log.info(
      chalk.green(
        `[createPivotIni] ✓ Pivot configuration created successfully`,
      ),
    );

    return { success: true };
  } catch (err) {
    log.error(chalk.red(`[createPivotIni] Error creating pivot.ini:`), err);
    return {
      success: false,
      error: `Failed to create pivot.ini: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function normalizeOverlayName(name: string): string {
  return (name || '').trim();
}

function uniqPreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const n = normalizeOverlayName(item);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function ensureEventideFirst(overlays: string[]): string[] {
  const cleaned = overlays.map(normalizeOverlayName).filter(Boolean);
  const rest = cleaned.filter((o) => o.toLowerCase() !== 'eventide');
  return ['Eventide', ...rest];
}

export async function listPivotOverlayFolders(
  gameRoot: string,
): Promise<string[]> {
  const datRoot = join(gameRoot, 'polplugins', 'DATs');
  try {
    const entries = await fs.readdir(datRoot, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !!name && !name.startsWith('.'));
    return uniqPreserveOrder(ensureEventideFirst(dirs));
  } catch {
    // If folder doesn't exist yet, still return Eventide
    return ['Eventide'];
  }
}

/**
 * Parses the [overlays] section of pivot.ini and returns overlays in application order.
 * Supports numeric keys (0=Eventide) and legacy name=priority formats.
 */
export async function readPivotIniOverlayOrder(
  gameRoot: string,
): Promise<PivotOverlayOrderResult> {
  try {
    const pivotIniPath = join(gameRoot, 'config', 'pivot', 'pivot.ini');
    const exists = await fileExists(pivotIniPath);
    if (!exists) return { success: true, overlays: [] };

    const raw = await fs.readFile(pivotIniPath, 'utf-8');
    const lines = raw.split(/\r?\n/);

    let inOverlays = false;
    const numericPairs: Array<{ k: number; v: string }> = [];
    const namePairs: Array<{ name: string; priority: number }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#'))
        continue;

      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1].trim().toLowerCase();
        inOverlays = sectionName === 'overlays';
        continue;
      }

      if (!inOverlays) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const left = trimmed.slice(0, eq).trim();
      const right = trimmed.slice(eq + 1).trim();
      if (!left || !right) continue;

      if (/^\d+$/.test(left)) {
        numericPairs.push({ k: Number(left), v: right });
      } else if (/^-?\d+$/.test(right)) {
        namePairs.push({ name: left, priority: Number(right) });
      } else {
        // Treat as an enabled flag, not an order; ignore.
      }
    }

    let overlays: string[] = [];
    if (numericPairs.length > 0) {
      overlays = numericPairs.sort((a, b) => a.k - b.k).map((p) => p.v);
    } else if (namePairs.length > 0) {
      overlays = namePairs
        .sort((a, b) => a.priority - b.priority)
        .map((p) => p.name);
    }

    overlays = uniqPreserveOrder(ensureEventideFirst(overlays));
    return { success: true, overlays };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildOverlaysSection(overlays: string[]): string[] {
  const cleaned = uniqPreserveOrder(ensureEventideFirst(overlays));
  const out: string[] = ['[overlays]'];
  cleaned.forEach((name, idx) => {
    out.push(`${idx}=${name}`);
  });
  return out;
}

/**
 * Writes/updates pivot.ini overlay ordering.
 * Preserves existing file content outside the [overlays] section when possible.
 */
export async function writePivotIniOverlayOrder(
  gameRoot: string,
  overlays: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const pivotConfigDir = join(gameRoot, 'config', 'pivot');
    const pivotIniPath = join(pivotConfigDir, 'pivot.ini');

    await fs.mkdir(pivotConfigDir, { recursive: true });
    await ensureFileWritable(pivotIniPath);

    const overlaysLines = buildOverlaysSection(overlays);

    const exists = await fileExists(pivotIniPath);
    if (!exists) {
      const content = [
        '[settings]',
        '; Pivot DAT Overlay Configuration',
        '; Generated by Eventide Launcher',
        '',
        'root_path=polplugins/DATs/',
        '',
        ...overlaysLines,
        '',
      ].join(os.EOL);
      await fs.writeFile(pivotIniPath, content, 'utf-8');
      return { success: true };
    }

    const raw = await fs.readFile(pivotIniPath, 'utf-8');
    const lines = raw.split(/\r?\n/);

    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      const sectionMatch = t.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1].trim().toLowerCase();
        if (sectionName === 'overlays') {
          startIdx = i;
          continue;
        }
        if (startIdx !== -1) {
          endIdx = i;
          break;
        }
      }
    }

    const before = startIdx === -1 ? lines : lines.slice(0, startIdx);
    const after =
      startIdx === -1 ? [] : lines.slice(endIdx === -1 ? lines.length : endIdx);

    const updated = [...before];
    if (startIdx !== -1) {
      // Ensure there's a blank line before overlays section if file isn't empty
      if (updated.length > 0 && updated[updated.length - 1].trim() !== '') {
        updated.push('');
      }
    } else if (
      updated.length > 0 &&
      updated[updated.length - 1].trim() !== ''
    ) {
      updated.push('');
    }
    updated.push(...overlaysLines);
    if (after.length > 0 && after[0].trim() !== '') {
      updated.push('');
    }
    updated.push(...after);

    await fs.writeFile(pivotIniPath, updated.join(os.EOL), 'utf-8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
