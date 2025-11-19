import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, verifyExtractedFiles } from '../core/fs';
import { setClientVersion } from '../core/versions';
import { join } from 'path';
import { updateStorage } from '../core/storage';
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
  log.info(chalk.cyan('[downloadGame] Starting base game download...'));
  log.info(chalk.cyan(`[downloadGame] URL: ${url}`));
  log.info(chalk.cyan(`[downloadGame] Install dir: ${installDir}`));
  log.info(chalk.cyan(`[downloadGame] Downloads dir: ${downloadsDir}`));

  const zipName = url.split('/').pop() || 'base-game.zip';
  const zipPath = join(downloadsDir, zipName);

  log.info(chalk.cyan(`[downloadGame] Downloading to: ${zipPath}`));
  await downloadFile(url, zipPath, onProgress, 0, 0, expectedSize);
  log.info(chalk.green('[downloadGame] Download complete'));

  await updateStorage(s => { s.GAME_UPDATER.baseGame.downloaded = true; });

  log.info(chalk.cyan('[downloadGame] Verifying checksum...'));
  if (!(await verifySha256(zipPath, sha256))) {
    log.error(chalk.red('[downloadGame] SHA256 mismatch!'));
    throw new Error('SHA256 mismatch');
  }
  log.info(chalk.green('[downloadGame] Checksum verified'));

  log.info(chalk.cyan(`[downloadGame] Extracting to: ${installDir}`));
  await extractZip(zipPath, installDir, onExtractProgress);
  log.info(chalk.green('[downloadGame] Extraction complete'));

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
