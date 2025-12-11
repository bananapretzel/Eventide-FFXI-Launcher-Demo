import { promises as fs } from 'fs';
import { getEventidePaths } from '../main/paths';

// Simple write lock to prevent concurrent storage writes (especially on Wine)
let writeInProgress: Promise<void> | null = null;

export interface DownloadProgress {
  url: string;           // URL being downloaded
  destPath: string;      // Destination file path
  bytesDownloaded: number; // Bytes successfully downloaded
  totalBytes: number;    // Total file size
  sha256: string;        // Expected checksum for verification
  isPaused: boolean;     // Whether download is paused
  startedAt: number;     // Timestamp when download started
  lastUpdatedAt: number; // Timestamp of last progress update
}

export interface GameState {
  installedVersion: string;
  availableVersion: string;
  baseGame: {
    isDownloaded: boolean;
    isExtracted: boolean;
  };
  patches: {
    downloadedVersion: string;
    appliedVersion: string;
  };
  downloadProgress?: DownloadProgress; // Track resumable download state
}

// Legacy interface for migration (schema v1)
interface LegacyGameUpdaterState {
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
  downloadProgress?: DownloadProgress;
}

export interface StorageJson {
  schemaVersion: number;
  paths: {
    installPath: string;
    downloadPath: string;
    customInstallDir?: string; // Custom base installation directory chosen by user
  };
  gameState: GameState;
}

// Legacy interface for migration
interface LegacyStorageJson {
  schemaVersion: number;
  paths: {
    installPath: string;
    downloadPath: string;
    customInstallDir?: string;
  };
  GAME_UPDATER: LegacyGameUpdaterState;
}


const STORAGE_SCHEMA_VERSION = 2;
const getStoragePath = () => getEventidePaths().storage;

/**
 * Migrates storage from schema v1 to v2
 * - Renames GAME_UPDATER to gameState
 * - Renames updater to patches
 * - Renames fields for clarity
 */
function migrateV1ToV2(data: LegacyStorageJson): StorageJson {
  return {
    schemaVersion: 2,
    paths: data.paths,
    gameState: {
      installedVersion: data.GAME_UPDATER.currentVersion,
      availableVersion: data.GAME_UPDATER.latestVersion,
      baseGame: {
        isDownloaded: data.GAME_UPDATER.baseGame.downloaded,
        isExtracted: data.GAME_UPDATER.baseGame.extracted,
      },
      patches: {
        downloadedVersion: data.GAME_UPDATER.updater.downloaded,
        appliedVersion: data.GAME_UPDATER.updater.extracted,
      },
      downloadProgress: data.GAME_UPDATER.downloadProgress,
    },
  };
}

// Validate structure and types of storage.json
export function validateStorageJson(data: any): data is StorageJson {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.schemaVersion !== 'number') return false;

  // Check for v1 schema and migrate if needed
  if (data.schemaVersion === 1 && data.GAME_UPDATER) {
    return false; // Will trigger migration in readStorage
  }

  if (data.schemaVersion !== STORAGE_SCHEMA_VERSION) return false;
  if (!data.paths || typeof data.paths.installPath !== 'string' || typeof data.paths.downloadPath !== 'string') return false;
  if (!data.gameState) return false;

  const g = data.gameState;
  if (typeof g.installedVersion !== 'string') return false;
  if (typeof g.availableVersion !== 'string') {
    g.availableVersion = '0.0.0';
  }
  if (!g.baseGame || typeof g.baseGame.isDownloaded !== 'boolean' || typeof g.baseGame.isExtracted !== 'boolean') return false;
  if (!g.patches || typeof g.patches.downloadedVersion !== 'string' || typeof g.patches.appliedVersion !== 'string') return false;
  return true;
}

/**
 * Check if data is valid v1 schema (for migration)
 */
function isValidV1Schema(data: any): data is LegacyStorageJson {
  if (!data || typeof data !== 'object') return false;
  if (data.schemaVersion !== 1) return false;
  if (!data.paths || typeof data.paths.installPath !== 'string' || typeof data.paths.downloadPath !== 'string') return false;
  if (!data.GAME_UPDATER) return false;
  const g = data.GAME_UPDATER;
  if (typeof g.currentVersion !== 'string') return false;
  if (!g.baseGame || typeof g.baseGame.downloaded !== 'boolean' || typeof g.baseGame.extracted !== 'boolean') return false;
  if (!g.updater || typeof g.updater.downloaded !== 'string' || typeof g.updater.extracted !== 'string') return false;
  return true;
}


/**
 * Reads storage.json, validates, migrates if needed, and resets if corrupt/invalid. Logs if reset.
 */
