import { readJson, writeJson, fileExists } from './fs';
import { join } from 'path';
import { readStorage, updateStorage, StorageJson } from './storage';
import log from 'electron-log';
import chalk from 'chalk';

/**
 * Gets the current client version from storage.json in AppData
 * @param installDir - Ignored, kept for API compatibility. Version is in AppData storage.json
 * @returns The current version or null if not found
 */
export async function getClientVersion(installDir: string): Promise<string | null> {
  try {
    log.info(chalk.cyan('[getClientVersion] Reading version from AppData storage.json'));
    const storage = await readStorage();
    if (!storage) {
      log.warn(chalk.yellow('[getClientVersion] No storage.json found in AppData'));
      return null;
    }
    const version = storage.GAME_UPDATER?.currentVersion || null;
    log.info(chalk.cyan(`[getClientVersion] Current version: ${version}`));
    return version;
  } catch (err) {
    log.error(chalk.red('[getClientVersion] Failed to read version:'), err);
    return null;
  }
}

/**
 * Sets the client version in storage.json in AppData
 * @param installDir - Ignored, kept for API compatibility. Version is stored in AppData storage.json
 * @param version - The version to set
 */
export async function setClientVersion(installDir: string, version: string): Promise<void> {
  try {
    log.info(chalk.cyan(`[setClientVersion] Setting version to: ${version}`));
    await updateStorage((data: StorageJson) => {
      data.GAME_UPDATER.currentVersion = version;
    });
    log.info(chalk.green(`[setClientVersion] Version updated successfully to ${version}`));
  } catch (err) {
    log.error(chalk.red('[setClientVersion] Failed to set version:'), err);
    throw err;
  }
}

export function compareVersions(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
