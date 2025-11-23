
import log from 'electron-log';
import chalk from 'chalk';
import { getEventidePaths, ensureDirs } from './paths';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import keytar from 'keytar';
import { spawn } from 'child_process';
import ini from 'ini';
import { resolveHtmlPath } from './util';
import { RELEASE_JSON_URL } from './config';
import { getClientVersion } from '../core/versions';
import { getReleaseJson, getPatchManifest, getPatchNotes } from '../core/manifest';
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { readStorage, writeStorage, updateStorage, hasRequiredGameFiles, getDefaultStorage, validateStorageJson, StorageJson } from '../core/storage';
import { bootstrap as logicBootstrap } from '../logic/bootstrap';
import { writeJson, readJson } from '../core/fs';
import { autoUpdater } from 'electron-updater';
import { downloadGame } from '../logic/download';
import { applyPatches } from '../logic/patch';
import { getDefaultAddonsObject, getDefaultPluginsObject } from './defaultExtensions';

// Cache for manifest data to avoid redundant network calls
interface ManifestCache {
  release: any | null;
  patchManifest: any | null;
  timestamp: number | null;
}

const manifestCache: ManifestCache = {
  release: null,
  patchManifest: null,
  timestamp: null,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches release and patch manifest, using cache if available and fresh
 */
async function getCachedManifests(): Promise<{ release: any; patchManifest: any }> {
  const now = Date.now();

  // Check if cache is valid
  if (
    manifestCache.release &&
    manifestCache.patchManifest &&
    manifestCache.timestamp &&
    (now - manifestCache.timestamp) < CACHE_TTL_MS
  ) {
    log.info(chalk.cyan('[getCachedManifests] Using cached manifest data'));
    return {
      release: manifestCache.release,
      patchManifest: manifestCache.patchManifest,
    };
  }

  // Cache is stale or empty, fetch fresh data
  log.info(chalk.cyan('[getCachedManifests] Fetching fresh manifest data...'));
  const release = await getReleaseJson(RELEASE_JSON_URL);
  const patchManifest = await getPatchManifest(release.patchManifestUrl);

  // Update cache
  manifestCache.release = release;
  manifestCache.patchManifest = patchManifest;
  manifestCache.timestamp = now;

  return { release, patchManifest };
}

/**
 * Invalidates the manifest cache, forcing a fresh fetch on next request
 */
function invalidateManifestCache(): void {
  log.info(chalk.yellow('[invalidateManifestCache] Cache invalidated'));
  manifestCache.release = null;
  manifestCache.patchManifest = null;
  manifestCache.timestamp = null;
}
// IPC handler for bootstrap (used by renderer to get initial state)
ipcMain.handle('launcher:bootstrap', async (_event, releaseUrl: string, installDir: string) => {
  try {
    // Get release, patchManifest, clientVersion from logic/bootstrap
    const { release, patchManifest, clientVersion } = await logicBootstrap(releaseUrl, installDir);
    // Get baseGameDownloaded and baseGameExtracted from storage.json
    let baseGameDownloaded = false;
    let baseGameExtracted = false;
    try {
      const storage = await readStorage();
      if (storage && storage.GAME_UPDATER) {
        baseGameDownloaded = storage.GAME_UPDATER.baseGame.downloaded;
        baseGameExtracted = storage.GAME_UPDATER.baseGame.extracted;
      }
    } catch (e) {
      log.warn('[launcher:bootstrap] Could not read storage.json:', e);
    }
    return { release, patchManifest, clientVersion, baseGameDownloaded, baseGameExtracted };
  } catch (err) {
    log.error('[launcher:bootstrap] error:', err);
    return { error: String(err) };
  }
});



// Set the app name to 'Eventide Launcherv2' so userData points to %APPDATA%\Eventide Launcherv2
app.setName('Eventide Launcherv2');

// --- Ensure config.json exists with defaults on startup ---
// ...existing code...
/**
 * Consolidated extraction logic for base game zip with progress reporting
 * @param storageData - Current storage data to update
 * @param dlRoot - Download directory path
 * @param gameRoot - Game installation directory path
 * @returns true if extraction was performed, false if skipped
 */
async function extractBaseGameIfNeeded(storageData: any, dlRoot: string, gameRoot: string): Promise<boolean> {
  try {
    const { extractZip } = require('../core/fs');
    const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
    const baseGameZipPath = path.join(dlRoot, baseGameZipName);

    if (!fs.existsSync(baseGameZipPath)) {
      log.info(chalk.cyan('[startup] Expected base game zip not found at'), baseGameZipPath);
      return false;
    }

    log.info(chalk.cyan('[startup] Game zip is downloaded but not extracted. Extracting now...'));
    const g: any = global;
    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:start');
    }

    await extractZip(baseGameZipPath, gameRoot);

    // Update storage atomically
    storageData.GAME_UPDATER.baseGame.extracted = true;
    await writeStorage(storageData);

    log.info(chalk.cyan('[startup] Extraction complete. Updated baseGame.extracted to true.'));

    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:done');
    }

    return true;
  } catch (extractErr) {
    log.error(chalk.red('[startup] Error during auto-extraction:'), extractErr);
    const g: any = global;
    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:error', { error: String(extractErr) });
    }
    throw extractErr; // Re-throw to let caller handle
  }
}


