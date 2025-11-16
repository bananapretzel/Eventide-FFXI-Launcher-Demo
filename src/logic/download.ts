import { downloadFile } from '../core/net';
import { verifySha256 } from '../core/hash';
import { extractZip, moveFile } from '../core/fs';
import { setClientVersion } from '../core/versions';
import { join } from 'path';

export async function downloadGame(
  url: string,
  sha256: string,
  installDir: string,
  baseVersion: string,
  onProgress?: (dl: number, total: number) => void
): Promise<void> {
  const tmpZip = join(installDir, 'tmp-game.zip');
  await downloadFile(url, tmpZip, onProgress);
  if (!(await verifySha256(tmpZip, sha256))) throw new Error('SHA256 mismatch');
  await extractZip(tmpZip, installDir);
  const projectRoot = require('path').resolve(__dirname, '../../');
  await setClientVersion(projectRoot, baseVersion);
}
