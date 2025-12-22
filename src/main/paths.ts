import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from './logger';

// In-memory cache for custom installation directory
let customInstallDir: string | null = null;

// In-memory cache for direct game install path override
// When set, this is used directly instead of customInstallDir + "/Game"
// This allows legacy users to point to existing game installations that don't follow the new folder structure
let gameInstallPath: string | null = null;

/**
 * Set custom installation directory (called after reading from storage.json)
 */
export function setCustomInstallDir(dir: string | null): void {
  customInstallDir = dir;
}

/**
 * Get custom installation directory
 */
export function getCustomInstallDir(): string | null {
  return customInstallDir;
}

/**
 * Set direct game install path override (for legacy launcher migrations)
 * When set, this path is used directly for gameRoot instead of computing customInstallDir + "/Game"
 */
export function setGameInstallPath(dir: string | null): void {
  gameInstallPath = dir;
}

/**
 * Get direct game install path override
 */
export function getGameInstallPath(): string | null {
  return gameInstallPath;
}

/**
 * Returns all important Eventide launcher paths.
 * If a custom installation directory is set, Game and Downloads will be under that directory.
 * Otherwise, falls back to default location under Electron's userData directory.
 *
 * Layout (default):
 *   <userData>/Eventide/
 *     Downloads/   -> where we store downloaded zip archives (base client + patches)
 *     Game/        -> where the unpacked FFXI client lives
 *     logs/        -> launcher logs
 *     config.json  -> launcher config
 *     storage.json -> generic persistent state
 *
 * Layout (custom):
 *   <customDir>/
 *     Downloads/   -> downloaded zip archives
 *     Game/        -> unpacked FFXI client
 *   <userData>/
 *     logs/        -> launcher logs
 *     config.json  -> launcher config
 *     storage.json -> generic persistent state
 *
 * @param forceDefault - If false and no custom dir is set, returns empty strings for game paths
 */
export function getEventidePaths(forceDefault: boolean = true) {
  const root = app.getPath('userData');

  // Determine if we should return actual paths or empty strings
  const shouldReturnPaths =
    forceDefault || customInstallDir !== null || gameInstallPath !== null;

  // Use custom directory if set, otherwise default to userData/Eventide (or empty if not forced)
  const baseInstallDir =
    customInstallDir || (shouldReturnPaths ? path.join(root, 'Eventide') : '');

  // Game path: use direct override if set (for legacy launcher migrations),
  // otherwise compute from base directory
  // This allows users migrating from the old launcher to point directly to their existing game files
  // without the launcher assuming a specific folder structure
  let gameRoot: string;
  if (gameInstallPath) {
    // Direct override - use the path exactly as specified
    gameRoot = gameInstallPath;
  } else if (baseInstallDir) {
    // Standard path - append "Game" to base directory
    gameRoot = path.join(baseInstallDir, 'Game');
  } else {
    gameRoot = '';
  }

  // Downloads path - derive from gameRoot's parent directory if using override,
  // otherwise use standard base directory
  let dlRoot: string;
  if (gameInstallPath) {
    // When using direct game path, put downloads in sibling "Downloads" folder
    const parentDir = path.dirname(gameInstallPath);
    dlRoot = path.join(parentDir, 'Downloads');
  } else if (baseInstallDir) {
    dlRoot = path.join(baseInstallDir, 'Downloads');
  } else {
    dlRoot = '';
  }

  // Config, storage, and logs always stay in userData for consistency
  const logsRoot = path.join(root, 'logs');
  const config = path.join(root, 'config.json');
  const storage = path.join(root, 'storage.json');

  return { userData: root, root, gameRoot, dlRoot, logsRoot, config, storage };
}

/**
 * Ensures all required Eventide directories exist.
 * Creates: root (userData), logs, and optionally Game/Downloads
 * If custom install directory is set, creates Game and Downloads there
 * @param includeGameDirs - Whether to create Game and Downloads directories (default: true)
 */
export function ensureDirs(includeGameDirs: boolean = true) {
  const paths = getEventidePaths();

  // Always create userData and logs directories
  const essentialDirs = [paths.logsRoot];

  // Only create game directories if explicitly requested
  const dirsToCreate = includeGameDirs
    ? [...essentialDirs, paths.gameRoot, paths.dlRoot]
    : essentialDirs;

  dirsToCreate.forEach((dir) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      log.error(`Failed to create directory: ${dir}`, e);
    }
  });
}

/**
 * Validates if a directory is suitable for game installation
 * Checks: exists, is writable, has enough space
 */
export async function validateInstallDirectory(
  dir: string,
  requiredSpaceBytes: number = 10 * 1024 * 1024 * 1024,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if directory exists or can be created
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return {
          valid: false,
          error: `Cannot create directory: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Check if directory is writable
    const testFile = path.join(dir, `.write-test-${Date.now()}`);
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      return {
        valid: false,
        error: `Directory is not writable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check disk space (basic check)
    // Note: This is a simplified check. For production, you might want to use a library like 'check-disk-space'
    const stats = fs.statfsSync ? fs.statfsSync(dir) : null;
    if (stats) {
      const availableSpace = stats.bavail * stats.bsize;
      if (availableSpace < requiredSpaceBytes) {
        const availableGB = (availableSpace / (1024 * 1024 * 1024)).toFixed(2);
        const requiredGB = (requiredSpaceBytes / (1024 * 1024 * 1024)).toFixed(
          2,
        );
        return {
          valid: false,
          error: `Insufficient disk space. Available: ${availableGB} GB, Required: ${requiredGB} GB`,
        };
      }
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Validation error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
