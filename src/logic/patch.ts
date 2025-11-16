import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip } from '../core/fs';

import { setClientVersion, getClientVersion, compareVersions } from '../core/versions';
import path from 'path';
import { PatchManifest } from '../core/manifest';
import { join } from 'path';

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

  while (currentVersion !== latestVersion) {
    const patch = patches.find(p => p.from === currentVersion);
    if (!patch) {
      // eslint-disable-next-line no-console
      console.warn(`No patch found from version ${currentVersion} to update toward ${latestVersion}. Aborting update loop.`);
      break;
    }
    const tmpZip = join(installDir, `tmp-patch-${patch.from}-to-${patch.to}.zip`);
    await downloadFile(patch.fullUrl, tmpZip, (dl, total) => onProgress?.(patch.to, dl, total));
    if (!(await verifySha256(tmpZip, patch.sha256))) throw new Error(`SHA256 mismatch for patch ${patch.to}`);
    await extractZip(tmpZip, join(installDir, 'polplugins/DATs/Eventide/'));
    await setClientVersion(devRoot, patch.to);
    currentVersion = await getClientVersion(devRoot);
    // eslint-disable-next-line no-console
    console.log(`Patched from ${patch.from} to ${patch.to}`);
  }

  if (currentVersion === latestVersion) {
    // eslint-disable-next-line no-console
    console.log('Client is now up to date:', currentVersion);
  } else {
    // eslint-disable-next-line no-console
    console.warn('Client could not be fully updated. Final version:', currentVersion);
  }
}
