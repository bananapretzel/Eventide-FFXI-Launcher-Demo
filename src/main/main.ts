import './logger'; // Initialize logger configuration
import log from './logger';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import keytar from 'keytar';
import { spawn } from 'child_process';
import ini from 'ini';
import { app, BrowserWindow, ipcMain, shell, dialog, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getEventidePaths, ensureDirs } from './paths';
import { resolveHtmlPath } from './util';
import { RELEASE_JSON_URL } from './config';
import { getClientVersion } from '../core/versions';
import {
  getReleaseJson,
  getPatchManifest,
  getPatchNotes,
} from '../core/manifest';
import {
  readStorage,
  writeStorage,
  updateStorage,
  hasRequiredGameFiles,
  getDefaultStorage,
  validateStorageJson,
  StorageJson,
} from '../core/storage';
import { bootstrap as logicBootstrap } from '../logic/bootstrap';
import { writeJson, readJson } from '../core/fs';
import { downloadGame } from '../logic/download';
import { applyPatches } from '../logic/patch';
import {
  getDefaultAddonsObject,
  getDefaultPluginsObject,
} from './defaultExtensions';
import { isUrlSafeForExternal, sanitizeInput } from './security';
import { applySettingsToIni } from './config/iniMappings';

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

// Global patching state to prevent concurrent operations
let isPatchingInProgress = false;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches release and patch manifest, using cache if available and fresh
 */
async function getCachedManifests(): Promise<{
  release: any;
  patchManifest: any;
}> {
  const now = Date.now();

  // Check if cache is valid
  if (
    manifestCache.release &&
    manifestCache.patchManifest &&
    manifestCache.timestamp &&
    now - manifestCache.timestamp < CACHE_TTL_MS
  ) {
    log.info(chalk.cyan('[getCachedManifests] Using cached manifest data'));
    return {
      release: manifestCache.release,
      patchManifest: manifestCache.patchManifest,
    };
  }

  // Cache is stale or empty, fetch fresh data
  log.info(chalk.cyan('[getCachedManifests] Fetching fresh manifest data...'));
  try {
    const release = await getReleaseJson(RELEASE_JSON_URL);
    const patchManifest = await getPatchManifest(release.patchManifestUrl);

    // Update cache
    manifestCache.release = release;
    manifestCache.patchManifest = patchManifest;
    manifestCache.timestamp = now;

    return { release, patchManifest };
  } catch (err) {
    log.error(
      chalk.red('[getCachedManifests] Failed to fetch manifests:'),
      err,
    );

    // If we have stale cache, use it as fallback
    if (manifestCache.release && manifestCache.patchManifest) {
      log.warn(
        chalk.yellow(
          '[getCachedManifests] Using stale cache as fallback due to network error',
        ),
      );
      return {
        release: manifestCache.release,
        patchManifest: manifestCache.patchManifest,
      };
    }

    // No cache available, throw error
    throw new Error(
      'Server is offline or unreachable. Could not fetch game manifests.',
    );
  }
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
ipcMain.handle(
  'launcher:bootstrap',
  async (_event, releaseUrl: string, installDir: string) => {
    try {
      // Get release, patchManifest, clientVersion from logic/bootstrap
      const { release, patchManifest, clientVersion } = await logicBootstrap(
        releaseUrl,
        installDir,
      );
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
      return {
        release,
        patchManifest,
        clientVersion,
        baseGameDownloaded,
        baseGameExtracted,
      };
    } catch (err) {
      log.error('[launcher:bootstrap] error:', err);
      return { error: String(err) };
    }
  },
);

// Set the app name to 'Eventide Launcherv2' so userData points to %APPDATA%\Eventide Launcherv2
app.setName('Eventide Launcherv2');

// ============================================================================
// SECURITY: Web Contents Creation Handler
// ============================================================================
app.on('web-contents-created', (_event, contents) => {
  // Security: Prevent navigation to untrusted domains
  contents.on('will-navigate', (event, navigationUrl) => {
    const allowedUrls = [
      'file://',
      'devtools://',
      'about:blank'
    ];

    const isAllowed = allowedUrls.some(allowed => navigationUrl.startsWith(allowed));

    if (!isAllowed) {
      log.warn(chalk.yellow(`[Security] Blocked navigation to: ${navigationUrl}`));
      event.preventDefault();
    }
  });

  // Security: Prevent opening new windows
  contents.setWindowOpenHandler(({ url }) => {
    log.warn(chalk.yellow(`[Security] Blocked window open attempt: ${url}`));

    // Only allow opening trusted URLs in external browser
    if (isUrlSafeForExternal(url)) {
      shell.openExternal(url).catch(err =>
        log.error(chalk.red('[Security] Error opening external URL:'), err)
      );
    }

    return { action: 'deny' };
  });

  // Security: Verify webview creation (if webviews are used)
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    log.warn(chalk.yellow('[Security] Webview attachment attempted, verifying...'));

    // Delete preload scripts if unused or verify their location
    delete webPreferences.preload;

    // Disable Node.js integration in webviews
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;

    // Verify URL being loaded
    if (!params.src || !isUrlSafeForExternal(params.src)) {
      log.error(chalk.red('[Security] Blocked webview with untrusted URL'));
      event.preventDefault();
    }
  });
});

// --- Ensure config.json exists with defaults on startup ---
// ...existing code...
/**
 * Consolidated extraction logic for base game zip with progress reporting
 * @param storageData - Current storage data to update
 * @param dlRoot - Download directory path
 * @param gameRoot - Game installation directory path
 * @returns true if extraction was performed, false if skipped
 */
async function extractBaseGameIfNeeded(
  storageData: any,
  dlRoot: string,
  gameRoot: string,
  baseGameZipName?: string,
): Promise<boolean> {
  try {
    const { extractZip } = require('../core/fs');
    // Use provided ZIP name or fall back to default
    const zipName = baseGameZipName || 'Eventide-test.zip';
    const baseGameZipPath = path.join(dlRoot, zipName);

    if (!fs.existsSync(baseGameZipPath)) {
      log.info(
        chalk.cyan('[startup] Expected base game zip not found at'),
        baseGameZipPath,
      );
      return false;
    }

    log.info(
      chalk.cyan(
        '[startup] Game zip is downloaded but not extracted. Extracting now...',
      ),
    );
    const g: any = global;
    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:start');
    }

    try {
      await extractZip(baseGameZipPath, gameRoot);
    } catch (extractErr) {
      log.error(chalk.red('[startup] Extraction failed:'), extractErr);

      // If extraction fails, the ZIP is likely corrupted - delete it
      try {
        fs.unlinkSync(baseGameZipPath);
        log.info(chalk.cyan('[startup] Deleted corrupted ZIP file'));

        // Update storage to reflect that download is incomplete
        storageData.GAME_UPDATER.baseGame.downloaded = false;
        storageData.GAME_UPDATER.baseGame.extracted = false;
        await writeStorage(storageData);

        // Notify renderer
        if (g.mainWindow && g.mainWindow.webContents) {
          g.mainWindow.webContents.send('extract:error', {
            error: 'ZIP file is corrupted. Please download the game again.',
          });
        }
      } catch (deleteErr) {
        log.warn(chalk.yellow('[startup] Could not delete corrupted ZIP:'), deleteErr);
      }

      throw new Error(`Extraction failed: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}. The ZIP file may be corrupted. Please download the game again.`);
    }

    // Update storage atomically
    storageData.GAME_UPDATER.baseGame.extracted = true;
    await writeStorage(storageData);

    log.info(
      chalk.cyan(
        '[startup] Extraction complete. Updated baseGame.extracted to true.',
      ),
    );

    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:done');
    }

    return true;
  } catch (extractErr) {
    log.error(chalk.red('[startup] Error during auto-extraction:'), extractErr);
    const g: any = global;
    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:error', {
        error: String(extractErr),
      });
    }
    throw extractErr; // Re-throw to let caller handle
  }
}

