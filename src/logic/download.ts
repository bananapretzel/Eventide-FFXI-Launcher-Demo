import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, moveFile } from '../core/fs';
import { setClientVersion } from '../core/versions';
import { join } from 'path';
import { updateStorage } from '../core/storage';

export async function downloadGame(
  url: string,
  sha256: string,
  installDir: string,
  downloadsDir: string,
  baseVersion: string,
  onProgress?: (dl: number, total: number) => void
): Promise<void> {
  const zipName = url.split('/').pop() || 'base-game.zip';
  const zipPath = join(downloadsDir, zipName);
  await downloadFile(url, zipPath, onProgress);
  await updateStorage(s => { s.GAME_UPDATER.baseGame.downloaded = true; });
  if (!(await verifySha256(zipPath, sha256))) throw new Error('SHA256 mismatch');
  await extractZip(zipPath, installDir);
  await updateStorage(s => { s.GAME_UPDATER.baseGame.extracted = true; });
  const projectRoot = require('path').resolve(__dirname, '../../');
  await setClientVersion(projectRoot, baseVersion);
  await updateStorage(s => { s.GAME_UPDATER.currentVersion = baseVersion; });
}
