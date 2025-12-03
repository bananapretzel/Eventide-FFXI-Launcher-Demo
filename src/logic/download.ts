import { downloadFile, downloadFileResumable, getPartialDownloadSize, createDownloadController, abortDownload, clearDownloadController, ResumableDownloadResult } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, verifyExtractedFiles } from '../core/fs';
import { setClientVersion } from '../core/versions';
import { join } from 'path';
import { updateStorage, saveDownloadProgress, getDownloadProgress, clearDownloadProgress, setDownloadPaused, DownloadProgress } from '../core/storage';
import { promises as fs } from 'fs';
import log from 'electron-log';
import chalk from 'chalk';

// Throttle progress saves to avoid excessive disk writes
let lastProgressSaveTime = 0;
const PROGRESS_SAVE_INTERVAL_MS = 5000; // Save progress every 5 seconds

export interface DownloadGameResult {
  completed: boolean;
  wasPaused: boolean;
  bytesDownloaded: number;
  totalBytes: number;
}

/**
 * Pause the current download
 */
export function pauseDownload(): void {
  log.info(chalk.yellow('[pauseDownload] Pausing download...'));
  abortDownload();
}

/**
 * Check if there's an existing partial download that can be resumed
 */
export async function checkForResumableDownload(): Promise<DownloadProgress | null> {
  const progress = await getDownloadProgress();
  if (!progress) {
    return null;
  }

  // Verify the partial file still exists and matches stored progress
  const actualSize = getPartialDownloadSize(progress.destPath);
  if (actualSize === 0) {
    // File doesn't exist, clear the progress
    await clearDownloadProgress();
    return null;
  }

  // Update stored bytes with actual file size (in case of discrepancy)
  let needsSave = false;
  if (actualSize !== progress.bytesDownloaded) {
    log.warn(chalk.yellow(`[checkForResumableDownload] File size mismatch: stored ${progress.bytesDownloaded}, actual ${actualSize}. Using actual size.`));
    progress.bytesDownloaded = actualSize;
    needsSave = true;
  }

  // Save updated progress back to storage so UI shows correct values
  if (needsSave) {
    await saveDownloadProgress(progress);
  }

  log.info(chalk.cyan(`[checkForResumableDownload] Found resumable download: ${progress.bytesDownloaded} / ${progress.totalBytes} bytes (${Math.round(progress.bytesDownloaded / progress.totalBytes * 100)}%)`));
  return progress;
}

/**
 * Clear any existing partial download and progress
 */
export async function cancelDownload(destPath?: string): Promise<void> {
  log.info(chalk.yellow('[cancelDownload] Canceling download...'));
  abortDownload();

  const progress = await getDownloadProgress();
  const pathToDelete = destPath || progress?.destPath;

  if (pathToDelete) {
    try {
      await fs.unlink(pathToDelete);
      log.info(chalk.cyan(`[cancelDownload] Deleted partial download: ${pathToDelete}`));
    } catch (err) {
      log.warn(chalk.yellow(`[cancelDownload] Could not delete partial download:`, err));
    }
  }

  await clearDownloadProgress();
  clearDownloadController();
}

export async function downloadGame(
  url: string,
  sha256: string,
  installDir: string,
  downloadsDir: string,
  baseVersion: string,
  expectedSize?: number,
  onProgress?: (dl: number, total: number) => void,
  onExtractProgress?: (current: number, total: number) => void
): Promise<void> {
  const result = await downloadGameResumable(
    url,
    sha256,
    installDir,
    downloadsDir,
    baseVersion,
    expectedSize,
    onProgress,
    onExtractProgress
  );

  if (!result.completed && result.wasPaused) {
    throw new Error('DOWNLOAD_PAUSED');
  }
}