app.once('ready', async () => {
  try {
    ensureDirs(); // Centralized directory creation
    const paths = getEventidePaths();
    const { gameRoot, dlRoot } = paths;

    // Step 1: Read or initialize storage.json
    let storageData = await readStorage((msg) => log.warn(chalk.yellow(msg)));
    if (!storageData) {
      storageData = getDefaultStorage();
      await writeStorage(storageData);
      log.warn(chalk.yellow('[startup] storage.json was missing or invalid, created default.'));
    }

    // Step 2: Ensure paths are set in storage
    let changed = false;
    if (!storageData.paths.installPath) {
      storageData.paths.installPath = gameRoot;
      changed = true;
    }
    if (!storageData.paths.downloadPath) {
      storageData.paths.downloadPath = dlRoot;
      changed = true;
    }
    if (changed) {
      await writeStorage(storageData);
      log.info(chalk.cyan('[startup] Updated storage.json with paths.'));
    }

    const version = app.getVersion ? app.getVersion() : 'unknown';
    const env = process.env.NODE_ENV || 'production';
    log.info(chalk.cyan(`[startup] Launcher version: ${version}, environment: ${env}`));

    // --- Configure launcher auto-updates ---
    try {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('checking-for-update', () => {
        log.info(chalk.cyan('[autoUpdater] checking for update'));
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'checking',
        });
      });

      autoUpdater.on('update-available', (info) => {
        log.info(chalk.cyan('[autoUpdater] update available'), info);
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'update-available',
          info,
        });
      });

      autoUpdater.on('update-not-available', (info) => {
        log.info(chalk.cyan('[autoUpdater] update not available'), info);
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'up-to-date',
          info,
        });
      });

      autoUpdater.on('download-progress', (progress) => {
        const { bytesPerSecond, percent, transferred, total } = progress;
        log.info(
          chalk.cyan('[autoUpdater] download progress'),
          `${percent.toFixed(1)}% (${transferred}/${total}) @ ${bytesPerSecond} B/s`,
        );
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'downloading',
          progress,
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        log.info(chalk.cyan('[autoUpdater] update downloaded'), info);
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'downloaded',
          info,
        });
      });

      autoUpdater.on('error', (error) => {
        log.error(chalk.red('[autoUpdater] error'), error);
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } catch (updateErr) {
      log.error(chalk.red('[startup] Failed to configure autoUpdater'), updateErr);
    }

    // Step 3: Create default config.json if needed
    const configPath = paths.config;
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        username: '',
        password: '',
        rememberCredentials: false,
        launcherVersion: version,
        installDir: '',
        addons: getDefaultAddonsObject(),
        plugins: getDefaultPluginsObject()
      };
      await writeJson(configPath, defaultConfig);
      log.info(chalk.cyan('[startup] First run detected. Created default config.json at'), configPath);
    }

    // Step 4: Verify game state from file system
    const baseGameZipName = 'Eventide-test.zip';
    const baseGameZipPath = path.join(dlRoot, baseGameZipName);
    const zipExists = fs.existsSync(baseGameZipPath);
    const filesExist = hasRequiredGameFiles(gameRoot);

    // Step 5: Sync storage with actual file system state
    let needsUpdate = false;
    if (storageData.GAME_UPDATER.baseGame.downloaded !== zipExists) {
      storageData.GAME_UPDATER.baseGame.downloaded = zipExists;
      needsUpdate = true;
      log.info(chalk.cyan(`[startup] Synced baseGame.downloaded to ${zipExists}`));
    }

    if (storageData.GAME_UPDATER.baseGame.extracted !== filesExist) {
      storageData.GAME_UPDATER.baseGame.extracted = filesExist;
      needsUpdate = true;
      log.info(chalk.cyan(`[startup] Synced baseGame.extracted to ${filesExist}`));
    }

    // Step 6: Fetch remote version info FIRST (needed for version reset logic)
    let release: any = null;
    let patchManifest: any = null;
    let remoteVersion: string = "0";
    let baseVersion: string = "1.0.0"; // fallback default

    try {
      log.info(chalk.cyan('[startup] Fetching remote release and patch manifest...'));
      const manifests = await getCachedManifests();
      release = manifests.release;
      patchManifest = manifests.patchManifest;
      remoteVersion = patchManifest.latestVersion;
      baseVersion = release.game.baseVersion || "1.0.0";
      log.info(chalk.cyan(`[startup] Remote versions - base: ${baseVersion}, latest: ${remoteVersion}`));
    } catch (remoteErr) {
      log.warn(chalk.yellow('[startup] Failed to fetch remote version info:'), remoteErr);
      // Continue with fallback values
    }

    // Step 7: Auto-extract if downloaded but not extracted
    if (zipExists && !filesExist) {
      try {
        log.info(chalk.cyan('[startup] Game zip exists but not extracted. Extracting now...'));
        await extractBaseGameIfNeeded(storageData, dlRoot, gameRoot);
        // Re-check after extraction
        storageData.GAME_UPDATER.baseGame.extracted = hasRequiredGameFiles(gameRoot);
        // IMPORTANT: Reset version to base version after extraction (even if storage had a different version)
        storageData.GAME_UPDATER.currentVersion = baseVersion;
        storageData.GAME_UPDATER.updater.downloaded = "0";
        storageData.GAME_UPDATER.updater.extracted = "0";
        needsUpdate = true;
        log.info(chalk.cyan(`[startup] Reset version to ${baseVersion} after base game extraction`));

        // Notify renderer that extraction is complete and state has changed
        const g: any = global;
        if (g.mainWindow && g.mainWindow.webContents) {
          g.mainWindow.webContents.send('game:status', {
            status: 'update-available',
            installedVersion: baseVersion,
            remoteVersion: remoteVersion !== "0" ? remoteVersion : undefined
          });
          log.info(chalk.cyan('[startup] Notified renderer of update-available state'));
        }
      } catch (extractErr) {
        log.error(chalk.red('[startup] Auto-extraction failed:'), extractErr);
        storageData.GAME_UPDATER.baseGame.extracted = false;
        needsUpdate = true;
      }
    }

    // Step 8: Initialize version if this is first extraction (for backward compatibility)
    if (isZeroVersion(storageData.GAME_UPDATER.currentVersion) && storageData.GAME_UPDATER.baseGame.extracted) {
      storageData.GAME_UPDATER.currentVersion = baseVersion;
      needsUpdate = true;
      log.info(chalk.cyan(`[startup] Initialized version to ${baseVersion} after base game extraction`));
    }

    // Step 9: Ensure updater fields are initialized
    if (!storageData.GAME_UPDATER.updater.downloaded) {
      storageData.GAME_UPDATER.updater.downloaded = "0";
      needsUpdate = true;
    }
    if (!storageData.GAME_UPDATER.updater.extracted) {
      storageData.GAME_UPDATER.updater.extracted = "0";
      needsUpdate = true;
    }

    // Step 10: Update latestVersion in storage
    if (remoteVersion !== "0" && storageData.GAME_UPDATER.latestVersion !== remoteVersion) {
      storageData.GAME_UPDATER.latestVersion = remoteVersion;
      needsUpdate = true;
      log.info(chalk.cyan(`[startup] Updated latestVersion to ${remoteVersion}`));
    }

    if (needsUpdate) {
      await writeStorage(storageData);
      log.info(chalk.cyan('[startup] Storage updated after state sync'));
    }

    // Step 11: Log update status
    const currentVersion = storageData.GAME_UPDATER.currentVersion;
    if (currentVersion !== remoteVersion && remoteVersion !== "0") {
      log.info(chalk.cyan(`[startup] Update available: ${currentVersion} → ${remoteVersion}`));
    } else if (currentVersion === remoteVersion) {
      log.info(chalk.cyan('[startup] Game is up to date.'));
    }

    log.info(chalk.cyan('[startup] Initialization complete'));
  } catch (err) {
    log.error(chalk.red('[startup] Startup error:'), err);
  }
});

