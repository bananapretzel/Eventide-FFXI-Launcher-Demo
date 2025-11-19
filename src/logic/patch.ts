import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractAndMergeZip, verifyExtractedFiles } from '../core/fs';
import { setClientVersion, getClientVersion } from '../core/versions';
import { join } from 'path';
import { PatchManifest } from '../core/manifest';
import { updateStorage } from '../core/storage';
import log from 'electron-log';
import chalk from 'chalk';

export async function applyPatches(
  manifest: PatchManifest,
  installDir: string,
  onProgress?: (patch: string, dl: number, total: number) => void,
  onExtractProgress?: (current: number, total: number) => void
): Promise<void> {
  const latestVersion = manifest.latestVersion;
  const patches = manifest.patches || [];

  log.info(chalk.cyan('[applyPatches] Starting patch application...'));
  log.info(chalk.cyan(`[applyPatches] Latest version: ${latestVersion}`));
  log.info(chalk.cyan(`[applyPatches] Available patches: ${patches.length}`));

  // Get version from AppData storage.json (installDir parameter is ignored by getClientVersion)
  let currentVersion = await getClientVersion(installDir);
  if (!currentVersion) {
    log.error(chalk.red('[applyPatches] No client version found in storage.json. Aborting update.'));
    throw new Error('No client version found. Cannot apply patches.');
  }

  log.info(chalk.cyan(`[applyPatches] Current version: ${currentVersion}`));

  const downloadsDir = join(installDir, '..', 'Downloads');
  log.info(chalk.cyan(`[applyPatches] Downloads directory: ${downloadsDir}`));

  while (currentVersion !== latestVersion) {
    const patch = patches.find(p => p.from === currentVersion);
    if (!patch) {
      log.warn(chalk.yellow(`[applyPatches] No patch found from version ${currentVersion} to ${latestVersion}. Aborting.`));
      break;
    }

    log.info(chalk.cyan(`[applyPatches] Applying patch: ${patch.from} → ${patch.to}`));

    const patchZipName = patch.fullUrl.split('/').pop();
    const patchZipPath = patchZipName ? join(downloadsDir, patchZipName) : '';

    // Check if patch zip exists in downloads
    let zipExists = false;
    if (patchZipPath && require('fs').existsSync(patchZipPath)) {
      zipExists = true;
      log.info(chalk.green(`[applyPatches] Patch already downloaded: ${patchZipName}`));
      await updateStorage(s => { s.GAME_UPDATER.updater.downloaded = patch.to; });
    } else {
      // Download if not present, with size verification if available
      log.info(chalk.cyan(`[applyPatches] Downloading patch from: ${patch.fullUrl}`));
      await downloadFile(
        patch.fullUrl,
        patchZipPath,
        (dl, total) => onProgress?.(patch.to, dl, total),
        0,
        0,
        patch.sizeBytes
      );
      await updateStorage(s => { s.GAME_UPDATER.updater.downloaded = patch.to; });
      log.info(chalk.green(`[applyPatches] Download complete: ${patchZipName}`));
    }

    log.info(chalk.cyan('[applyPatches] Verifying checksum...'));
    if (!(await verifySha256(patchZipPath, patch.sha256))) {
      log.error(chalk.red(`[applyPatches] SHA256 mismatch for patch ${patch.to}`));
      throw new Error(`SHA256 mismatch for patch ${patch.to}`);
    }
    log.info(chalk.green('[applyPatches] Checksum verified'));

    const extractPath = join(installDir, 'polplugins/DATs/Eventide/ROM/');
    log.info(chalk.cyan(`[applyPatches] Extracting to: ${extractPath}`));
    await extractAndMergeZip(patchZipPath, extractPath, onExtractProgress);
    log.info(chalk.green('[applyPatches] Extraction complete'));

    // Verify extracted files (patches should have at least 1 file)
    const verification = await verifyExtractedFiles(extractPath, 1);
    if (!verification.success) {
      log.error(chalk.red(`[applyPatches] Extraction verification failed for patch ${patch.to}!`));
      throw new Error(`Extraction verification failed for patch ${patch.to}`);
    }
    log.info(chalk.green(`[applyPatches] Verification passed: ${verification.fileCount} files extracted`));

    await updateStorage(s => { s.GAME_UPDATER.updater.extracted = patch.to; });

    // Update version in storage (installDir is ignored by setClientVersion)
    await setClientVersion(installDir, patch.to);

    // Get updated version to continue loop
    currentVersion = await getClientVersion(installDir);
    log.info(chalk.green(`[applyPatches] Successfully patched from ${patch.from} to ${patch.to}`));
  }

  // Always set latestVersion from manifest
  await updateStorage(s => { s.GAME_UPDATER.latestVersion = latestVersion; });

  if (currentVersion === latestVersion) {
    log.info(chalk.green(`[applyPatches] ✓ Client is now up to date: ${currentVersion}`));
  } else {
    log.warn(chalk.yellow(`[applyPatches] Client could not be fully updated. Current: ${currentVersion}, Latest: ${latestVersion}`));
  }
}