export async function readStorage(logReset?: (msg: string) => void): Promise<StorageJson | null> {
  const storagePath = getStoragePath();
  try {
    const data = await fs.readFile(storagePath, 'utf-8');
    const parsed = JSON.parse(data);

    // Check for v1 schema and migrate
    if (isValidV1Schema(parsed)) {
      if (logReset) logReset(`[storage] Migrating storage.json from schema v1 to v2`);
      const migrated = migrateV1ToV2(parsed);
      await writeStorage(migrated);
      return migrated;
    }

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


// Internal write function with fallback for Wine/Linux compatibility
// Atomic rename can fail on Wine due to EPERM or cross-filesystem issues
async function writeStorageInternal(data: StorageJson): Promise<void> {
  const storagePath = getStoragePath();
  const tmpPath = storagePath + '.tmp';
  const jsonContent = JSON.stringify(data, null, 2);

  try {
    // Try atomic write first (write to temp, then rename)
    await fs.writeFile(tmpPath, jsonContent, 'utf-8');
    await fs.rename(tmpPath, storagePath);
  } catch (err: any) {
    // Fallback for Wine/Linux: EPERM, ENOENT, or EXDEV errors during rename
    if (err.code === 'EPERM' || err.code === 'ENOENT' || err.code === 'EXDEV') {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tmpPath);
      } catch { /* ignore */ }

      // Direct write fallback (less safe but works on Wine)
      await fs.writeFile(storagePath, jsonContent, 'utf-8');
    } else {
      throw err;
    }
  }
}

// Write storage with serialization to prevent concurrent write issues on Wine
export async function writeStorage(data: StorageJson): Promise<void> {
  // Wait for any pending write to complete
  if (writeInProgress) {
    try {
      await writeInProgress;
    } catch { /* ignore errors from previous write */ }
  }

  // Start our write and track it
  writeInProgress = writeStorageInternal(data);
  try {
    await writeInProgress;
  } finally {
    writeInProgress = null;
  }
}


export async function updateStorage(updater: (data: StorageJson) => void, logReset?: (msg: string) => void): Promise<void> {
  let data = (await readStorage(logReset)) || getDefaultStorage();
  updater(data);
  await writeStorage(data);
}

export function getDefaultStorage(): StorageJson {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    paths: {
      installPath: '',
      downloadPath: '',
      customInstallDir: '' // Will be set when user selects install directory
    },
    gameState: {
      installedVersion: "0.0.0",
      availableVersion: "0.0.0",
      baseGame: { isDownloaded: false, isExtracted: false },
      patches: { downloadedVersion: "", appliedVersion: "" },
    },
  };
}

// ============================================================================
// Download Progress Management Functions
// ============================================================================

/**
 * Save download progress to storage for resume capability
 */
export async function saveDownloadProgress(progress: DownloadProgress): Promise<void> {
  await updateStorage(s => {
    s.gameState.downloadProgress = {
      ...progress,
      lastUpdatedAt: Date.now(),
    };
  });
}

/**
 * Get saved download progress, if any
 */
export async function getDownloadProgress(): Promise<DownloadProgress | null> {
  const storage = await readStorage();
  return storage?.gameState?.downloadProgress || null;
}

/**
 * Clear download progress (call after successful completion or to cancel)
 */
export async function clearDownloadProgress(): Promise<void> {
  await updateStorage(s => {
    delete s.gameState.downloadProgress;
  });
}

/**
 * Update only the bytes downloaded (for frequent progress updates without full storage write)
 * This is a lighter weight update for progress tracking
 */
export async function updateDownloadBytes(bytesDownloaded: number): Promise<void> {
  await updateStorage(s => {
    if (s.gameState.downloadProgress) {
      s.gameState.downloadProgress.bytesDownloaded = bytesDownloaded;
      s.gameState.downloadProgress.lastUpdatedAt = Date.now();
    }
  });
}

/**
 * Set the paused state of the current download
 */
export async function setDownloadPaused(isPaused: boolean): Promise<void> {
  await updateStorage(s => {
    if (s.gameState.downloadProgress) {
      s.gameState.downloadProgress.isPaused = isPaused;
      s.gameState.downloadProgress.lastUpdatedAt = Date.now();
    }
  });
}

// Utility: check for required files in install dir
import path from 'path';
import fsSync from 'fs';
export function hasRequiredGameFiles(installDir: string): boolean {
  // Add more required files as needed
  const requiredFiles = ['ashita-cli.exe'];
  return requiredFiles.every(f => fsSync.existsSync(path.join(installDir, f)));
}
