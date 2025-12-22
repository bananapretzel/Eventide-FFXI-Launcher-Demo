import { join } from 'path';
import { promises as fs } from 'fs';
import log from 'electron-log';
import chalk from 'chalk';
import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, verifyExtractedFiles } from '../core/fs';
import { setClientVersion, getClientVersion } from '../core/versions';
import { PatchManifest } from '../core/manifest';
import {
  updateStorage,
  saveDownloadProgress,
  clearDownloadProgress,
} from '../core/storage';

// Throttle progress saves to avoid excessive disk writes
let lastPatchProgressSaveTime = 0;
const PATCH_PROGRESS_SAVE_INTERVAL_MS = 2000; // Save progress every 2 seconds

export async function applyPatches(
  manifest: PatchManifest,
  installDir: string,
  onProgress?: (patch: string, dl: number, total: number) => void,
  onExtractProgress?: (current: number, total: number) => void,
): Promise<void> {
  log.info(chalk.cyan('[applyPatches] ================================='));
  log.info(chalk.cyan('[applyPatches] Starting patch application'));
  log.info(chalk.cyan(`[applyPatches] Install directory: ${installDir}`));
  log.info(
    chalk.cyan(
      `[applyPatches] Latest version in manifest: ${manifest.latestVersion}`,
    ),
  );
  log.info(chalk.cyan('[applyPatches] ================================='));
  const { latestVersion } = manifest;
  const patches = manifest.patches || [];

  log.info(chalk.cyan('[applyPatches] Starting patch application...'));
  log.info(chalk.cyan(`[applyPatches] Latest version: ${latestVersion}`));
  log.info(chalk.cyan(`[applyPatches] Available patches: ${patches.length}`));

  // Get version from AppData storage.json (installDir parameter is ignored by getClientVersion)
  let currentVersion = await getClientVersion(installDir);
  if (!currentVersion) {
    log.error(
      chalk.red(
        '[applyPatches] No client version found in storage.json. Aborting update.',
      ),
    );
    throw new Error('No client version found. Cannot apply patches.');
  }

  // Handle edge case: version is 0.0.0 but game is already extracted
  // This can happen if version was incorrectly reset during launcher update
  if (currentVersion === '0.0.0') {
    log.warn(
      chalk.yellow(
        `[applyPatches] Current version is 0.0.0. Checking if we should recover...`,
      ),
    );

    // Try to recover: check if we have game files
    const fsSync = require('fs');
    const exeName =
      process.platform === 'win32' ? 'ashita-cli.exe' : 'ashita-cli';
    const mainExe = join(installDir, exeName);

    if (fsSync.existsSync(mainExe)) {
      // Game files exist - determine what version to recover to
      // We'll check if any patch from a known version to latestVersion exists
      const manifestPatches = manifest.patches || [];
      let recoveryVersion: string | null = null;

      // Try to find the earliest patch that leads to latestVersion
      for (const patch of manifestPatches) {
        if (
          patch.to === latestVersion ||
          manifestPatches.some((p) => p.from === patch.to)
        ) {
          recoveryVersion = patch.from;
          break;
        }
      }

      if (recoveryVersion) {
        log.info(
          chalk.cyan(
            `[applyPatches] Game executable found. Recovering to version: ${recoveryVersion}`,
          ),
        );
        await setClientVersion(installDir, recoveryVersion);
        currentVersion = recoveryVersion;
      } else {
        log.error(
          chalk.red(
            '[applyPatches] Cannot determine recovery version from patch manifest.',
          ),
        );
        throw new Error(
          'Game version is 0.0.0 and cannot determine correct version. Please use "Reapply Patches" in Settings.',
        );
      }
    } else {
      log.error(
        chalk.red(
          '[applyPatches] Version is 0.0.0 and no game files found. Cannot apply patches.',
        ),
      );
      throw new Error(
        'Game version is 0.0.0 and game files are missing. Please reinstall the base game.',
      );
    }
  }

  log.info(chalk.cyan(`[applyPatches] Current version: ${currentVersion}`));

  const downloadsDir = join(installDir, '..', 'Downloads');
  log.info(chalk.cyan(`[applyPatches] Downloads directory: ${downloadsDir}`));

  while (currentVersion !== latestVersion) {
    const patch = patches.find((p) => p.from === currentVersion);
    if (!patch) {
      log.warn(
        chalk.yellow(
          `[applyPatches] No patch found from version ${currentVersion} to ${latestVersion}. Aborting.`,
        ),
      );
      break;
    }

    log.info(
      chalk.cyan(`[applyPatches] Applying patch: ${patch.from} → ${patch.to}`),
    );

    const patchZipName = patch.fullUrl.split('/').pop();
    const patchZipPath = patchZipName ? join(downloadsDir, patchZipName) : '';

    // Check if patch zip exists in downloads
    if (patchZipPath && require('fs').existsSync(patchZipPath)) {
      log.info(
        chalk.green(`[applyPatches] Patch already downloaded: ${patchZipName}`),
      );
      await updateStorage((s) => {
        s.gameState.patches.downloadedVersion = patch.to;
      });
    } else {
      // Download if not present, with size verification if available
      log.info(
        chalk.cyan(`[applyPatches] Downloading patch from: ${patch.fullUrl}`),
      );

      // Save initial download progress for pause/resume support
      await saveDownloadProgress({
        url: patch.fullUrl,
        destPath: patchZipPath,
        bytesDownloaded: 0,
        totalBytes: patch.sizeBytes || 0,
        sha256: patch.sha256,
        isPaused: false,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      });

      try {
        await downloadFile(
          patch.fullUrl,
          patchZipPath,
          async (dl, total) => {
            onProgress?.(patch.to, dl, total);
            // Throttle progress saves to avoid excessive disk writes
            const now = Date.now();
            if (
              now - lastPatchProgressSaveTime >=
              PATCH_PROGRESS_SAVE_INTERVAL_MS
            ) {
              lastPatchProgressSaveTime = now;
              await saveDownloadProgress({
                url: patch.fullUrl,
                destPath: patchZipPath,
                bytesDownloaded: dl,
                totalBytes: total || patch.sizeBytes || 0,
                sha256: patch.sha256,
                isPaused: false,
                startedAt: Date.now(),
                lastUpdatedAt: Date.now(),
              });
            }
          },
          0,
          0,
          patch.sizeBytes,
        );
        // Clear progress after successful download
        await clearDownloadProgress();
        await updateStorage((s) => {
          s.gameState.patches.downloadedVersion = patch.to;
        });
        log.info(
          chalk.green(`[applyPatches] Download complete: ${patchZipName}`),
        );
      } catch (downloadErr) {
        log.error(
          chalk.red(`[applyPatches] Patch download failed for ${patch.to}:`),
          downloadErr,
        );

        // Clean up partial download
        try {
          await fs.unlink(patchZipPath);
          log.info(chalk.cyan('[applyPatches] Cleaned up failed download'));
        } catch (unlinkErr) {
          log.warn(
            chalk.yellow('[applyPatches] Could not clean up partial download:'),
            unlinkErr,
          );
        }

        throw new Error(
          `Patch download failed: ${downloadErr instanceof Error ? downloadErr.message : String(downloadErr)}`,
        );
      }
    }

    log.info(chalk.cyan('[applyPatches] Verifying checksum...'));
    const checksumValid = await verifySha256(patchZipPath, patch.sha256);

    if (!checksumValid) {
      log.error(
        chalk.red(`[applyPatches] SHA256 mismatch for patch ${patch.to}`),
      );

      // Delete corrupted file
      try {
        await fs.unlink(patchZipPath);
        log.info(chalk.cyan('[applyPatches] Deleted corrupted patch ZIP'));
        await updateStorage((s) => {
          s.gameState.patches.downloadedVersion = String(currentVersion || '');
        });
      } catch (unlinkErr) {
        log.warn(
          chalk.yellow('[applyPatches] Could not delete corrupted patch ZIP:'),
          unlinkErr,
        );
      }

      throw new Error(
        `SHA256 mismatch for patch ${patch.to}. The file is corrupted. Please try again.`,
      );
    }

    log.info(chalk.green('[applyPatches] Checksum verified'));

    const extractPath = installDir;
    log.info(chalk.cyan(`[applyPatches] Extracting to: ${extractPath}`));

    try {
      await extractZip(patchZipPath, extractPath, onExtractProgress);
      log.info(chalk.green('[applyPatches] Extraction complete'));
    } catch (extractErr) {
      log.error(
        chalk.red(`[applyPatches] Extraction failed for patch ${patch.to}:`),
        extractErr,
      );

      // If extraction fails, the ZIP is likely corrupted - delete it
      try {
        await fs.unlink(patchZipPath);
        log.info(chalk.cyan('[applyPatches] Deleted corrupted patch ZIP'));
        await updateStorage((s) => {
          s.gameState.patches.downloadedVersion = String(currentVersion || '');
        });
      } catch (unlinkErr) {
        log.warn(
          chalk.yellow('[applyPatches] Could not delete corrupted patch ZIP:'),
          unlinkErr,
        );
      }

      throw new Error(
        `Patch extraction failed: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}. The ZIP file may be corrupted. Please try again.`,
      );
    }

    // Verify extracted files (patches should have at least 1 file)
    const verification = await verifyExtractedFiles(extractPath, 1);
    if (!verification.success) {
      log.error(
        chalk.red(
          `[applyPatches] Extraction verification failed for patch ${patch.to}!`,
        ),
      );
      throw new Error(`Extraction verification failed for patch ${patch.to}`);
    }
    log.info(
      chalk.green(
        `[applyPatches] Verification passed: ${verification.fileCount} files extracted`,
      ),
    );

    await updateStorage((s) => {
      s.gameState.patches.appliedVersion = patch.to;
    });

    // Update version in storage (installDir is ignored by setClientVersion)
    await setClientVersion(installDir, patch.to);

    // Get updated version to continue loop
    currentVersion = await getClientVersion(installDir);
    log.info(
      chalk.green(
        `[applyPatches] Successfully patched from ${patch.from} to ${patch.to}`,
      ),
    );
  }

  // Always set availableVersion from manifest
  await updateStorage((s) => {
    s.gameState.availableVersion = latestVersion;
  });

  if (currentVersion === latestVersion) {
    log.info(
      chalk.green(
        `[applyPatches] ✓ Client is now up to date: ${currentVersion}`,
      ),
    );
  } else {
    log.warn(
      chalk.yellow(
        `[applyPatches] Client could not be fully updated. Current: ${currentVersion}, Latest: ${latestVersion}`,
      ),
    );
  }
}
