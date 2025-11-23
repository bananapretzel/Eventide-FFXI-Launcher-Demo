import { promises as fs } from 'fs';
import { getEventidePaths } from '../main/paths';

export interface GameUpdaterState {
  currentVersion: string;
  latestVersion: string;
  baseGame: {
    downloaded: boolean;
    extracted: boolean;
  };
  updater: {
    downloaded: string;
    extracted: string;
  };
}


export interface StorageJson {
  schemaVersion: number;
  paths: {
    installPath: string;
    downloadPath: string;
  };
  GAME_UPDATER: GameUpdaterState;
}


const STORAGE_SCHEMA_VERSION = 1;
const getStoragePath = () => getEventidePaths().storage;

// Validate structure and types of storage.json
export function validateStorageJson(data: any): data is StorageJson {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion !== STORAGE_SCHEMA_VERSION) return false;
  if (!data.paths || typeof data.paths.installPath !== 'string' || typeof data.paths.downloadPath !== 'string') return false;
  if (!data.GAME_UPDATER) return false;
  const g = data.GAME_UPDATER;
  if (typeof g.currentVersion !== 'string') return false;
  if (typeof g.latestVersion !== 'string') {
    g.latestVersion = '0.0.0';
  }
  if (!g.baseGame || typeof g.baseGame.downloaded !== 'boolean' || typeof g.baseGame.extracted !== 'boolean') return false;
  if (!g.updater || typeof g.updater.downloaded !== 'string' || typeof g.updater.extracted !== 'string') return false;
  return true;
}


/**
 * Reads storage.json, validates, and resets if corrupt/invalid. Logs if reset.
 */
export async function readStorage(logReset?: (msg: string) => void): Promise<StorageJson | null> {
  const storagePath = getStoragePath();
  try {
    const data = await fs.readFile(storagePath, 'utf-8');
    const parsed = JSON.parse(data);
    if (validateStorageJson(parsed)) {
      return parsed;
    } else {
      if (logReset) logReset(`[storage] Invalid or outdated schema in storage.json, resetting.`);
      await writeStorage(getDefaultStorage());
      return getDefaultStorage();
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    if (logReset) logReset(`[storage] Could not read storage.json (${errorMsg}), resetting.`);
    await writeStorage(getDefaultStorage());
    return getDefaultStorage();
  }
}


// Use atomic write (write to temp, then rename)
export async function writeStorage(data: StorageJson): Promise<void> {
  const storagePath = getStoragePath();
  const tmpPath = storagePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, storagePath);
}


export async function updateStorage(updater: (data: StorageJson) => void, logReset?: (msg: string) => void): Promise<void> {
  let data = (await readStorage(logReset)) || getDefaultStorage();
  updater(data);
  await writeStorage(data);
}

export function getDefaultStorage(): StorageJson {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    paths: { installPath: '', downloadPath: '' },
    GAME_UPDATER: {
      currentVersion: "0.0.0",
      latestVersion: "0.0.0",
      baseGame: { downloaded: false, extracted: false },
      updater: { downloaded: "", extracted: "" },
    },
  };
}

// Utility: check for required files in install dir
import path from 'path';
import fsSync from 'fs';
export function hasRequiredGameFiles(installDir: string): boolean {
  // Add more required files as needed
  const requiredFiles = ['ashita-cli.exe'];
  return requiredFiles.every(f => fsSync.existsSync(path.join(installDir, f)));
}
