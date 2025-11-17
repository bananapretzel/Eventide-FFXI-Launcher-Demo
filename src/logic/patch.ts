import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip } from '../core/fs';
import { setClientVersion, getClientVersion, compareVersions } from '../core/versions';
import path from 'path';
import { PatchManifest } from '../core/manifest';
import { join } from 'path';
import { updateStorage } from '../core/storage';

export async function applyPatches(
  manifest: PatchManifest,
  _clientVersion: string,
  installDir: string,
  onProgress?: (patch: string, dl: number, total: number) => void
): Promise<void> {
  const latestVersion = manifest.latestVersion;
  const patches = manifest.patches || [];

  // Always use the project root for versioning
  const devRoot = path.resolve(__dirname, '../../');

  let currentVersion = await getClientVersion(devRoot);
  if (!currentVersion) {
    // eslint-disable-next-line no-console
    console.warn('No client version found in game-version.json. Aborting update.');
    return;
  }

  const downloadsDir = path.join(installDir, '..', 'Downloads');
  while (currentVersion !== latestVersion) {
    const patch = patches.find(p => p.from === currentVersion);
    if (!patch) {
      // eslint-disable-next-line no-console
      console.warn(`No patch found from version ${currentVersion} to update toward ${latestVersion}. Aborting update loop.`);
      break;
    }
    const patchZipName = patch.fullUrl.split('/').pop();
    const patchZipPath = patchZipName ? path.join(downloadsDir, patchZipName) : '';
    // Check if patch zip exists in downloads
    let zipExists = false;
    if (patchZipPath && require('fs').existsSync(patchZipPath)) {
      zipExists = true;
      await updateStorage(s => { s.GAME_UPDATER.updater.downloaded = patch.to; });
    } else {
      // Download if not present
      await downloadFile(patch.fullUrl, patchZipPath, (dl, total) => onProgress?.(patch.to, dl, total));
      await updateStorage(s => { s.GAME_UPDATER.updater.downloaded = patch.to; });
    }
    if (!(await verifySha256(patchZipPath, patch.sha256))) throw new Error(`SHA256 mismatch for patch ${patch.to}`);
    await extractZip(patchZipPath, path.join(installDir, 'polplugins/DATs/Eventide/'));
    await updateStorage(s => { s.GAME_UPDATER.updater.extracted = patch.to; });
    await setClientVersion(devRoot, patch.to);
    await updateStorage(s => { s.GAME_UPDATER.currentVersion = patch.to; });
    currentVersion = await getClientVersion(devRoot);
    // eslint-disable-next-line no-console
    console.log(`Patched from ${patch.from} to ${patch.to}`);
  }

  // Always set latestVersion from manifest
  await updateStorage(s => { s.GAME_UPDATER.latestVersion = latestVersion; });

  if (currentVersion === latestVersion) {
    // eslint-disable-next-line no-console
    console.log('Client is now up to date:', currentVersion);
  } else {
    // eslint-disable-next-line no-console
    console.warn('Client could not be fully updated. Final version:', currentVersion);
  }
}