// IPC handlers for launcher self-updates
ipcMain.handle('launcher:checkForUpdates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    log.error(chalk.red('[launcher:checkForUpdates] error'), error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('launcher:downloadUpdate', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[launcher:downloadUpdate] error'), error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('launcher:installUpdate', async () => {
  try {
    const choice = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: 'A new version of the Eventide launcher has been downloaded. Restart now to install?',
    });

    if (choice.response === 0) {
      autoUpdater.quitAndInstall();
    }

    return { success: true };
  } catch (error) {
    log.error(chalk.red('[launcher:installUpdate] error'), error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// IPC handler to expose all EventideXI paths to the renderer
ipcMain.handle('eventide:get-paths', async () => {
  try {
    const paths = getEventidePaths();
    return { success: true, data: paths };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});


const SERVICE_NAME = 'EventideLauncher';
const KEYTAR_ACCOUNT_USERNAME = 'eventide-username';
const KEYTAR_ACCOUNT_PASSWORD = 'eventide-password';

// IPC handler to read config.json (settings)

async function readConfigHandler() {
  try {
    const paths = getEventidePaths();
    const configPath = paths.config;
    log.info(chalk.cyan('Reading config from:'), configPath);
    if (!fs.existsSync(configPath)) {
      log.warn(chalk.yellow('[config] Config file not found at'), configPath);
      return { success: false, error: 'Config file not found' };
    }
    log.info(chalk.cyan('[config] Reading config file at'), configPath);
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // Migration: Handle old structure with extensions.addons/plugins arrays
    if (config.extensions && !config.addons && !config.plugins) {
      log.info(chalk.cyan('[config] Migrating old extensions structure to new format'));

      // Convert addons array to object
      if (Array.isArray(config.extensions.addons)) {
        config.addons = {};
        config.extensions.addons.forEach((addon: any) => {
          const { name, ...rest } = addon;
          config.addons[name] = rest;
        });
      }

      // Convert plugins array to object
      if (Array.isArray(config.extensions.plugins)) {
        config.plugins = {};
        config.extensions.plugins.forEach((plugin: any) => {
          const { name, ...rest } = plugin;
          config.plugins[name] = rest;
        });
      }

      // Remove old extensions wrapper
      delete config.extensions;

      // Save migrated config
      try {
        await writeJson(configPath, config);
        log.info(chalk.cyan('[config] Migration completed and saved'));
      } catch (err) {
        log.warn(chalk.yellow('[config] Failed to save migrated config:'), err);
      }
    }

    // Retrieve both username and password from keytar if rememberCredentials is true
    let username = '';
    let password = '';
    if (config.rememberCredentials) {
      try {
        log.info(chalk.cyan('[keytar] Attempting to get credentials'));
        username = (await keytar.getPassword(SERVICE_NAME, KEYTAR_ACCOUNT_USERNAME)) || '';
        password = (await keytar.getPassword(SERVICE_NAME, KEYTAR_ACCOUNT_PASSWORD)) || '';
        log.info(chalk.cyan('[keytar] Got credentials?'), { username: !!username, password: !!password });
      } catch (e) {
        log.warn(chalk.yellow('[keytar] Failed to get credentials:'), e);
      }
    }
    return { success: true, data: { ...config, username, password } };
  } catch (error) {
    log.error(chalk.red('Error reading config file:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

ipcMain.handle('read-settings', readConfigHandler);
ipcMain.handle('read-config', readConfigHandler);

// Version normalization utility
function isZeroVersion(v: string): boolean {
  if (!v) return true;
  const norm = v.trim().replace(/\./g, '');
  return norm === '0';
}

// IPC handler to write config.json (settings)
ipcMain.handle('write-settings', async (_event, data: any) => {
  try {
    const paths = getEventidePaths();
    const configPath = paths.config;
    // Ensure all required directories exist before anything else
    ensureDirs();
    // Log the data to be written
    try {
      const json = JSON.stringify(data);
      if (json.length > 1000000) { // 1MB limit for sanity
        log.error(chalk.red('[write-settings] Refusing to write config: data too large'));
        return {
          success: false,
          error: 'Config data too large to write.'
        };
      }
      log.info(chalk.cyan('[write-settings] Writing config data:'), json.slice(0, 500) + (json.length > 500 ? '...truncated' : ''));
      log.info(chalk.cyan('[config] Writing config file at'), configPath);
      await writeJson(configPath, data);
    } catch (writeErr) {
      log.error(chalk.red('[write-settings] writeJson failed:'), writeErr);
      return {
        success: false,
        error: writeErr instanceof Error ? writeErr.stack || writeErr.message : String(writeErr)
      };
    }
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[write-settings] outer error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.stack || error.message : 'Unknown error'
    };
  }
});

// IPC handler to write default.txt script for Ashita auto-load
ipcMain.handle('write-default-script', async () => {
  try {
    const paths = getEventidePaths();
    const configPath = paths.config;

    // Read config to get enabled addons and plugins
    if (!fs.existsSync(configPath)) {
      log.warn(chalk.yellow('[write-default-script] Config file not found'));
      return { success: false, error: 'Config file not found' };
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // Get enabled plugins
    const enabledPlugins: string[] = [];
    if (config.plugins) {
      Object.entries(config.plugins).forEach(([key, value]: [string, any]) => {
        if (value.enabled === true) {
          enabledPlugins.push(key);
        }
      });
    }

    // Get enabled addons
    const enabledAddons: string[] = [];
    if (config.addons) {
      Object.entries(config.addons).forEach(([key, value]: [string, any]) => {
        if (value.enabled === true) {
          enabledAddons.push(key);
        }
      });
    }

    // Build script content
    const lines: string[] = [];
    lines.push('### START DO NOT MODIFY AREA ###');
    lines.push('');

    // Add plugins first
    enabledPlugins.forEach(plugin => {
      lines.push(`/load ${plugin}`);
    });

    // Blank line between plugins and addons
    if (enabledPlugins.length > 0 && enabledAddons.length > 0) {
      lines.push('');
    }

    // Add addons
    enabledAddons.forEach(addon => {
      lines.push(`/addon load ${addon}`);
    });

    lines.push('');
    lines.push('### END DO NOT MODIFY AREA ###');

    const scriptContent = lines.join('\n');

    // Write to scripts/default.txt
    const scriptsDir = path.join(paths.gameRoot, 'scripts');
    const defaultScriptPath = path.join(scriptsDir, 'default.txt');

    // Ensure scripts directory exists
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Write the file
    fs.writeFileSync(defaultScriptPath, scriptContent, 'utf-8');

    log.info(chalk.cyan('[write-default-script] Written default.txt:'), defaultScriptPath);
    log.info(chalk.cyan('[write-default-script] Enabled plugins:'), enabledPlugins.length);
    log.info(chalk.cyan('[write-default-script] Enabled addons:'), enabledAddons.length);

    return { success: true, path: defaultScriptPath };
  } catch (error) {
    log.error(chalk.red('[write-default-script] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('launcher:downloadGame', async (_event, fullUrl: string, sha256: string, installDir: string, baseVersion: string, expectedSize?: number) => {
  try {
    const paths = getEventidePaths();
    log.info(chalk.cyan(`[download] Starting download: ${fullUrl} to ${paths.gameRoot}`));

    const onDownloadProgress = (dl: number, total: number) => {
      log.info(chalk.cyan(`[download] Progress: ${dl} / ${total}`));
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: download:progress`), { dl, total });
        mainWindow.webContents.send('download:progress', { dl, total });
      }
    };

    const onExtractProgress = (current: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('extract:progress', { current, total });
      }
    };

    await downloadGame(
      fullUrl,
      sha256,
      paths.gameRoot,
      paths.dlRoot,
      baseVersion,
      expectedSize,
      onDownloadProgress,
      onExtractProgress
    );
    log.info(chalk.cyan('[download] Download completed successfully'));
    return { success: true };
  } catch (err) {
    log.error(chalk.red(`[download] Download failed: ${String(err)}`));
    return { success: false, error: String(err) };
  }
});

// IPC handlers for extensions.json (addons/plugins)
ipcMain.handle('read-extensions', async () => {
  try {
    const extensionsPath = path.join(process.cwd(), 'extensions.json');
    if (!fs.existsSync(extensionsPath)) {
      // Create default if missing
      const defaultData = { addons: {}, plugins: {} };
      await fs.writeJson(extensionsPath, defaultData);
      return { success: true, data: defaultData };
    }
    const data = await fs.readJson(extensionsPath);
    return { success: true, data };
  } catch (error) {
    log.error(chalk.red('[read-extensions] Error:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('write-extensions', async (_event, data) => {
  try {
    const extensionsPath = path.join(process.cwd(), 'extensions.json');
    await fs.writeJson(extensionsPath, data);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[write-extensions] Error:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('launcher:applyPatches', async (_event, patchManifest: any, installDir: string) => {
  try {
    await applyPatches(patchManifest, installDir);
    return { success: true };
  } catch (err) {
    log.error(chalk.red('[patch] Error applying patches:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('launcher:launchGame', async (_event, installDir: string) => {
  try {
    let launchScript: string;
    if (process.platform === 'win32') {
      launchScript = path.join(installDir, 'Launch_Eventide.bat');
    } else {
      launchScript = path.join(installDir, 'Launch_Eventide.sh');
    }
    log.info(chalk.cyan(`[launch] Attempting to launch game using: ${launchScript}`));
    const result = await launchGameWithBatch(installDir, launchScript);
    if (result.success) {
      log.info(chalk.cyan('[launch] Game launched successfully'));
    } else {
      log.error(chalk.red(`[launch] Failed to launch game: ${result.error}`));
    }
    return result;
  } catch (err) {
    log.error(chalk.red(`[launch] Exception during game launch: ${err}`));
    return { success: false, error: String(err) };
  }
});

// (Manifest schema validation removed; handled in modular code if needed)






let mainWindow: BrowserWindow | null = null;
// Expose mainWindow globally for extraction IPC events
if (!(global as any).mainWindow) {
  (global as any).mainWindow = null;
}

// Ensure mainWindow is initialized on app ready
app.on('ready', () => {
  // Use the correct path to the built preload.js for development
  const preloadPath = path.join(__dirname, '../../.erb/dll/preload.js');
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  mainWindow.loadURL(resolveHtmlPath('index.html'));
  // Open DevTools automatically in development mode
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
    (global as any).mainWindow = null;
  });
  (global as any).mainWindow = mainWindow;
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  log.info(chalk.cyan(msgTemplate(arg)));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// IPC handler to return platform info
ipcMain.handle('get-platform', async () => {
  return { platform: process.platform, arch: process.arch };
});



ipcMain.handle('read-ini-file', async () => {
  try {
    const paths = getEventidePaths();
    const iniPath = path.join(paths.gameRoot, 'config', 'boot', 'Eventide.ini');
    log.info(chalk.cyan(`[INI] Reading INI from: ${iniPath}`));
    log.info(chalk.cyan('[INI] Reading INI file at'), iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);
    log.info(chalk.cyan('[INI] INI file read successfully'));
    return { success: true, data: config, error: null };
  } catch (error) {
    log.error(chalk.red(`[INI] Error reading INI file: ${String(error)}`));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('update-ini-auth-and-run', async (_event, username: string, password: string, installDir?: string) => {
    // log.info(chalk.cyan(`[INI] update-ini-auth-and-run called with username='${username}', password='${password}'`));
    log.info(chalk.cyan(`[INI] update-ini-auth-and-run called (credentials provided: ${!!username && !!password})`));
  try {
    const paths = getEventidePaths();
    const targetDir = installDir || paths.gameRoot;
    // Ensure all required directories exist before anything else
    ensureDirs();
    const iniPath = path.join(targetDir, 'config', 'boot', 'Eventide.ini');
    if (!fs.existsSync(iniPath)) {
      throw new Error(`INI file not found at: ${iniPath}`);
    }
    log.info(chalk.cyan('Updating INI at:'), iniPath);
    log.info(chalk.cyan('[INI] Reading INI file at'), iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);

    log.info(chalk.cyan('Original config:'), config['ashita.boot']);

    // Update or add --user and --pass in the command, but only if both are non-empty
    if (config?.ashita?.boot?.command) {
      let commandParts = config.ashita.boot.command.split(' ');
      // Remove any existing --user and --pass (and their values)
      commandParts = commandParts.filter((part: string, idx: number, arr: string[]) => {
        if ((part === '--user' || part === '--pass') && idx + 1 < arr.length) {
          return false; // skip this and the next (the value)
        }
        // Also skip the value if previous was --user or --pass
        if (idx > 0 && (arr[idx - 1] === '--user' || arr[idx - 1] === '--pass')) {
          return false;
        }
        return true;
      });
      // Only append --user and --pass if both are non-empty
      if (username && password) {
        // log.info(chalk.cyan(`[INI] Appending --user and --pass to command: --user ${username} --pass ${password}`));
        log.info(chalk.cyan(`[INI] Appending --user and --pass to command: [REDACTED]`));
        commandParts.push('--user', username, '--pass', password);
      } else {
        log.info(chalk.cyan('[INI] Username or password empty, not appending --user/--pass'));
      }
      config.ashita.boot.command = commandParts.join(' ');
      log.info(chalk.cyan('[INI] Final INI command:'), config.ashita.boot.command);
    }

    // Also attempt to read settings.json and apply mapped settings to the INI
    try {
      const settingsPath = paths.config;
      if (fs.existsSync(settingsPath)) {
        log.info(chalk.cyan('Applying settings from:'), settingsPath);
        const settings = (await readJson<Record<string, any>>(settingsPath)) || {};

        // Keep original INI snapshot to detect if anything changed
        const originalIni = ini.stringify(config);

        // Mapping table: settings path -> { section, key(s), transform }
        const mapping: Record<
          string,
          { section: string; keys: string | string[]; transform?: (v: any) => any }
        > = {
          // FFXI registry mappings (authoritative mapping)
          'ffxi.mipMapping': { section: 'ffxi.registry', keys: '0000', transform: (v) => String(v) },
          'ffxi.windowWidth': { section: 'ffxi.registry', keys: '0001', transform: (v) => String(v) },
          'ffxi.windowHeight': { section: 'ffxi.registry', keys: '0002', transform: (v) => String(v) },
          'ffxi.bgWidth': { section: 'ffxi.registry', keys: '0003', transform: (v) => String(v) },
          'ffxi.bgHeight': { section: 'ffxi.registry', keys: '0004', transform: (v) => String(v) },
          'ffxi.enableSounds': { section: 'ffxi.registry', keys: '0007', transform: (v) => (v ? '1' : '0') },
          'ffxi.envAnimations': { section: 'ffxi.registry', keys: '0011', transform: (v) => String(v) },
          'ffxi.bumpMapping': { section: 'ffxi.registry', keys: '0017', transform: (v) => (v ? '1' : '0') },
          'ffxi.textureCompression': { section: 'ffxi.registry', keys: '0018', transform: (v) => String(v) },
          'ffxi.mapCompression': { section: 'ffxi.registry', keys: '0019', transform: (v) => String(v) },
          'ffxi.hardwareMouse': { section: 'ffxi.registry', keys: '0021', transform: (v) => (v ? '1' : '0') },
          'ffxi.playOpeningMovie': { section: 'ffxi.registry', keys: '0022', transform: (v) => (v ? '1' : '0') },
          'ffxi.simplifiedCCG': { section: 'ffxi.registry', keys: '0023', transform: (v) => (v ? '1' : '0') },
          'ffxi.numSounds': { section: 'ffxi.registry', keys: '0029', transform: (v) => String(v) },
          'ffxi.windowMode': { section: 'ffxi.registry', keys: '0034', transform: (v) => String(v) },
          'ffxi.bgSounds': { section: 'ffxi.registry', keys: '0035', transform: (v) => (v ? '1' : '0') },
          'ffxi.fontCompression': { section: 'ffxi.registry', keys: '0036', transform: (v) => String(v) },
          'ffxi.menuWidth': { section: 'ffxi.registry', keys: '0037', transform: (v) => String(v) },
          'ffxi.menuHeight': { section: 'ffxi.registry', keys: '0038', transform: (v) => String(v) },
          'ffxi.graphicsStabilization': { section: 'ffxi.registry', keys: '0040', transform: (v) => (v ? '1' : '0') },
          'ffxi.savePath': { section: 'ffxi.registry', keys: '0042', transform: (v) => String(v) },
          'ffxi.aspectRatio': { section: 'ffxi.registry', keys: '0044', transform: (v) => (v ? '1' : '0') },
        };

        // Helper to set nested section/key creating objects as needed
        const setIniValue = (sectionPath: string, key: string, value: any) => {
          const parts = sectionPath.split('.');
          let node: any = config;
          for (const p of parts) {
            if (!node[p]) node[p] = {};
            node = node[p];
          }
          node[key] = value;
        };

        // Walk mapping table and apply values that are present in settings
        for (const [settingPath, mapInfo] of Object.entries(mapping)) {
          // convert settingPath like 'ffxi.windowWidth' to a value from settings
          const keys = settingPath.split('.');
          let value: any = settings;
          for (const k of keys) {
            if (value && Object.prototype.hasOwnProperty.call(value, k)) {
              value = value[k];
            } else {
              value = undefined;
              break;
            }
          }

          if (typeof value !== 'undefined') {
            const transformed = mapInfo.transform ? mapInfo.transform(value) : value;
            if (Array.isArray(mapInfo.keys)) {
              for (const key of mapInfo.keys) {
                setIniValue(mapInfo.section, key, transformed);
              }
            } else {
              setIniValue(mapInfo.section, mapInfo.keys, transformed);
            }
          }
        }

        // Always write the INI file after updating the command (even if only password changes)
        const newIni = ini.stringify(config);
        try {
          const bakPath = `${iniPath}.bak`;
          fs.copyFileSync(iniPath, bakPath);
          log.info(chalk.cyan('[INI] Created INI backup at'), bakPath);
        } catch (bkErr) {
          log.warn(chalk.yellow('Failed to create INI backup:'), bkErr);
        }
        log.info(chalk.cyan('[INI] Writing updated INI file at'), iniPath);
        fs.writeFileSync(iniPath, newIni, 'utf-8');
        log.info(chalk.cyan('INI file updated successfully'));
      } else {
        log.info(chalk.cyan('No settings.json found at'), settingsPath, '- skipping extra INI mappings');
      }
    } catch (err) {
      log.error(chalk.red('Failed to apply settings.json to INI:'), err);
    }

    // Do not launch the game here — only update INI. The renderer or user
    // should call `game:launch` when ready. Return the updated config to the caller.
    return { success: true, data: config, error: null };
  } catch (error) {
    log.error(chalk.red('Error updating INI file:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});


ipcMain.handle('write-config', async (_event, data: { username: string, password: string, rememberCredentials: boolean }) => {
  try {
    const paths = getEventidePaths();
    ensureDirs();
    const configPath = paths.config;
    // Read the existing config, but do NOT spread or copy any password field
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        log.warn(chalk.yellow('[config] Could not parse existing config.json, starting fresh.'));
      }
    }
    // Remove password and username if present in the old config
    if (existingConfig && typeof existingConfig === 'object') {
      if ('password' in existingConfig) delete existingConfig.password;
      if ('username' in existingConfig) delete existingConfig.username;
    }
    // Only store non-sensitive fields and preserve other settings (except credentials)
    const configData = {
      ...existingConfig,
      rememberCredentials: data.rememberCredentials,
      launcherVersion: app.getVersion()
    };
    // Handle both username and password in keytar only
    if (data.rememberCredentials && data.username && data.password) {
      log.info(chalk.cyan('[keytar] Saving credentials to keytar'));
      await keytar.setPassword(SERVICE_NAME, KEYTAR_ACCOUNT_USERNAME, data.username);
      await keytar.setPassword(SERVICE_NAME, KEYTAR_ACCOUNT_PASSWORD, data.password);
      log.info(chalk.cyan('[keytar] Credentials saved'));
    } else {
      log.info(chalk.cyan('[keytar] Deleting credentials from keytar'));
      await keytar.deletePassword(SERVICE_NAME, KEYTAR_ACCOUNT_USERNAME);
      await keytar.deletePassword(SERVICE_NAME, KEYTAR_ACCOUNT_PASSWORD);
      log.info(chalk.cyan('[keytar] Credentials deleted'));
    }
    log.info(chalk.cyan('[config] Writing config file at'), configPath);
    await writeJson(configPath, configData);
    log.info(chalk.cyan('[config] Config file written successfully'));
    return { success: true };
  } catch (error) {
    log.error(chalk.red(`[config] Error writing config file: ${error}`));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// IPC handlers for opening folders and log files
ipcMain.handle('open-config-folder', async () => {
  try {
    const paths = getEventidePaths();
    const configFolder = paths.userData; // config.json is in userData root
    await shell.openPath(configFolder);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[open-config-folder] Error:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('open-log-file', async () => {
  try {
    const paths = getEventidePaths();
    const logFile = path.join(paths.logsRoot, 'main.log');
    // Check if log file exists, if not use launcher-invoke-output.log
    const fileToOpen = fs.existsSync(logFile) ? logFile : path.join(paths.logsRoot, 'launcher-invoke-output.log');
    await shell.openPath(fileToOpen);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[open-log-file] Error:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('open-extension-folder', async (_event, folderType: 'addons' | 'plugins') => {
  try {
    const paths = getEventidePaths();
    const extensionFolder = path.join(paths.gameRoot, 'config', folderType);

    // Ensure folder exists
    if (!fs.existsSync(extensionFolder)) {
      fs.mkdirSync(extensionFolder, { recursive: true });
    }

    await shell.openPath(extensionFolder);
    return { success: true };
  } catch (error) {
    log.error(chalk.red(`[open-extension-folder] Error opening ${folderType}:`), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// IPC handler to open gamepad config executable
ipcMain.handle('open-gamepad-config', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const gamepadConfigPath = path.join(installDir, 'SquareEnix', 'FINAL FANTASY XI', 'ToolsUS', 'FFXiPadConfig.exe');

    if (!fs.existsSync(gamepadConfigPath)) {
      log.error(chalk.red('[open-gamepad-config] FFXiPadConfig.exe not found at:'), gamepadConfigPath);
      return { success: false, error: 'Gamepad config executable not found. Please ensure the game is installed.' };
    }

    log.info(chalk.cyan('[open-gamepad-config] Opening gamepad config at:'), gamepadConfigPath);
    await shell.openPath(gamepadConfigPath);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[open-gamepad-config] Error opening gamepad config:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// IPC handler to reapply patches by resetting version to 1.0.0
ipcMain.handle('reapply-patches', async () => {
  try {
    log.info(chalk.cyan('[reapply-patches] Resetting version to 1.0.0 to trigger patch reapplication'));

    // Update storage to reset version
    await updateStorage((data: StorageJson) => {
      data.GAME_UPDATER.currentVersion = '1.0.0';
      data.GAME_UPDATER.updater.downloaded = '1.0.0';
      data.GAME_UPDATER.updater.extracted = '1.0.0';
    });

    log.info(chalk.green('[reapply-patches] Version reset successfully'));
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[reapply-patches] Error resetting version:'), error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// ---- Game install / update helpers and IPC handlers ----

// Debug startup marker to help confirm main process is running the current source.
try {
  log.info(chalk.cyan('Launcher main boot:'), { __dirname, NODE_ENV: process.env.NODE_ENV });
} catch (e) {}

// Centralized launcher helper: prefer the batch wrapper and capture output
async function launchGameWithBatch(installDir: string, launchScript: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      if (!fs.existsSync(launchScript)) {
        return resolve({ success: false, error: `Launch script not found: ${launchScript}` });
      }

      // Use logsRoot for launcher logs
      const paths = getEventidePaths();
      const logPath = path.join(paths.logsRoot, 'launcher-invoke-output.log');
      // Ensure all required directories exist before anything else
      ensureDirs();
      try { fs.appendFileSync(logPath, `\n--- Launcher invoke at ${new Date().toISOString()} ---\n`); } catch {}

      let child;
      if (process.platform === 'win32') {
        // Use cmd.exe to run the batch file
        child = spawn('cmd.exe', ['/c', launchScript], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: installDir,
        });
      } else {
        // Use /bin/sh to run the shell script
        child = spawn('/bin/sh', [launchScript], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: installDir,
        });
      }

      // Pipe stdout/stderr to a log file for later inspection
      try {
        const outStream = fs.createWriteStream(logPath, { flags: 'a' });
        if (child.stdout) child.stdout.pipe(outStream);
        if (child.stderr) child.stderr.pipe(outStream);
        child.on('error', (err) => {
          try { outStream.write(`spawn error: ${String(err)}\n`); } catch {}
        });
        child.on('close', (code, signal) => {
          try { outStream.write(`child exit code=${String(code)} signal=${String(signal)}\n`); } catch {}
          try { outStream.end(); } catch {}
        });
      } catch (e) {
        // ignore logging failures
      }

      child.on('error', (err) => resolve({ success: false, error: String(err) }));
      // detach and let the game run independently
      try { child.unref(); } catch (e) {}
      return resolve({ success: true });
    } catch (err) {
      return resolve({ success: false, error: String(err) });
    }
  });
}

// fetchJson is now imported from utils/io

/**
 * Validates that required ZIP files exist in the Downloads folder.
 * If base game ZIP is missing, resets the entire state to missing.
 * If patch ZIPs are missing, reverts version back to base version.
 */
async function validateZipFilesAndResetState(
  release: any,
  patchManifest: any,
  downloadsDir: string,
  currentVersion: string
): Promise<{ currentVersion: string; baseDownloaded: boolean; baseExtracted: boolean }> {
  const baseZipName = release.game.fullUrl.split('/').pop();
  const baseZipPath = baseZipName ? path.join(downloadsDir, baseZipName) : '';

  log.info(chalk.cyan(`[validateZipFiles] Checking for base game ZIP: ${baseZipPath}`));

  // Check if base game ZIP exists
  const baseZipExists = baseZipPath && fs.existsSync(baseZipPath);

  if (!baseZipExists) {
    log.warn(chalk.yellow('[validateZipFiles] Base game ZIP is missing! Resetting state to missing.'));
    // Reset entire state
    await updateStorage((data: StorageJson) => {
      data.GAME_UPDATER.currentVersion = "0.0.0";
      data.GAME_UPDATER.baseGame.downloaded = false;
      data.GAME_UPDATER.baseGame.extracted = false;
      data.GAME_UPDATER.updater.downloaded = "";
      data.GAME_UPDATER.updater.extracted = "";
    });
    return { currentVersion: "0.0.0", baseDownloaded: false, baseExtracted: false };
  }

  log.info(chalk.green('[validateZipFiles] Base game ZIP found'));

  // If we have patches and current version is above base version, verify patch ZIPs
  const baseVersion = release.game.baseVersion;
  if (currentVersion !== baseVersion && currentVersion !== "0" && currentVersion !== "0.0.0") {
    log.info(chalk.cyan(`[validateZipFiles] Current version (${currentVersion}) is above base version (${baseVersion}), checking patch ZIPs...`));

    const patches = patchManifest.patches || [];
    let versionToRevertTo = baseVersion;
    let allPatchZipsExist = true;

    // Build the patch chain from base version to current version
    let checkVersion = baseVersion;
    while (checkVersion !== currentVersion) {
      const patch = patches.find((p: any) => p.from === checkVersion);
      if (!patch) {
        log.warn(chalk.yellow(`[validateZipFiles] No patch found from ${checkVersion}, cannot verify further`));
        break;
      }

      const patchZipName = patch.fullUrl.split('/').pop();
      const patchZipPath = patchZipName ? path.join(downloadsDir, patchZipName) : '';

      if (!patchZipPath || !fs.existsSync(patchZipPath)) {
        log.warn(chalk.yellow(`[validateZipFiles] Patch ZIP missing: ${patchZipName} (${checkVersion} → ${patch.to})`));
        allPatchZipsExist = false;
        break;
      }

      log.info(chalk.green(`[validateZipFiles] Patch ZIP found: ${patchZipName}`));
      versionToRevertTo = patch.to;
      checkVersion = patch.to;
    }

    if (!allPatchZipsExist) {
      log.warn(chalk.yellow(`[validateZipFiles] Some patch ZIPs are missing. Reverting version from ${currentVersion} to ${versionToRevertTo}`));
      await updateStorage((data: StorageJson) => {
        data.GAME_UPDATER.currentVersion = versionToRevertTo;
      });
      return { currentVersion: versionToRevertTo, baseDownloaded: true, baseExtracted: true };
    }

    log.info(chalk.green('[validateZipFiles] All patch ZIPs verified'));
  }

  return { currentVersion, baseDownloaded: true, baseExtracted: true };
}

// IPC handler for fetching patch notes
ipcMain.handle('game:fetch-patch-notes', async () => {
  try {
    const { release } = await getCachedManifests();

    if (!release.patchNotesUrl) {
      log.warn(chalk.yellow('[patch-notes] No patchNotesUrl in release.json'));
      return { success: false, error: 'No patch notes URL configured' };
    }

    const patchNotes = await getPatchNotes(release.patchNotesUrl);

    log.info(chalk.green(`[patch-notes] Fetched ${patchNotes.length} patch notes`));

    return { success: true, data: patchNotes };
  } catch (err) {
    log.error(chalk.red('[patch-notes] Error fetching patch notes:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:check', async () => {
  try {
    const PATCH_MANIFEST_URL = 'https://raw.githubusercontent.com/bananapretzel/eventide-patch-manifest/refs/heads/main/patch-manifest.json';
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const downloadsDir = paths.dlRoot;

    // Fetch release and patch manifest using cache
    const { release, patchManifest } = await getCachedManifests();
    const latestVersion = String(patchManifest.latestVersion ?? "0");

    // Use storage.json for version/status
    let currentVersion = "0";
    let baseDownloaded = false;
    let baseExtracted = false;
    let storage;

    try {
      storage = await readStorage();
      if (storage && storage.GAME_UPDATER) {
        currentVersion = String(storage.GAME_UPDATER.currentVersion ?? "0");
        baseDownloaded = !!storage.GAME_UPDATER.baseGame.downloaded;
        baseExtracted = !!storage.GAME_UPDATER.baseGame.extracted;
      }
    } catch (e) {
      log.warn(chalk.yellow('[game:check] Could not read storage.json:'), e);
    }

    // Check if game folder is empty - if so, assume base game hasn't been extracted
    try {
      const gameFiles = await fs.readdir(installDir);
      const hasFiles = gameFiles.length > 0;

      if (!hasFiles && (baseDownloaded || baseExtracted)) {
        log.warn(chalk.yellow('[game:check] Game folder is empty but storage indicates game was downloaded/extracted'));
        log.warn(chalk.yellow('[game:check] Checking for base game ZIP in Downloads...'));

        const baseZipName = release.game.fullUrl.split('/').pop();
        const baseZipPath = baseZipName ? path.join(downloadsDir, baseZipName) : '';
        const baseZipExists = baseZipPath && fs.existsSync(baseZipPath);

        if (!baseZipExists) {
          log.warn(chalk.yellow('[game:check] Base game ZIP not found. Resetting to missing state.'));
          await updateStorage((data: StorageJson) => {
            data.GAME_UPDATER.currentVersion = "0.0.0";
            data.GAME_UPDATER.baseGame.downloaded = false;
            data.GAME_UPDATER.baseGame.extracted = false;
            data.GAME_UPDATER.updater.downloaded = "";
            data.GAME_UPDATER.updater.extracted = "";
          });
          currentVersion = "0.0.0";
          baseDownloaded = false;
          baseExtracted = false;
        } else {
          log.info(chalk.cyan('[game:check] Base game ZIP found. Marking as downloaded but not extracted.'));
          await updateStorage((data: StorageJson) => {
            data.GAME_UPDATER.baseGame.downloaded = true;
            data.GAME_UPDATER.baseGame.extracted = false;
            data.GAME_UPDATER.currentVersion = "0.0.0";
          });
          currentVersion = "0.0.0";
          baseDownloaded = true;
          baseExtracted = false;
        }
      }
    } catch (e) {
      log.warn(chalk.yellow('[game:check] Could not check game folder:'), e);
    }

    // Validate ZIP files and reset state if necessary
    if (baseDownloaded || baseExtracted) {
      const validated = await validateZipFilesAndResetState(release, patchManifest, downloadsDir, currentVersion);
      currentVersion = validated.currentVersion;
      baseDownloaded = validated.baseDownloaded;
      baseExtracted = validated.baseExtracted;
    }

    // If downloaded but not extracted, extract now
    if (baseDownloaded && !baseExtracted) {
      await extractBaseGameIfNeeded(storage, paths.dlRoot, installDir);
      // Update local state after extraction
      const updatedStorage = await readStorage();
      if (updatedStorage && updatedStorage.GAME_UPDATER) {
        baseExtracted = !!updatedStorage.GAME_UPDATER.baseGame.extracted;
        currentVersion = String(updatedStorage.GAME_UPDATER.currentVersion ?? "0");
      }
    }

    // If base game is extracted but version is below latest, check if patches need to be reapplied
    const baseVersion = release.game.baseVersion;
    if (baseExtracted && currentVersion !== latestVersion && currentVersion !== "0" && currentVersion !== "0.0.0") {
      log.info(chalk.cyan(`[game:check] Current version (${currentVersion}) is below latest (${latestVersion})`));

      // Check if we need to reapply patches (version is below what it should be based on available ZIPs)
      const patches = patchManifest.patches || [];
      let expectedVersion = baseVersion;

      // Walk through available patches to determine what version we should be at
      let checkVersion = baseVersion;
      while (checkVersion !== latestVersion) {
        const patch = patches.find((p: any) => p.from === checkVersion);
        if (!patch) break;

        const patchZipName = patch.fullUrl.split('/').pop();
        const patchZipPath = patchZipName ? path.join(downloadsDir, patchZipName) : '';

        if (patchZipPath && fs.existsSync(patchZipPath)) {
          expectedVersion = patch.to;
          checkVersion = patch.to;
        } else {
          break; // No more patches available
        }
      }

      // If current version is below the expected version based on available patches, trigger reapplication
      if (currentVersion !== expectedVersion) {
        log.warn(chalk.yellow(`[game:check] Version mismatch detected. Current: ${currentVersion}, Expected based on available patches: ${expectedVersion}`));
        log.warn(chalk.yellow(`[game:check] Patches may have been deleted or version was rolled back. Setting state to update-available.`));
        // Don't auto-apply here, just report that updates are available
      }
    }

    // Determine launcherState per requirements
    let launcherState: 'missing' | 'ready' | 'update-available';
    if (!baseDownloaded) {
      launcherState = 'missing';
    } else if (currentVersion === latestVersion) {
      launcherState = 'ready';
    } else if (baseExtracted && currentVersion !== latestVersion) {
      launcherState = 'update-available';
    } else {
      launcherState = 'missing'; // fallback
    }

    log.info(chalk.cyan('[game:check] currentVersion:'), currentVersion);
    log.info(chalk.cyan('[game:check] latestVersion:'), latestVersion);
    log.info(chalk.cyan('[game:check] The results of patch-manifest.json downloaded from GitHub:'), JSON.stringify(patchManifest, null, 2));
    log.info(chalk.cyan('[game:check] launcherState:'), launcherState);

    // For existence, check for a main executable (e.g., ashita-cli.exe) in gameRoot
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    const exists = fs.existsSync(mainExe);

    return { exists, launcherState, latestVersion, installedVersion: currentVersion, baseDownloaded, baseExtracted };
  } catch (err) {
    log.error(chalk.red('[game:check] error:'), err);
    return { exists: false, updateAvailable: false, error: String(err) };
  }
});

// (legacy patching logic removed)
// (legacy patching logic removed)

// Debug helper: return last download progress recorded in main (useful from renderer DevTools)
ipcMain.handle('debug:get-last-progress', async () => {
  try {
    return { success: true, data: (global as any).__lastDownloadProgress ?? null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Debug helper: return last structured download info (release, assetUrl, patch manifest checks, patch apply result)
ipcMain.handle('debug:get-last-download-info', async () => {
  try {
    return { success: true, data: (global as any).__lastDownloadInfo ?? null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Debug helper: return last computed download checksum
ipcMain.handle('debug:get-last-checksum', async () => {
  try {
    return { success: true, data: (global as any).__lastDownloadChecksum ?? null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Handler to clear all downloads and reset state
ipcMain.handle('clear-downloads', async () => {
  try {
    const paths = getEventidePaths();
    const downloadsDir = paths.dlRoot;

    log.info(chalk.cyan('[clear-downloads] Clearing downloads directory:', downloadsDir));

    // Delete all files in downloads directory
    if (fs.existsSync(downloadsDir)) {
      const files = await fs.readdir(downloadsDir);
      for (const file of files) {
        const filePath = path.join(downloadsDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          await fs.unlink(filePath);
          log.info(chalk.cyan('[clear-downloads] Deleted:', file));
        }
      }
    }

    // Reset storage state
    await updateStorage((data: StorageJson) => {
      data.GAME_UPDATER.currentVersion = "0.0.0";
      data.GAME_UPDATER.baseGame.downloaded = false;
      data.GAME_UPDATER.baseGame.extracted = false;
      data.GAME_UPDATER.updater.downloaded = "";
      data.GAME_UPDATER.updater.extracted = "";
    });

    log.info(chalk.green('[clear-downloads] Downloads cleared and state reset'));
    return { success: true };
  } catch (err) {
    log.error(chalk.red('[clear-downloads] Error:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:download', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const downloadsDir = paths.dlRoot;
    const { release } = await getCachedManifests();

    // Progress callbacks
    const onDownloadProgress = (dl: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('download:progress', { dl, total });
      }
    };

    const onExtractProgress = (current: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('extract:progress', { current, total });
      }
    };

    await downloadGame(
      release.game.fullUrl,
      release.game.sha256,
      installDir,
      downloadsDir,
      release.game.baseVersion,
      release.game.sizeBytes,
      onDownloadProgress,
      onExtractProgress
    );

    // After successful download and extraction, invalidate cache and fetch fresh data
    log.info(chalk.green('[game:download] Download and extraction complete, checking for patches...'));

    // Invalidate cache to ensure we get fresh version info
    invalidateManifestCache();
    const { patchManifest: freshPatchManifest } = await getCachedManifests();
    const latestVersion = String(freshPatchManifest.latestVersion ?? "0");
    const currentVersion = release.game.baseVersion;

    log.info(chalk.cyan(`[game:download] Current version: ${currentVersion}, Latest version: ${latestVersion}`));

    // Send status update to renderer
    if (mainWindow) {
      if (currentVersion !== latestVersion) {
        log.info(chalk.cyan(`[game:download] Update available, notifying renderer`));
        mainWindow.webContents.send('game:status', {
          status: 'update-available',
          installedVersion: currentVersion,
          remoteVersion: latestVersion
        });
      } else {
        log.info(chalk.cyan(`[game:download] Game is up to date, notifying renderer`));
        mainWindow.webContents.send('game:status', { status: 'ready' });
      }
    }

    return { success: true };
  } catch (err) {
    log.error(chalk.red('Download failed:'), err);

    // Provide more specific error messages
    let errorMessage = String(err);
    if (err instanceof Error) {
      errorMessage = err.message;
    }

    // Categorize common errors for better user feedback
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Network error: Unable to connect to download server. Check your internet connection.';
    } else if (errorMessage.includes('ENOSPC')) {
      errorMessage = 'Insufficient disk space. Please free up space and try again.';
    } else if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
      errorMessage = 'Permission denied. Try running the launcher as administrator.';
    } else if (errorMessage.includes('SHA256 mismatch')) {
      errorMessage = 'Download verification failed. The file may be corrupted. Please try again.';
    } else if (errorMessage.includes('Size mismatch')) {
      errorMessage = 'Download incomplete. File size does not match expected size. Please try again.';
    } else if (errorMessage.includes('Extraction verification failed')) {
      errorMessage = 'File extraction failed. The downloaded archive may be corrupted. Try clearing downloads.';
    }

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: errorMessage });
      mainWindow.webContents.send('game:status', { status: 'error', message: errorMessage });
    }
    return { success: false, error: errorMessage };
  }
});

// Import an existing installation: scan installDir, compute per-file hashes, and write game-version.json
ipcMain.handle('game:import-existing', async () => {
  try {
    const paths = getEventidePaths();
    // Ensure all required directories exist before anything else
    ensureDirs();
    const installDir = paths.gameRoot;

    if (!fs.existsSync(installDir)) {
      log.error(chalk.red('[import] Install directory not found:'), installDir);
      return { success: false, error: `Install directory not found: ${installDir}` };
    }

    // quick check for main executable
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    if (!fs.existsSync(mainExe)) {
      log.error(chalk.red('[import] Main executable not found in install directory:'), mainExe);
      return { success: false, error: 'Main executable not found in install directory' };
    }

    // list files and compute per-file sha256 (may take time)
    const fileEntries: Array<{ path: string; sha256: string }> = [];

    // compute a snapshot checksum for the set (deterministic)
    const snapshotHasher = crypto.createHash('sha256');
    fileEntries.sort((a, b) => a.path.localeCompare(b.path));
    for (const e of fileEntries) {
      snapshotHasher.update(e.path + ':' + (e.sha256 || '') + '\n');
    }
    const snapshotHash = snapshotHasher.digest('hex');

    // Fetch remote release.json to get version/source info for the snapshot (optional)
    let manifest: any | undefined;
    try {
      // TODO: Implement or import fetchJson if needed
      // const remote: any = await fetchJson(RELEASE_JSON_URL);
      // if (remote?.game) manifest = { ...(remote.game), version: remote.game.baseVersion ?? remote.latestVersion ?? remote.game.version };
      // else manifest = remote;
    } catch (e) {
      log.warn(chalk.yellow('[import] Error fetching remote manifest:'), e);
      // ignore; manifest info is optional for import
    }

    const versionData: any = {
      version: manifest?.version ?? '',
      sha256: snapshotHash,
      source: manifest?.fullUrl ?? null,
      installedFiles: fileEntries,
    };

    const localVersionPath = path.join(installDir, 'game-version.json');
    log.info(chalk.cyan('[import] Writing game-version.json at'), localVersionPath);
    await writeJson(localVersionPath, versionData);

    return { success: true, installedFiles: fileEntries.length, snapshot: snapshotHash };
  } catch (err) {
    log.error(chalk.red('[import] Error during import-existing:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:update', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const projectRoot = path.resolve(__dirname, '../../');
    const { release, patchManifest } = await getCachedManifests();

    // Progress callbacks
    const onPatchProgress = (patch: string, dl: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('download:progress', { dl, total, patch });
      }
    };

    const onExtractProgress = (current: number, total: number) => {
      if (mainWindow) {
        mainWindow.webContents.send('extract:progress', { current, total });
      }
    };

    await applyPatches(patchManifest, installDir, onPatchProgress, onExtractProgress);

    // After successful patching, invalidate cache and notify renderer that game is ready
    invalidateManifestCache();
    log.info(chalk.green('[game:update] Patching complete, game is ready'));
    if (mainWindow) {
      mainWindow.webContents.send('game:status', { status: 'ready' });
    }

    return { success: true };
  } catch (err) {
    log.error(chalk.red('Update failed:'), err);

    // Provide more specific error messages for patching
    let errorMessage = String(err);
    if (err instanceof Error) {
      errorMessage = err.message;
    }

    // Categorize common patch errors
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Network error: Unable to download patch. Check your internet connection.';
    } else if (errorMessage.includes('SHA256 mismatch')) {
      errorMessage = 'Patch verification failed. The patch file may be corrupted. Try clearing downloads.';
    } else if (errorMessage.includes('No patch found')) {
      errorMessage = 'Patch sequence broken. Please use "Reapply Patches" in Settings.';
    } else if (errorMessage.includes('Extraction verification failed')) {
      errorMessage = 'Patch extraction failed. The patch archive may be corrupted. Try clearing downloads.';
    } else if (errorMessage.includes('No client version found')) {
      errorMessage = 'Game version information is missing. Try repairing the installation.';
    }

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: errorMessage });
      mainWindow.webContents.send('game:status', { status: 'error', message: errorMessage });
    }
    return { success: false, error: errorMessage };
  }
});

// Manual cache refresh handler
ipcMain.handle('game:refresh-cache', async () => {
  try {
    log.info(chalk.cyan('[game:refresh-cache] Manual cache refresh requested'));
    invalidateManifestCache();
    const { release, patchManifest } = await getCachedManifests();
    return {
      success: true,
      baseVersion: release.game.baseVersion,
      latestVersion: patchManifest.latestVersion
    };
  } catch (err) {
    log.error(chalk.red('[game:refresh-cache] Failed to refresh cache:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:launch', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'launching' });
      mainWindow.webContents.send('game:status', { status: 'launching' });
    }

    // Require the batch wrapper in all cases; do not fall back to directly
    // launching the executable. Return a clear error if the wrapper is missing.
    if (!fs.existsSync(launchBat)) {
      const msg = `Launch batch not found: ${launchBat}`;
      log.error(chalk.red(msg));
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: msg });
        mainWindow.webContents.send('game:status', { status: 'error', message: msg });
      }
      return { success: false, error: msg };
    }

    log.info(chalk.cyan('Launching via batch:'), launchBat);
    const launchResult = await launchGameWithBatch(installDir, launchBat);
    if (!launchResult.success) {
      log.error(chalk.red('Failed to launch game:'), launchResult.error);
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: String(launchResult.error) });
        mainWindow.webContents.send('game:status', { status: 'error', message: String(launchResult.error) });
      }
      return { success: false, error: launchResult.error };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
    // (legacy patching logic removed)
}