app.once('ready', async () => {
  try {
    // Step 1: Read or initialize storage.json FIRST (before ensureDirs)
    let storageData = await readStorage((msg) => log.warn(chalk.yellow(msg)));
    if (!storageData) {
      storageData = getDefaultStorage();
      await writeStorage(storageData);
      log.warn(
        chalk.yellow(
          '[startup] storage.json was missing or invalid, created default.',
        ),
      );
    }

    // Step 2: Load custom installation directory from storage (if set)
    const { setCustomInstallDir } = require('./paths');

    if (storageData.paths.customInstallDir) {
      const customDir = storageData.paths.customInstallDir;
      setCustomInstallDir(customDir);
      log.info(
        chalk.cyan('[startup] Using custom installation directory:'),
        customDir,
      );
    } else {
      log.info(chalk.cyan('[startup] No custom installation directory set'));
    }

    const hasCustomOrDefaultDir = !!storageData.paths.customInstallDir || !!storageData.paths.installPath;

    // Step 3: Create essential directories (logs, userData) but NOT game directories on first launch
    // Game directories will be created when user selects installation location
    ensureDirs(hasCustomOrDefaultDir); // Only create game dirs if location was previously chosen
    const paths = getEventidePaths(hasCustomOrDefaultDir); // Only return actual game paths if dir was chosen
    const { gameRoot, dlRoot } = paths;

    // Step 4: Only update storage paths if user has already chosen a location
    // Don't auto-populate paths on first launch - wait for user to select directory
    let changed = false;
    if (hasCustomOrDefaultDir) {
      if (!storageData.paths.installPath) {
        storageData.paths.installPath = gameRoot;
        changed = true;
      }
      if (!storageData.paths.downloadPath) {
        storageData.paths.downloadPath = dlRoot;
        changed = true;
      }
    }
    if (changed) {
      await writeStorage(storageData);
      log.info(chalk.cyan('[startup] Updated storage.json with paths.'));
    }

    const version = app.getVersion ? app.getVersion() : 'unknown';
    const env = process.env.NODE_ENV || 'production';
    log.info(
      chalk.cyan(`[startup] Launcher version: ${version}, environment: ${env}`),
    );

    // --- Configure launcher auto-updates ---
    try {
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('checking-for-update', () => {
        // Skip update checks if patching is in progress
        if (isPatchingInProgress) {
          log.info(
            chalk.yellow(
              '[autoUpdater] Skipping update check - patching in progress',
            ),
          );
          return;
        }
        log.info(chalk.cyan('[autoUpdater] Checking for launcher updates...'));
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'checking',
          message: 'Checking for Eventide Launcher updates...',
        });
      });

      autoUpdater.on('update-available', (info) => {
        const versionInfo = info.version ? ` (v${info.version})` : '';
        log.info(
          chalk.green(
            `[autoUpdater] New launcher update available${versionInfo}`,
          ),
          info,
        );
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'update-available',
          info,
          message: `Launcher update available${versionInfo}. Click to download.`,
        });
      });

      autoUpdater.on('update-not-available', (info) => {
        log.info(chalk.green('[autoUpdater] Launcher is up to date'));
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'up-to-date',
          info,
          message: 'Eventide Launcher is up to date!',
        });
      });

      autoUpdater.on('download-progress', (progress) => {
        const { bytesPerSecond, percent, transferred, total } = progress;
        const speedMB = (bytesPerSecond / 1024 / 1024).toFixed(2);
        const transferredMB = (transferred / 1024 / 1024).toFixed(1);
        const totalMB = (total / 1024 / 1024).toFixed(1);

        log.info(
          chalk.cyan('[autoUpdater] Download progress:'),
          `${percent.toFixed(1)}% (${transferredMB}/${totalMB} MB) @ ${speedMB} MB/s`,
        );
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'downloading',
          progress,
          message: `Downloading update: ${percent.toFixed(1)}% (${transferredMB}/${totalMB} MB)`,
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        const versionInfo = info.version ? ` v${info.version}` : '';
        log.info(
          chalk.green(
            `[autoUpdater] Update${versionInfo} downloaded successfully!`,
          ),
        );
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'downloaded',
          info,
          message: `Update${versionInfo} ready! Restart to install.`,
        });
      });

      autoUpdater.on('error', (error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(chalk.red('[autoUpdater] Update error:'), errorMsg);
        const g: any = global;
        g.mainWindow?.webContents.send('launcher:update-event', {
          status: 'error',
          error: errorMsg,
          message: `Update failed: ${errorMsg}. Try again later.`,
        });
      });
    } catch (updateErr) {
      log.error(
        chalk.red('[startup] Failed to configure autoUpdater'),
        updateErr,
      );
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
        plugins: getDefaultPluginsObject(),
      };
      await writeJson(configPath, defaultConfig);
      log.info(
        chalk.cyan(
          '[startup] First run detected. Created default config.json at',
        ),
        configPath,
      );
    }

    // Step 4: Check for required game files (extracted state)
    const filesExist = hasRequiredGameFiles(gameRoot);
    let needsUpdate = false;

    // Step 5: Sync extracted state with file system
    // Note: We don't sync downloaded state - users may delete ZIP files to save space after extraction
    if (storageData.GAME_UPDATER.baseGame.extracted !== filesExist) {
      storageData.GAME_UPDATER.baseGame.extracted = filesExist;
      needsUpdate = true;
      log.info(
        chalk.cyan(`[startup] Synced baseGame.extracted to ${filesExist}`),
      );
    }

    // Step 6: Fetch remote version info FIRST (needed for version reset logic)
    let release: any = null;
    let patchManifest: any = null;
    let remoteVersion: string = '0';
    let baseVersion: string = '1.0.0'; // fallback default

    try {
      log.info(
        chalk.cyan('[startup] Fetching remote release and patch manifest...'),
      );
      const manifests = await getCachedManifests();
      release = manifests.release;
      patchManifest = manifests.patchManifest;
      remoteVersion = patchManifest.latestVersion;
      baseVersion = release.game.baseVersion || '1.0.0';
      log.info(
        chalk.cyan(
          `[startup] Remote versions - base: ${baseVersion}, latest: ${remoteVersion}`,
        ),
      );
    } catch (remoteErr) {
      log.warn(
        chalk.yellow('[startup] Failed to fetch remote version info:'),
        remoteErr,
      );
      // Continue with fallback values
    }

    // Step 7: Auto-extract if ZIP exists but game files don't
    // Note: We don't sync downloaded state with ZIP existence - users may delete ZIPs to save space
    const baseGameZipName = release?.game?.fullUrl?.split('/').pop() || 'Eventide-test.zip';
    const baseGameZipPath = path.join(dlRoot, baseGameZipName);
    const zipExists = fs.existsSync(baseGameZipPath);

    if (zipExists && !filesExist) {
      try {
        log.info(
          chalk.cyan(
            '[startup] Game zip exists but not extracted. Extracting now...',
          ),
        );
        await extractBaseGameIfNeeded(storageData, dlRoot, gameRoot, baseGameZipName);
        // Re-check after extraction
        storageData.GAME_UPDATER.baseGame.extracted =
          hasRequiredGameFiles(gameRoot);
        // IMPORTANT: Reset version to base version after extraction (even if storage had a different version)
        storageData.GAME_UPDATER.currentVersion = baseVersion;
        storageData.GAME_UPDATER.updater.downloaded = '0';
        storageData.GAME_UPDATER.updater.extracted = '0';
        needsUpdate = true;
        log.info(
          chalk.cyan(
            `[startup] Reset version to ${baseVersion} after base game extraction`,
          ),
        );

        // Notify renderer that extraction is complete and state has changed
        const g: any = global;
        if (g.mainWindow && g.mainWindow.webContents) {
          g.mainWindow.webContents.send('game:status', {
            status: 'update-available',
            installedVersion: baseVersion,
            remoteVersion: remoteVersion !== '0' ? remoteVersion : undefined,
          });
          log.info(
            chalk.cyan('[startup] Notified renderer of update-available state'),
          );
        }
      } catch (extractErr) {
        log.error(chalk.red('[startup] Auto-extraction failed:'), extractErr);
        storageData.GAME_UPDATER.baseGame.extracted = false;
        needsUpdate = true;
      }
    }

    // Step 8: Initialize version if this is first extraction (for backward compatibility)
    if (
      isZeroVersion(storageData.GAME_UPDATER.currentVersion) &&
      storageData.GAME_UPDATER.baseGame.extracted
    ) {
      storageData.GAME_UPDATER.currentVersion = baseVersion;
      needsUpdate = true;
      log.info(
        chalk.cyan(
          `[startup] Initialized version to ${baseVersion} after base game extraction`,
        ),
      );
    }

    // Step 9: Ensure updater fields are initialized
    if (!storageData.GAME_UPDATER.updater.downloaded) {
      storageData.GAME_UPDATER.updater.downloaded = '0';
      needsUpdate = true;
    }
    if (!storageData.GAME_UPDATER.updater.extracted) {
      storageData.GAME_UPDATER.updater.extracted = '0';
      needsUpdate = true;
    }

    // Step 10: Update latestVersion in storage
    if (
      remoteVersion !== '0' &&
      storageData.GAME_UPDATER.latestVersion !== remoteVersion
    ) {
      storageData.GAME_UPDATER.latestVersion = remoteVersion;
      needsUpdate = true;
      log.info(
        chalk.cyan(`[startup] Updated latestVersion to ${remoteVersion}`),
      );
    }

    if (needsUpdate) {
      await writeStorage(storageData);
      log.info(chalk.cyan('[startup] Storage updated after state sync'));
    }

    // Step 11: Log update status
    const { currentVersion } = storageData.GAME_UPDATER;
    if (currentVersion !== remoteVersion && remoteVersion !== '0') {
      log.info(
        chalk.cyan(
          `[startup] Update available: ${currentVersion} → ${remoteVersion}`,
        ),
      );
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
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('launcher:downloadUpdate', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[launcher:downloadUpdate] error'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('launcher:installUpdate', async () => {
  try {
    const choice = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message:
        'A new version of the Eventide launcher has been downloaded. Restart now to install?',
    });

    if (choice.response === 0) {
      autoUpdater.quitAndInstall();
    }

    return { success: true };
  } catch (error) {
    log.error(chalk.red('[launcher:installUpdate] error'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// IPC handler to expose all EventideXI paths to the renderer
ipcMain.handle('eventide:get-paths', async () => {
  try {
    // Check if user has selected an installation directory
    const storage = await readStorage();
    const hasSelectedDir = !!(storage?.paths?.customInstallDir || storage?.paths?.installPath);

    // Only return actual paths if user has selected a directory
    // Otherwise return empty strings to indicate no selection made yet
    const paths = getEventidePaths(hasSelectedDir);
    return { success: true, data: paths, hasSelectedDir };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// IPC handler to open directory picker for custom installation location
ipcMain.handle('select-install-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Parent Directory for EventideXI Installation',
      buttonLabel: 'Select Directory',
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedDir = result.filePaths[0];
    // Automatically append 'EventideXI' to the selected directory
    const finalInstallDir = path.join(selectedDir, 'EventideXI');

    // Validate the final installation directory
    const { validateInstallDirectory } = require('./paths');
    const validation = await validateInstallDirectory(finalInstallDir, 10 * 1024 * 1024 * 1024); // 10GB minimum

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    return { success: true, path: finalInstallDir };
  } catch (error) {
    log.error(chalk.red('[select-install-directory] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// IPC handler to set custom installation directory
ipcMain.handle('set-install-directory', async (_event, dirPath: string | null) => {
  try {
    const { setCustomInstallDir, getEventidePaths } = require('./paths');

    // Update the in-memory cache
    setCustomInstallDir(dirPath);

    // Update storage.json with custom dir and actual paths
    await updateStorage((data: StorageJson) => {
      data.paths.customInstallDir = dirPath || undefined;

      // Update actual install and download paths now that user has chosen
      const paths = getEventidePaths();
      data.paths.installPath = paths.gameRoot;
      data.paths.downloadPath = paths.dlRoot;
    });

    // Recreate directories at new location (including game directories)
    ensureDirs(true);

    log.info(chalk.cyan('[set-install-directory] Updated install directory to:'), dirPath || 'default');

    return { success: true };
  } catch (error) {
    log.error(chalk.red('[set-install-directory] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
      log.info(
        chalk.cyan('[config] Migrating old extensions structure to new format'),
      );

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
        username =
          (await keytar.getPassword(SERVICE_NAME, KEYTAR_ACCOUNT_USERNAME)) ||
          '';
        password =
          (await keytar.getPassword(SERVICE_NAME, KEYTAR_ACCOUNT_PASSWORD)) ||
          '';
        log.info(chalk.cyan('[keytar] Got credentials?'), {
          username: !!username,
          password: !!password,
        });
      } catch (e) {
        log.warn(chalk.yellow('[keytar] Failed to get credentials:'), e);
      }
    }
    return { success: true, data: { ...config, username, password } };
  } catch (error) {
    log.error(chalk.red('Error reading config file:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
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
    // Ensure essential directories exist (logs, userData) but not necessarily game dirs
    ensureDirs(false);
    // Log the data to be written
    try {
      const json = JSON.stringify(data);
      if (json.length > 1000000) {
        // 1MB limit for sanity
        log.error(
          chalk.red(
            '[write-settings] Refusing to write config: data too large',
          ),
        );
        return {
          success: false,
          error: 'Config data too large to write.',
        };
      }
      log.info(
        chalk.cyan('[write-settings] Writing config data:'),
        json.slice(0, 500) + (json.length > 500 ? '...truncated' : ''),
      );
      log.info(chalk.cyan('[config] Writing config file at'), configPath);
      await writeJson(configPath, data);
    } catch (writeErr) {
      log.error(chalk.red('[write-settings] writeJson failed:'), writeErr);
      return {
        success: false,
        error:
          writeErr instanceof Error
            ? writeErr.stack || writeErr.message
            : String(writeErr),
      };
    }
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[write-settings] outer error:'), error);
    return {
      success: false,
      error:
        error instanceof Error ? error.stack || error.message : 'Unknown error',
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

    // Define required plugins that should always be loaded
    const requiredPlugins = ['Addons', 'Screenshot', 'Sequencer', 'Thirdparty'];

    // Get enabled plugins (excluding required ones as they're always included)
    const enabledPlugins: string[] = [];
    if (config.plugins) {
      Object.entries(config.plugins).forEach(([key, value]: [string, any]) => {
        // Skip required plugins as they're handled separately
        if (!requiredPlugins.includes(key) && value.enabled === true) {
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

    // Path to default.txt
    const scriptsDir = path.join(paths.gameRoot, 'scripts');
    const defaultScriptPath = path.join(scriptsDir, 'default.txt');

    // Read existing file to preserve custom user settings
    let customUserContent = '';
    if (fs.existsSync(defaultScriptPath)) {
      try {
        const existingContent = fs.readFileSync(defaultScriptPath, 'utf-8');
        const startMarker = '########## Custom user addons and plugins start here  ##########';
        const endMarker = '########## Custom user addons and plugins ends here ##########';

        const startIndex = existingContent.indexOf(startMarker);
        const endIndex = existingContent.indexOf(endMarker);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          // Extract content between markers (excluding the markers themselves)
          customUserContent = existingContent
            .substring(startIndex + startMarker.length, endIndex)
            .trim();

          if (customUserContent) {
            log.info(
              chalk.cyan('[write-default-script] Preserved custom user settings'),
            );
          }
        }
      } catch (err) {
        log.warn(
          chalk.yellow('[write-default-script] Could not read existing file, custom settings will not be preserved:'),
          err,
        );
      }
    }

    // Build script content
    const lines: string[] = [];
    lines.push('########## START DO NOT MODIFY AREA ##########');
    lines.push('');
    lines.push('#EVENTIDE_MANDATORY_PLUGINS_START');
    // Add required plugins first (always loaded)
    requiredPlugins.forEach((plugin) => {
      lines.push(`/load ${plugin}`);
    });
    lines.push('#EVENTIDE_MANDATORY_PLUGINS_END');
    lines.push('');
    lines.push('#EVENTIDE_LAUNCHER_ADDONS_AND_PLUGINS_START');
    // Add user-enabled plugins
    enabledPlugins.forEach((plugin) => {
      lines.push(`/load ${plugin}`);
    });

    // Blank line between plugins and addons
    if ((requiredPlugins.length > 0 || enabledPlugins.length > 0) && enabledAddons.length > 0) {
      lines.push('');
    }

    // Add addons
    enabledAddons.forEach((addon) => {
      lines.push(`/addon load ${addon}`);
    });
    lines.push('/wait 5');
    lines.push('/renamer load ET');
    lines.push('#EVENTIDE_LAUNCHER_ADDONS_AND_PLUGINS_END');
    lines.push('');
    lines.push('/bind insert /ashita');
    lines.push('/bind SYSRQ /screenshot hide');
    lines.push('/bind ^v /paste');
    lines.push('/bind F11 /ambient');
    lines.push('/bind F12 /fps');
    lines.push('/bind ^F1 /ta <a10>');
    lines.push('/bind ^F2 /ta <a11>');
    lines.push('/bind ^F3 /ta <a12>');
    lines.push('/bind ^F4 /ta <a13>');
    lines.push('/bind ^F5 /ta <a14>');
    lines.push('/bind ^F6 /ta <a15>');
    lines.push('/bind !F1 /ta <a20>');
    lines.push('/bind !F2 /ta <a21>');
    lines.push('/bind !F3 /ta <a22>');
    lines.push('/bind !F4 /ta <a23>');
    lines.push('/bind !F5 /ta <a24>');
    lines.push('/bind !F6 /ta <a25>');
    lines.push('');
    lines.push('/wait 3');
    lines.push('/ambient 255 255 255');
    lines.push('');
    lines.push('########## END DO NOT MODIFY AREA ##########');
    lines.push('');
    lines.push('########## Custom user addons and plugins start here  ##########');
    lines.push('');
    // Add preserved custom content
    if (customUserContent) {
      lines.push(customUserContent);
    }

    lines.push('########## Custom user addons and plugins ends here ##########');
    const scriptContent = lines.join('\n');

    // Ensure scripts directory exists
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Write the file
    fs.writeFileSync(defaultScriptPath, scriptContent, 'utf-8');

    log.info(
      chalk.cyan('[write-default-script] Written default.txt:'),
      defaultScriptPath,
    );
    log.info(
      chalk.cyan('[write-default-script] Required plugins (always loaded):'),
      requiredPlugins.join(', '),
    );
    log.info(
      chalk.cyan('[write-default-script] User-enabled plugins:'),
      enabledPlugins.length,
    );
    log.info(
      chalk.cyan('[write-default-script] Enabled addons:'),
      enabledAddons.length,
    );

    return { success: true, path: defaultScriptPath };
  } catch (error) {
    log.error(chalk.red('[write-default-script] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle(
  'launcher:downloadGame',
  async (
    _event,
    fullUrl: string,
    sha256: string,
    installDir: string,
    baseVersion: string,
    expectedSize?: number,
  ) => {
    try {
      const paths = getEventidePaths();
      log.info(
        chalk.cyan(
          `[download] Starting download: ${fullUrl} to ${paths.gameRoot}`,
        ),
      );

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
        fullUrl,
        sha256,
        paths.gameRoot,
        paths.dlRoot,
        baseVersion,
        expectedSize,
        onDownloadProgress,
        onExtractProgress,
      );
      log.info(chalk.cyan('[download] Download completed successfully'));
      return { success: true };
    } catch (err) {
      log.error(chalk.red(`[download] Download failed: ${String(err)}`));
      return { success: false, error: String(err) };
    }
  },
);

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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('write-extensions', async (_event, data) => {
  try {
    const extensionsPath = path.join(process.cwd(), 'extensions.json');
    await fs.writeJson(extensionsPath, data);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[write-extensions] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle(
  'launcher:applyPatches',
  async (_event, patchManifest: any, installDir: string) => {
    try {
      await applyPatches(patchManifest, installDir);
      return { success: true };
    } catch (err) {
      log.error(chalk.red('[patch] Error applying patches:'), err);
      return { success: false, error: String(err) };
    }
  },
);

ipcMain.handle('launcher:launchGame', async (_event, installDir: string) => {
  try {
    let launchScript: string;
    if (process.platform === 'win32') {
      launchScript = path.join(installDir, 'Launch_Eventide.bat');
    } else {
      // Linux and other Unix-like systems
      launchScript = path.join(installDir, 'Launch_Eventide.sh');
    }
    log.info(
      chalk.cyan(`[launch] Attempting to launch game using: ${launchScript}`),
    );
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

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
// Expose mainWindow globally for extraction IPC events
if (!(global as any).mainWindow) {
  (global as any).mainWindow = null;
}

// Ensure mainWindow is initialized on app ready
app.on('ready', () => {
  // Determine preload path based on environment
  const preloadPath = app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../../.erb/dll/preload.js');

  // Get primary display size for max window size
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  // Default window size
  const defaultWidth = isDev ? 1600 : 1148;
  const defaultHeight = isDev ? 750 : 673;

  // Minimum size is half of default
  const minWidth = Math.floor(defaultWidth / 2);
  const minHeight = Math.floor(defaultHeight / 2);

  // Maximum size is screen size
  const maxWidth = screenWidth;
  const maxHeight = screenHeight;

  mainWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    frame: !!isDev, // Remove Windows frame for custom UI
    transparent: true, // Enable transparency for borderless window
    resizable: true,
    backgroundColor: '#00FFFFFF',
    titleBarStyle: !!isDev ? 'default' : 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  mainWindow.loadURL(resolveHtmlPath('index.html'));

  // Security: Prevent unauthorized window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.warn(chalk.yellow(`[Security] Blocked attempt to open new window: ${url}`));

    // Only allow opening safe URLs in external browser
    if (isUrlSafeForExternal(url)) {
      shell.openExternal(url).catch(err =>
        log.error(chalk.red('[Security] Error opening external URL:'), err)
      );
    }

    return { action: 'deny' };
  });

  // Security: Prevent unauthorized navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const allowedUrls = [
      resolveHtmlPath('index.html'),
      'file://',
      'devtools://'
    ];

    const isAllowed = allowedUrls.some(allowed => navigationUrl.startsWith(allowed));

    if (!isAllowed) {
      log.warn(chalk.yellow(`[Security] Blocked navigation to: ${navigationUrl}`));
      event.preventDefault();
    }
  });

  // Open DevTools automatically in development mode
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
    (global as any).mainWindow = null;
  });
  (global as any).mainWindow = mainWindow;

  // Create desktop shortcut on first run (only in production)
  if (process.env.NODE_ENV === 'production') {
    const { createDesktopShortcut } = require('./util');
    createDesktopShortcut()
      .then((result: { success: boolean; error?: string }) => {
        if (result.success) {
          log.info(
            chalk.green('[startup] Desktop shortcut created or already exists'),
          );
        } else {
          log.warn(
            chalk.yellow('[startup] Failed to create desktop shortcut:'),
            result.error,
          );
        }
      })
      .catch((err: Error) => {
        log.error(chalk.red('[startup] Error creating desktop shortcut:'), err);
      });
  }
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

// IPC handler to return launcher version
ipcMain.handle('get-launcher-version', async () => {
  return app.getVersion();
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
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle(
  'update-ini-auth-and-run',
  async (_event, username: string, password: string, installDir?: string) => {
    // Sanitize inputs to remove control characters
    const sanitizedUsername = sanitizeInput(username);
    const sanitizedPassword = sanitizeInput(password);

    // Validate inputs are not empty
    if (sanitizedUsername.length === 0) {
      log.error(chalk.red('[INI] Username cannot be empty'));
      return {
        success: false,
        error: 'Username cannot be empty',
      };
    }

    if (sanitizedPassword.length === 0) {
      log.error(chalk.red('[INI] Password cannot be empty'));
      return {
        success: false,
        error: 'Password cannot be empty',
      };
    }

    log.info(
      chalk.cyan(
        `[INI] update-ini-auth-and-run called (credentials provided: ${!!sanitizedUsername && !!sanitizedPassword})`,
      ),
    );
    try {
      const paths = getEventidePaths();
      const targetDir = installDir || paths.gameRoot;
      // Ensure all directories exist including game dirs (needed for INI file)
      ensureDirs(true);
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
        commandParts = commandParts.filter(
          (part: string, idx: number, arr: string[]) => {
            if (
              (part === '--user' || part === '--pass') &&
              idx + 1 < arr.length
            ) {
              return false; // skip this and the next (the value)
            }
            // Also skip the value if previous was --user or --pass
            if (
              idx > 0 &&
              (arr[idx - 1] === '--user' || arr[idx - 1] === '--pass')
            ) {
              return false;
            }
            return true;
          },
        );
        // Only append --user and --pass if both are non-empty
        if (sanitizedUsername && sanitizedPassword) {
          // Check for forbidden characters in password which can cause game launch issues
          const warnings = [];
          if (sanitizedPassword.includes('-')) warnings.push('dash (-)');
          if (sanitizedPassword.includes('#')) warnings.push('hash (#)');
          if (sanitizedPassword.includes(' ')) warnings.push('space');

          if (warnings.length > 0) {
            log.warn(
              chalk.yellow(
                `[INI] WARNING: Password contains forbidden character(s): ${warnings.join(', ')} which may cause game launch issues!`,
              ),
            );
          }
          log.info(
            chalk.cyan(
              `[INI] Appending --user and --pass to command: [REDACTED]`,
            ),
          );
          commandParts.push('--user', sanitizedUsername, '--pass', sanitizedPassword);
        } else {
          log.info(
            chalk.cyan(
              '[INI] Username or password empty, not appending --user/--pass',
            ),
          );
        }
        config.ashita.boot.command = commandParts.join(' ');
        log.info(
          chalk.cyan('[INI] Final INI command:'),
          config.ashita.boot.command,
        );
      }

      // Also attempt to read settings.json and apply mapped settings to the INI
      try {
        const settingsPath = paths.config;
        if (fs.existsSync(settingsPath)) {
          log.info(chalk.cyan('Applying settings from:'), settingsPath);
          const settings =
            (await readJson<Record<string, any>>(settingsPath)) || {};

          // Apply settings from settings.json to INI config
          applySettingsToIni(settings, config);

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
          log.info(
            chalk.cyan('No settings.json found at'),
            settingsPath,
            '- skipping extra INI mappings',
          );
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
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

ipcMain.handle(
  'write-config',
  async (
    _event,
    data: { username: string; password: string; rememberCredentials: boolean },
  ) => {
    try {
      // Sanitize inputs to remove control characters
      const sanitizedUsername = sanitizeInput(data.username);
      const sanitizedPassword = sanitizeInput(data.password);

      // Validate boolean input
      const rememberCredentials = Boolean(data.rememberCredentials);

      const paths = getEventidePaths();
      ensureDirs(false);
      const configPath = paths.config;
      // Read the existing config, but do NOT spread or copy any password field
      let existingConfig = {};
      if (fs.existsSync(configPath)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (e) {
          log.warn(
            chalk.yellow(
              '[config] Could not parse existing config.json, starting fresh.',
            ),
          );
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
        launcherVersion: app.getVersion(),
      };
      // Handle both username and password in keytar only
      if (rememberCredentials && sanitizedUsername && sanitizedPassword) {
        log.info(chalk.cyan('[keytar] Saving credentials to keytar'));
        await keytar.setPassword(
          SERVICE_NAME,
          KEYTAR_ACCOUNT_USERNAME,
          sanitizedUsername,
        );
        await keytar.setPassword(
          SERVICE_NAME,
          KEYTAR_ACCOUNT_PASSWORD,
          sanitizedPassword,
        );
        log.info(chalk.cyan('[keytar] Credentials saved'));
      } else {
        log.info(chalk.cyan('[keytar] Deleting credentials from keytar'));
        // Add delay to prevent race conditions with password deletion
        await new Promise((resolve) => setTimeout(resolve, 500));
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
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC handlers for opening folders and log files
ipcMain.handle('open-config-folder', async () => {
  try {
    const paths = getEventidePaths();
    const configFolder = paths.userData;

    await shell.openPath(configFolder);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[open-config-folder] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('open-log-file', async () => {
  try {
    const paths = getEventidePaths();
    const logFile = path.join(paths.logsRoot, 'main.log');
    // Check if log file exists, if not use launcher-invoke-output.log
    const fileToOpen = fs.existsSync(logFile)
      ? logFile
      : path.join(paths.logsRoot, 'launcher-invoke-output.log');

    await shell.openPath(fileToOpen);
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[open-log-file] Error:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle(
  'open-extension-folder',
  async (_event, folderType: 'addons' | 'plugins') => {
    try {
      // Security: Validate folder type
      if (folderType !== 'addons' && folderType !== 'plugins') {
        log.error(chalk.red('[Security] Invalid folder type requested'));
        return {
          success: false,
          error: 'Invalid folder type',
        };
      }

      const paths = getEventidePaths();
      // Plugins are in gameRoot/plugins, addons are in gameRoot/config/addons
      const extensionFolder = folderType === 'plugins'
        ? path.join(paths.gameRoot, 'plugins')
        : path.join(paths.gameRoot, 'config', folderType);

      // Ensure folder exists
      if (!fs.existsSync(extensionFolder)) {
        fs.mkdirSync(extensionFolder, { recursive: true });
      }

      await shell.openPath(extensionFolder);
      return { success: true };
    } catch (error) {
      log.error(
        chalk.red(`[open-extension-folder] Error opening ${folderType}:`),
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC handler to open gamepad config executable
ipcMain.handle('open-gamepad-config', async () => {
  try {
    // Note: This feature is Windows-only. On Linux, users would need to configure
    // the gamepad through Wine/Proton's control panel or other tools.
    if (process.platform !== 'win32') {
      return {
        success: false,
        error: 'Gamepad configuration is only available on Windows. On Linux, please use Wine/Proton configuration tools.',
      };
    }

    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const gamepadConfigPath = path.join(
      installDir,
      'SquareEnix',
      'FINAL FANTASY XI',
      'ToolsUS',
      'FFXiPadConfig.exe',
    );

    if (!fs.existsSync(gamepadConfigPath)) {
      log.error(
        chalk.red('[open-gamepad-config] FFXiPadConfig.exe not found at:'),
        gamepadConfigPath,
      );
      return {
        success: false,
        error:
          'Gamepad config executable not found. Please ensure the game is installed.',
      };
    }

    log.info(
      chalk.cyan('[open-gamepad-config] Opening gamepad config at:'),
      gamepadConfigPath,
    );
    await shell.openPath(gamepadConfigPath);
    return { success: true };
  } catch (error) {
    log.error(
      chalk.red('[open-gamepad-config] Error opening gamepad config:'),
      error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// IPC handler to reapply patches by resetting version to 1.0.0
ipcMain.handle('reapply-patches', async () => {
  try {
    log.info(
      chalk.cyan(
        '[reapply-patches] Resetting version to 1.0.0 to trigger patch reapplication',
      ),
    );

    const paths = getEventidePaths();
    const downloadsDir = paths.dlRoot;

    // Fetch manifest to identify patch files
    try {
      const { release, patchManifest } = await getCachedManifests();
      const patches = patchManifest.patches || [];
      const baseZipName = release.game.fullUrl.split('/').pop();

      log.info(
        chalk.cyan(
          `[reapply-patches] Deleting patch files from downloads (preserving base game: ${baseZipName})`,
        ),
      );

      // Delete all patch ZIP files but preserve the base game ZIP
      if (fs.existsSync(downloadsDir)) {
        const files = await fs.readdir(downloadsDir);
        for (const file of files) {
          // Skip the base game ZIP
          if (file === baseZipName) {
            log.info(chalk.cyan(`[reapply-patches] Preserving base game: ${file}`));
            continue;
          }

          // Check if this file is a patch ZIP
          const isPatchFile = patches.some((patch: any) => {
            const patchZipName = patch.fullUrl.split('/').pop();
            return patchZipName === file;
          });

          if (isPatchFile) {
            const filePath = path.join(downloadsDir, file);
            try {
              await fs.unlink(filePath);
              log.info(chalk.cyan(`[reapply-patches] Deleted patch file: ${file}`));
            } catch (unlinkErr) {
              log.warn(chalk.yellow(`[reapply-patches] Failed to delete ${file}:`), unlinkErr);
            }
          }
        }
      }
    } catch (manifestErr) {
      log.warn(
        chalk.yellow('[reapply-patches] Could not fetch manifest to identify patch files:'),
        manifestErr,
      );
      log.warn(chalk.yellow('[reapply-patches] Continuing with version reset only'));
    }

    // Update storage to reset version
    await updateStorage((data: StorageJson) => {
      data.GAME_UPDATER.currentVersion = '1.0.0';
      data.GAME_UPDATER.updater.downloaded = '1.0.0';
      data.GAME_UPDATER.updater.extracted = '1.0.0';
    });

    log.info(chalk.green('[reapply-patches] Version reset and patch files deleted successfully'));
    return { success: true };
  } catch (error) {
    log.error(chalk.red('[reapply-patches] Error resetting version:'), error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// ---- Game install / update helpers and IPC handlers ----

// Debug startup marker to help confirm main process is running the current source.
try {
  log.info(chalk.cyan('Launcher main boot:'), {
    __dirname,
    NODE_ENV: process.env.NODE_ENV,
  });
} catch (e) {}

// Centralized launcher helper: prefer the batch wrapper and capture output
async function launchGameWithBatch(installDir: string, launchScript: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      if (!fs.existsSync(launchScript)) {
        return resolve({
          success: false,
          error: `Launch script not found: ${launchScript}`,
        });
      }

      // Use logsRoot for launcher logs
      const paths = getEventidePaths();
      const logPath = path.join(paths.logsRoot, 'launcher-invoke-output.log');
      // Ensure all directories exist including game dirs (game must be installed to launch)
      ensureDirs(true);
      try {
        fs.appendFileSync(
          logPath,
          `\n--- Launcher invoke at ${new Date().toISOString()} ---\n`,
        );
      } catch {}

      let child;
      if (process.platform === 'win32') {
        // Use cmd.exe to run the batch file
        child = spawn('cmd.exe', ['/c', launchScript], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: installDir,
        });
      } else {
        // Use /bin/bash or /bin/sh to run the shell script on Linux/Unix
        // Make script executable first
        try {
          fs.chmodSync(launchScript, '755');
        } catch (chmodErr) {
          log.warn(chalk.yellow('[launch] Could not chmod launch script:'), chmodErr);
        }
        child = spawn('/bin/bash', [launchScript], {
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
          try {
            outStream.write(`spawn error: ${String(err)}\n`);
          } catch {}
        });
        child.on('close', (code, signal) => {
          try {
            outStream.write(
              `child exit code=${String(code)} signal=${String(signal)}\n`,
            );
          } catch {}
          try {
            outStream.end();
          } catch {}
        });
      } catch (e) {
        // ignore logging failures
      }

      child.on('error', (err) =>
        resolve({ success: false, error: String(err) }),
      );
      // detach and let the game run independently
      try {
        child.unref();
      } catch (e) {}
      return resolve({ success: true });
    } catch (err) {
      return resolve({ success: false, error: String(err) });
    }
  });
}

// fetchJson is now imported from utils/io

// IPC handler for fetching patch notes
ipcMain.handle('game:fetch-patch-notes', async () => {
  try {
    const { release } = await getCachedManifests();

    if (!release.patchNotesUrl) {
      log.warn(chalk.yellow('[patch-notes] No patchNotesUrl in release.json'));
      return { success: false, error: 'No patch notes URL configured' };
    }

    const patchNotes = await getPatchNotes(release.patchNotesUrl);

    log.info(
      chalk.green(`[patch-notes] Fetched ${patchNotes.length} patch notes`),
    );

    return { success: true, data: patchNotes };
  } catch (err) {
    log.error(chalk.red('[patch-notes] Error fetching patch notes:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:check', async () => {
  try {
    // Check if user has selected an installation directory
    const storage = await readStorage();
    const hasSelectedDir = !!(storage?.paths?.customInstallDir || storage?.paths?.installPath);

    // If no directory selected, always return 'missing' state
    if (!hasSelectedDir) {
      log.info(chalk.cyan('[game:check] No installation directory selected yet'));
      return {
        exists: false,
        launcherState: 'missing',
        latestVersion: '0',
        installedVersion: '0.0.0',
        baseDownloaded: false,
        baseExtracted: false,
        needsDirectorySelection: true,
      };
    }

    const paths = getEventidePaths(true); // Safe to use default since dir is selected
    const installDir = paths.gameRoot;
    const downloadsDir = paths.dlRoot;

    // Fetch release and patch manifest using cache
    const { release, patchManifest } = await getCachedManifests();
    const latestVersion = String(patchManifest.latestVersion ?? '0');
    const { baseVersion } = release.game;

    // Read storage.json - this is the single source of truth for game state
    let currentVersion = '0.0.0';
    let baseDownloaded = false;
    let baseExtracted = false;

    if (storage && storage.GAME_UPDATER) {
      currentVersion = String(storage.GAME_UPDATER.currentVersion ?? '0.0.0');
      baseDownloaded = !!storage.GAME_UPDATER.baseGame.downloaded;
      baseExtracted = !!storage.GAME_UPDATER.baseGame.extracted;
    }

    log.info(chalk.cyan('[game:check] Storage state - downloaded:'), baseDownloaded, 'extracted:', baseExtracted, 'version:', currentVersion);

    // Simplified state determination based on storage.json flags:
    // 1. If extracted=true -> Game is ready (or needs update if version differs)
    // 2. If extracted=false -> Show download button (ZIP files may have been deleted by user to save space)
    // Note: We don't check ZIP existence - the downloaded flag just indicates download completed at some point

    let launcherState: 'missing' | 'ready' | 'update-available' | 'downloaded';

    if (baseExtracted) {
      // Game has been extracted - it's either ready or needs an update
      // No need to check file system - trust storage.json
      if (currentVersion === latestVersion) {
        launcherState = 'ready';
        log.info(chalk.green('[game:check] Game is ready - version matches latest'));
      } else {
        launcherState = 'update-available';
        log.info(chalk.cyan(`[game:check] Update available - current: ${currentVersion}, latest: ${latestVersion}`));
      }
    } else {
      // Game not extracted - show download button
      // Note: Even if downloaded=true, the ZIP may have been deleted by user, so we show download
      launcherState = 'missing';
      log.info(chalk.cyan('[game:check] Game not installed - showing download button'));
    }

    log.info(chalk.cyan('[game:check] currentVersion:'), currentVersion);
    log.info(chalk.cyan('[game:check] latestVersion:'), latestVersion);
    log.info(chalk.cyan('[game:check] launcherState:'), launcherState);

    // For existence check, use the extracted flag from storage (trust storage.json)
    const exists = baseExtracted;

    return {
      exists,
      launcherState,
      latestVersion,
      installedVersion: currentVersion,
      baseDownloaded,
      baseExtracted,
    };
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
    return {
      success: true,
      data: (global as any).__lastDownloadProgress ?? null,
    };
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
    return {
      success: true,
      data: (global as any).__lastDownloadChecksum ?? null,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Handler to clear all downloads and reset state
ipcMain.handle('clear-downloads', async () => {
  try {
    const paths = getEventidePaths();
    const downloadsDir = paths.dlRoot;

    log.info(
      chalk.cyan(
        '[clear-downloads] Clearing downloads directory:',
        downloadsDir,
      ),
    );

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
      data.GAME_UPDATER.currentVersion = '0.0.0';
      data.GAME_UPDATER.baseGame.downloaded = false;
      data.GAME_UPDATER.baseGame.extracted = false;
      data.GAME_UPDATER.updater.downloaded = '';
      data.GAME_UPDATER.updater.extracted = '';
    });

    log.info(
      chalk.green('[clear-downloads] Downloads cleared and state reset'),
    );
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

    // Check disk space before starting download
    const requiredSpace = (release.game.sizeBytes || 0) * 2; // Double for extraction space
    const { checkDiskSpace } = require('../core/fs');
    const spaceCheck = await checkDiskSpace(downloadsDir, requiredSpace);

    if (!spaceCheck.hasSpace) {
      const errorMsg =
        spaceCheck.message ||
        'Insufficient disk space for download and extraction.';
      log.error(chalk.red(`[game:download] ${errorMsg}`));
      if (mainWindow) {
        mainWindow.webContents.send('game:status', {
          status: 'error',
          message: errorMsg,
        });
      }
      return { success: false, error: errorMsg };
    }

    log.info(
      chalk.green(
        `[game:download] Sufficient disk space available: ${(spaceCheck.availableBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      ),
    );

    // Check write permissions
    const { checkDirectoryWritable } = require('../core/fs');
    const writeCheck = await checkDirectoryWritable(downloadsDir);
    if (!writeCheck.writable) {
      const errorMsg =
        writeCheck.error ||
        'Cannot write to downloads directory. Please check folder permissions.';
      log.error(chalk.red(`[game:download] ${errorMsg}`));
      if (mainWindow) {
        mainWindow.webContents.send('game:status', {
          status: 'error',
          message: errorMsg,
        });
      }
      return { success: false, error: errorMsg };
    }
    log.info(
      chalk.green(
        `[game:download] Write permissions verified for downloads directory`,
      ),
    );

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
      onExtractProgress,
    );

    // After successful download and extraction, invalidate cache and fetch fresh data
    log.info(
      chalk.green(
        '[game:download] Download and extraction complete, checking for patches...',
      ),
    );

    // Invalidate cache to ensure we get fresh version info
    invalidateManifestCache();
    const { patchManifest: freshPatchManifest } = await getCachedManifests();
    const latestVersion = String(freshPatchManifest.latestVersion ?? '0');
    const currentVersion = release.game.baseVersion;

    log.info(
      chalk.cyan(
        `[game:download] Current version: ${currentVersion}, Latest version: ${latestVersion}`,
      ),
    );

    // Send status update to renderer
    if (mainWindow) {
      if (currentVersion !== latestVersion) {
        log.info(
          chalk.cyan(`[game:download] Update available, notifying renderer`),
        );
        mainWindow.webContents.send('game:status', {
          status: 'update-available',
          installedVersion: currentVersion,
          remoteVersion: latestVersion,
        });
      } else {
        log.info(
          chalk.cyan(`[game:download] Game is up to date, notifying renderer`),
        );
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
    if (
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNREFUSED')
    ) {
      errorMessage =
        'Network error: Unable to connect to download server. Check your internet connection.';
    } else if (errorMessage.includes('ENOSPC')) {
      errorMessage =
        'Insufficient disk space. Please free up space and try again.';
    } else if (
      errorMessage.includes('EACCES') ||
      errorMessage.includes('EPERM')
    ) {
      errorMessage =
        'Permission denied. Try running the launcher as administrator.';
    } else if (errorMessage.includes('SHA256 mismatch')) {
      errorMessage =
        'Download verification failed. The file may be corrupted. Please try again.';
    } else if (errorMessage.includes('Size mismatch')) {
      errorMessage =
        'Download incomplete. File size does not match expected size. Please try again.';
    } else if (errorMessage.includes('Extraction verification failed')) {
      errorMessage =
        'File extraction failed. The downloaded archive may be corrupted. Try clearing downloads.';
    }

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), {
        status: 'error',
        message: errorMessage,
      });
      mainWindow.webContents.send('game:status', {
        status: 'error',
        message: errorMessage,
      });
    }
    return { success: false, error: errorMessage };
  }
});

// Import an existing installation: scan installDir, compute per-file hashes, and write game-version.json
ipcMain.handle('game:import-existing', async () => {
  try {
    const paths = getEventidePaths();
    // Ensure all directories exist including game dirs (importing existing game)
    ensureDirs(true);
    const installDir = paths.gameRoot;

    if (!fs.existsSync(installDir)) {
      log.error(chalk.red('[import] Install directory not found:'), installDir);
      return {
        success: false,
        error: `Install directory not found: ${installDir}`,
      };
    }

    // quick check for main executable (platform-specific)
    const exeName = process.platform === 'win32' ? 'ashita-cli.exe' : 'ashita-cli';
    const mainExe = path.join(installDir, exeName);
    if (!fs.existsSync(mainExe)) {
      log.error(
        chalk.red('[import] Main executable not found in install directory:'),
        mainExe,
      );
      return {
        success: false,
        error: 'Main executable not found in install directory',
      };
    }

    // list files and compute per-file sha256 (may take time)
    const fileEntries: Array<{ path: string; sha256: string }> = [];

    // compute a snapshot checksum for the set (deterministic)
    const snapshotHasher = crypto.createHash('sha256');
    fileEntries.sort((a, b) => a.path.localeCompare(b.path));
    for (const e of fileEntries) {
      snapshotHasher.update(`${e.path}:${e.sha256 || ''}\n`);
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
    log.info(
      chalk.cyan('[import] Writing game-version.json at'),
      localVersionPath,
    );
    await writeJson(localVersionPath, versionData);

    return {
      success: true,
      installedFiles: fileEntries.length,
      snapshot: snapshotHash,
    };
  } catch (err) {
    log.error(chalk.red('[import] Error during import-existing:'), err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:update', async () => {
  try {
    // Prevent concurrent patching operations
    if (isPatchingInProgress) {
      log.warn(
        chalk.yellow(
          '[game:update] Patching already in progress, rejecting new request',
        ),
      );
      return {
        success: false,
        error:
          'Patching already in progress. Please wait for the current operation to complete.',
      };
    }

    isPatchingInProgress = true;
    log.info(
      chalk.cyan('[game:update] Patching started, isPatchingInProgress = true'),
    );

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

    await applyPatches(
      patchManifest,
      installDir,
      onPatchProgress,
      onExtractProgress,
    );

    // After successful patching, invalidate cache and notify renderer that game is ready
    invalidateManifestCache();
    log.info(chalk.green('[game:update] Patching complete, game is ready'));
    if (mainWindow) {
      mainWindow.webContents.send('game:status', { status: 'ready' });
    }

    isPatchingInProgress = false;
    log.info(
      chalk.cyan(
        '[game:update] Patching completed, isPatchingInProgress = false',
      ),
    );
    return { success: true };
  } catch (err) {
    isPatchingInProgress = false;
    log.error(
      chalk.red('[game:update] Patching failed, isPatchingInProgress = false'),
    );
    log.error(chalk.red('Update failed:'), err);

    // Provide more specific error messages for patching
    let errorMessage = String(err);
    if (err instanceof Error) {
      errorMessage = err.message;
    }

    // Categorize common patch errors
    if (
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNREFUSED')
    ) {
      errorMessage =
        'Network error: Unable to download patch. Check your internet connection.';
    } else if (errorMessage.includes('SHA256 mismatch')) {
      errorMessage =
        'Patch verification failed. The patch file may be corrupted. Try clearing downloads.';
    } else if (errorMessage.includes('No patch found')) {
      errorMessage =
        'Patch sequence broken. Please use "Reapply Patches" in Settings.';
    } else if (errorMessage.includes('Extraction verification failed')) {
      errorMessage =
        'Patch extraction failed. The patch archive may be corrupted. Try clearing downloads.';
    } else if (errorMessage.includes('No client version found')) {
      errorMessage =
        'Game version information is missing. Try repairing the installation.';
    }

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), {
        status: 'error',
        message: errorMessage,
      });
      mainWindow.webContents.send('game:status', {
        status: 'error',
        message: errorMessage,
      });
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
      latestVersion: patchManifest.latestVersion,
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
    const launchScript = process.platform === 'win32'
      ? path.join(installDir, 'Launch_Eventide.bat')
      : path.join(installDir, 'Launch_Eventide.sh');

    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), {
        status: 'launching',
      });
      mainWindow.webContents.send('game:status', { status: 'launching' });
    }

    // Require the launch wrapper in all cases; do not fall back to directly
    // launching the executable. Return a clear error if the wrapper is missing.
    if (!fs.existsSync(launchScript)) {
      const msg = `Launch script not found: ${launchScript}`;
      log.error(chalk.red(msg));
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), {
          status: 'error',
          message: msg,
        });
        mainWindow.webContents.send('game:status', {
          status: 'error',
          message: msg,
        });
      }
      return { success: false, error: msg };
    }

    log.info(chalk.cyan('Launching via script:'), launchScript);
    const launchResult = await launchGameWithBatch(installDir, launchScript);
    if (!launchResult.success) {
      log.error(chalk.red('Failed to launch game:'), launchResult.error);
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), {
          status: 'error',
          message: String(launchResult.error),
        });
        mainWindow.webContents.send('game:status', {
          status: 'error',
          message: String(launchResult.error),
        });
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
