import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, verifyExtractedFiles } from '../core/fs';
import { setClientVersion } from '../core/versions';
import { join } from 'path';
import { updateStorage } from '../core/storage';
import { promises as fs } from 'fs';
import log from 'electron-log';
import chalk from 'chalk';

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
  log.info(chalk.cyan('[downloadGame] ================================='));
  log.info(chalk.cyan('[downloadGame] Starting base game download...'));
  log.info(chalk.cyan(`[downloadGame] URL: ${url}`));
  log.info(chalk.cyan(`[downloadGame] Install dir: ${installDir}`));
  log.info(chalk.cyan(`[downloadGame] Downloads dir: ${downloadsDir}`));
  log.info(chalk.cyan(`[downloadGame] Expected SHA256: ${sha256}`));
  log.info(chalk.cyan(`[downloadGame] Base version: ${baseVersion}`));
  if (expectedSize) {
    log.info(chalk.cyan(`[downloadGame] Expected size: ${(expectedSize / 1024 / 1024).toFixed(2)} MB`));
  }
  log.info(chalk.cyan('[downloadGame] ================================='));

  const zipName = url.split('/').pop() || 'base-game.zip';
  const zipPath = join(downloadsDir, zipName);

  log.info(chalk.cyan(`[downloadGame] Downloading to: ${zipPath}`));

  try {
    await downloadFile(url, zipPath, onProgress, 0, 0, expectedSize);
    log.info(chalk.green('[downloadGame] Download complete'));
  } catch (downloadErr) {
    log.error(chalk.red('[downloadGame] Download failed:'), downloadErr);

    // Clean up partial/corrupted download
    try {
      await fs.unlink(zipPath);
      log.info(chalk.cyan('[downloadGame] Cleaned up failed download'));
    } catch (unlinkErr) {
      log.warn(chalk.yellow('[downloadGame] Could not clean up partial download:'), unlinkErr);
    }

    throw downloadErr;
  }

  await updateStorage(s => { s.GAME_UPDATER.baseGame.downloaded = true; });

  log.info(chalk.cyan('[downloadGame] Verifying checksum...'));
  const checksumValid = await verifySha256(zipPath, sha256);

  if (!checksumValid) {
    log.error(chalk.red('[downloadGame] SHA256 mismatch!'));

    // Delete corrupted file
    try {
      await fs.unlink(zipPath);
      log.info(chalk.cyan('[downloadGame] Deleted corrupted ZIP file'));
    } catch (unlinkErr) {
      log.warn(chalk.yellow('[downloadGame] Could not delete corrupted ZIP:'), unlinkErr);
    }

    await updateStorage(s => { s.GAME_UPDATER.baseGame.downloaded = false; });
    throw new Error('SHA256 mismatch - downloaded file is corrupted. Please try downloading again.');
  }

  log.info(chalk.green('[downloadGame] Checksum verified'));

  log.info(chalk.cyan(`[downloadGame] Extracting to: ${installDir}`));

  try {
    await extractZip(zipPath, installDir, onExtractProgress);
    log.info(chalk.green('[downloadGame] Extraction complete'));
  } catch (extractErr) {
    log.error(chalk.red('[downloadGame] Extraction failed:'), extractErr);

    // If extraction fails, the ZIP might be corrupted - delete it
    try {
      await fs.unlink(zipPath);
      log.info(chalk.cyan('[downloadGame] Deleted corrupted ZIP file after extraction failure'));
      await updateStorage(s => { s.GAME_UPDATER.baseGame.downloaded = false; });
    } catch (unlinkErr) {
      log.warn(chalk.yellow('[downloadGame] Could not delete ZIP after extraction failure:'), unlinkErr);
    }

    throw new Error(`ZIP extraction failed: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}. The file may be corrupted. Please try downloading again.`);
  }

  // Verify extracted files (expect at least 100 files for a base game install)
  const verification = await verifyExtractedFiles(installDir, 100);
  if (!verification.success) {
    log.error(chalk.red(`[downloadGame] Extraction verification failed! Only ${verification.fileCount} files found.`));
    throw new Error(`Extraction verification failed: expected at least 100 files, found ${verification.fileCount}`);
  }
  log.info(chalk.green(`[downloadGame] Verification passed: ${verification.fileCount} files extracted`));

  await updateStorage(s => { s.GAME_UPDATER.baseGame.extracted = true; });

  // Set version in AppData storage (installDir is ignored by setClientVersion)
  await setClientVersion(installDir, baseVersion);

  log.info(chalk.green(`[downloadGame] ✓ Base game installation complete! Version: ${baseVersion}`));
}