export async function downloadGameResumable(
  url: string,
  sha256: string,
  installDir: string,
  downloadsDir: string,
  baseVersion: string,
  expectedSize?: number,
  onProgress?: (dl: number, total: number) => void,
  onExtractProgress?: (current: number, total: number) => void
): Promise<DownloadGameResult> {
  log.info(chalk.cyan('[downloadGameResumable] ================================='));
  log.info(chalk.cyan('[downloadGameResumable] Starting base game download...'));
  log.info(chalk.cyan(`[downloadGameResumable] URL: ${url}`));
  log.info(chalk.cyan(`[downloadGameResumable] Install dir: ${installDir}`));
  log.info(chalk.cyan(`[downloadGameResumable] Downloads dir: ${downloadsDir}`));
  log.info(chalk.cyan(`[downloadGameResumable] Expected SHA256: ${sha256}`));
  log.info(chalk.cyan(`[downloadGameResumable] Base version: ${baseVersion}`));
  if (expectedSize) {
    log.info(chalk.cyan(`[downloadGameResumable] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`));
  }
  log.info(chalk.cyan('[downloadGameResumable] ================================='));

  const zipName = url.split('/').pop() || 'base-game.zip';
  const zipPath = join(downloadsDir, zipName);

  // Check for existing partial download
  let startByte = 0;
  const existingProgress = await getDownloadProgress();

  if (existingProgress && existingProgress.url === url && existingProgress.destPath === zipPath) {
    // Verify the partial file exists and get actual size
    const actualSize = getPartialDownloadSize(zipPath);
    if (actualSize > 0) {
      startByte = actualSize;
      log.info(chalk.green(`[downloadGameResumable] Resuming download from byte ${startByte} (${(startByte / 1024 / 1024).toFixed(2)} MB)`));
    }
  } else if (existingProgress) {
    // Different download in progress, clear it
    log.warn(chalk.yellow('[downloadGameResumable] Found progress for different download, clearing...'));
    await clearDownloadProgress();
  }

  log.info(chalk.cyan(`[downloadGameResumable] Downloading to: ${zipPath}`));

  // Create abort controller for this download
  const controller = createDownloadController();

  // Initialize or update download progress in storage
  await saveDownloadProgress({
    url,
    destPath: zipPath,
    bytesDownloaded: startByte,
    totalBytes: expectedSize || 0,
    sha256,
    isPaused: false,
    startedAt: existingProgress?.startedAt || Date.now(),
    lastUpdatedAt: Date.now(),
  });

  try {
    // Progress wrapper that also saves to storage periodically
    const wrappedOnProgress = async (dl: number, total: number) => {
      // Always call the UI callback
      onProgress?.(dl, total);

      // Periodically save progress to storage (throttled to avoid excessive writes)
      const now = Date.now();
      if (now - lastProgressSaveTime > PROGRESS_SAVE_INTERVAL_MS) {
        lastProgressSaveTime = now;
        // Fire and forget - don't await to avoid blocking download
        saveDownloadProgress({
          url,
          destPath: zipPath,
          bytesDownloaded: dl,
          totalBytes: total,
          sha256,
          isPaused: false,
          startedAt: existingProgress?.startedAt || Date.now(),
          lastUpdatedAt: now,
        }).catch(err => log.warn('[downloadGameResumable] Failed to save progress:', err));
      }
    };

    const result = await downloadFileResumable(
      url,
      zipPath,
      startByte,
      expectedSize,
      wrappedOnProgress,
      controller.signal
    );

    // Handle paused download
    if (!result.completed && result.wasPaused) {
      log.info(chalk.yellow(`[downloadGameResumable] Download paused at ${result.bytesDownloaded} bytes`));
      await saveDownloadProgress({
        url,
        destPath: zipPath,
        bytesDownloaded: result.bytesDownloaded,
        totalBytes: result.totalBytes,
        sha256,
        isPaused: true,
        startedAt: existingProgress?.startedAt || Date.now(),
        lastUpdatedAt: Date.now(),
      });
      return {
        completed: false,
        wasPaused: true,
        bytesDownloaded: result.bytesDownloaded,
        totalBytes: result.totalBytes,
      };
    }

    log.info(chalk.green('[downloadGameResumable] Download complete'));
    clearDownloadController();
  } catch (downloadErr) {
    log.error(chalk.red('[downloadGameResumable] Download failed:'), downloadErr);
    clearDownloadController();

    // Save progress even on error (might be able to resume later)
    const currentSize = getPartialDownloadSize(zipPath);
    if (currentSize > 0) {
      await saveDownloadProgress({
        url,
        destPath: zipPath,
        bytesDownloaded: currentSize,
        totalBytes: expectedSize || 0,
        sha256,
        isPaused: true,
        startedAt: existingProgress?.startedAt || Date.now(),
        lastUpdatedAt: Date.now(),
      });
      log.info(chalk.cyan(`[downloadGameResumable] Saved progress: ${currentSize} bytes downloaded`));
    }

    throw downloadErr;
  }

  // Download completed successfully - clear progress and proceed
  await clearDownloadProgress();
  await updateStorage(s => { s.gameState.baseGame.isDownloaded = true; });

  log.info(chalk.cyan('[downloadGameResumable] Verifying checksum...'));
  const checksumValid = await verifySha256(zipPath, sha256);

  if (!checksumValid) {
    log.error(chalk.red('[downloadGameResumable] SHA256 mismatch!'));

    // Delete corrupted file
    try {
      await fs.unlink(zipPath);
      log.info(chalk.cyan('[downloadGameResumable] Deleted corrupted ZIP file'));
    } catch (unlinkErr) {
      log.warn(chalk.yellow('[downloadGameResumable] Could not delete corrupted ZIP:'), unlinkErr);
    }

    await updateStorage(s => { s.gameState.baseGame.isDownloaded = false; });
    throw new Error('SHA256 mismatch - downloaded file is corrupted. Please try downloading again.');
  }

  log.info(chalk.green('[downloadGameResumable] Checksum verified'));

  log.info(chalk.cyan(`[downloadGameResumable] Extracting to: ${installDir}`));

  try {
    await extractZip(zipPath, installDir, onExtractProgress);
    log.info(chalk.green('[downloadGameResumable] Extraction complete'));
  } catch (extractErr) {
    log.error(chalk.red('[downloadGameResumable] Extraction failed:'), extractErr);

    // If extraction fails, the ZIP might be corrupted - delete it
    try {
      await fs.unlink(zipPath);
      log.info(chalk.cyan('[downloadGameResumable] Deleted corrupted ZIP file after extraction failure'));
      await updateStorage(s => { s.gameState.baseGame.isDownloaded = false; });
    } catch (unlinkErr) {
      log.warn(chalk.yellow('[downloadGameResumable] Could not delete ZIP after extraction failure:'), unlinkErr);
    }

    throw new Error(`ZIP extraction failed: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}. The file may be corrupted. Please try downloading again.`);
  }

  // Verify extracted files (expect at least 100 files for a base game install)
  const verification = await verifyExtractedFiles(installDir, 100);
  if (!verification.success) {
    log.error(chalk.red(`[downloadGameResumable] Extraction verification failed! Only ${verification.fileCount} files found.`));
    throw new Error(`Extraction verification failed: expected at least 100 files, found ${verification.fileCount}`);
  }
  log.info(chalk.green(`[downloadGameResumable] Verification passed: ${verification.fileCount} files extracted`));

  await updateStorage(s => { s.gameState.baseGame.isExtracted = true; });

  // Set version in AppData storage (installDir is ignored by setClientVersion)
  await setClientVersion(installDir, baseVersion);

  log.info(chalk.green(`[downloadGameResumable] ✓ Base game installation complete! Version: ${baseVersion}`));

  return {
    completed: true,
    wasPaused: false,
    bytesDownloaded: expectedSize || 0,
    totalBytes: expectedSize || 0,
  };
}
