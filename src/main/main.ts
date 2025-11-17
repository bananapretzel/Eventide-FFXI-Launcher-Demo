
import log from 'electron-log';
import { getEventidePaths, ensureDirs } from './paths';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import keytar from 'keytar';
import { spawn } from 'child_process';
import ini from 'ini';
import { promisify } from 'util';
import { pipeline } from 'stream';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { RELEASE_JSON_URL, getExePath, getGameInstallDir, getResourcePath, IS_PROD, IS_DEV } from './config';
import { getClientVersion } from '../core/versions';
import { getReleaseJson, getPatchManifest } from '../core/manifest';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { readStorage, writeStorage } from '../core/storage';

import { bootstrap as logicBootstrap } from '../logic/bootstrap';
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
      logBoth.warn('[launcher:bootstrap] Could not read storage.json:', e);
    }
    return { release, patchManifest, clientVersion, baseGameDownloaded, baseGameExtracted };
  } catch (err) {
    logBoth.error('[launcher:bootstrap] error:', err);
    return { error: String(err) };
  }
});

// Helper to log to both terminal and electron-log
const logBoth = Object.assign(
  (msg: string, ...args: any[]) => {
    console.log(msg, ...args);
    log.info(msg, ...args);
  },
  {
    error: (msg: string, ...args: any[]) => {
      console.error(msg, ...args);
      log.error(msg, ...args);
    },
    warn: (msg: string, ...args: any[]) => {
      console.warn(msg, ...args);
      log.warn(msg, ...args);
    }
  }
);

// Stub: read-extensions
ipcMain.handle('read-extensions', async () => {
  return { success: true, data: [] };
});

// Stub: write-extensions
ipcMain.handle('write-extensions', async (_event, data) => {
  return { success: true };
});
// Set the app name to 'Eventide Launcherv2' so userData points to %APPDATA%\Eventide Launcherv2
app.setName('Eventide Launcherv2');

// --- Ensure config.json exists with defaults on startup ---
// ...existing code...
app.once('ready', async () => {
  try {
    const paths = getEventidePaths();
    const { storage, gameRoot, dlRoot } = paths;
    let storageData = await readStorage();
    // If the game is downloaded but not extracted, extract now
    if (storageData && storageData.GAME_UPDATER && storageData.GAME_UPDATER.baseGame.downloaded && !storageData.GAME_UPDATER.baseGame.extracted) {
      try {
        const { extractZip } = require('../core/fs');
        const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
        const baseGameZipPath = path.join(dlRoot, baseGameZipName);
        if (fs.existsSync(baseGameZipPath)) {
          logBoth('[startup] Game zip is downloaded but not extracted. Extracting now...');
          await extractZip(baseGameZipPath, gameRoot);
          storageData.GAME_UPDATER.baseGame.extracted = true;
          await writeStorage(storageData);
          logBoth('[startup] Extraction complete. Updated baseGame.extracted to true.');
        } else {
          logBoth('[startup] Expected base game zip not found at', baseGameZipPath);
        }
      } catch (extractErr) {
        logBoth.error('[startup] Error during auto-extraction:', extractErr);
      }
    }
    const version = app.getVersion ? app.getVersion() : 'unknown';
    const env = process.env.NODE_ENV || 'production';
    logBoth(`[startup] Launcher version: ${version}, environment: ${env}`);
    const configPath = paths.config;
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        username: '',
        password: '',
        rememberCredentials: false,
        launcherVersion: version,
        installDir: ''
      };
      await writeJson(configPath, defaultConfig);
      logBoth('[startup] First run detected. Created default config.json at', configPath);
    }

    // Initialize storage.json with installPath and downloadPath if not set
    try {
      let storageData = await readStorage();
      let baseGameDownloaded = false;
      let baseGameExtracted = false;
      let detectedVersion = "0";
      let storageJustCreated = false;
      const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
      const baseGameZipPath = path.join(dlRoot, baseGameZipName);
      if (!storageData) {
        storageData = {
          paths: {
            installPath: gameRoot,
            downloadPath: dlRoot
          },
          GAME_UPDATER: {
            currentVersion: "0",
            latestVersion: "0",
            baseGame: { downloaded: false, extracted: false },
            updater: { downloaded: "0", extracted: "0" }
          }
        };
        await writeStorage(storageData);
        storageJustCreated = true;
        logBoth('[startup] Initialized storage.json with default paths.');
      }

      // Always check the actual Game folder contents and update baseGame.extracted accordingly
      try {
        const files = fs.existsSync(gameRoot) ? fs.readdirSync(gameRoot) : [];
        // You can add more robust checks here for required files if needed
        const actuallyExtracted = files.length > 0;
        if (storageData.GAME_UPDATER.baseGame.extracted !== actuallyExtracted) {
          storageData.GAME_UPDATER.baseGame.extracted = actuallyExtracted;
          await writeStorage(storageData);
          logBoth(`[startup] Synced baseGame.extracted to ${actuallyExtracted} based on Game folder contents.`);
        }
        baseGameExtracted = actuallyExtracted;
      } catch (e) {
        logBoth.error('[startup] Error checking Game folder for extraction state:', e);
        storageData.GAME_UPDATER.baseGame.extracted = false;
        await writeStorage(storageData);
        baseGameExtracted = false;
      }

      // If the game is downloaded but not extracted, extract now
      if (storageData.GAME_UPDATER.baseGame.downloaded && !storageData.GAME_UPDATER.baseGame.extracted) {
        logBoth('[debug] Extraction block entered: downloaded=true, extracted=false');
        try {
          const { extractZip } = require('../core/fs');
          const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
          const baseGameZipPath = path.join(dlRoot, baseGameZipName);
          logBoth(`[debug] Checking for zip at: ${baseGameZipPath}`);
          if (fs.existsSync(baseGameZipPath)) {
            logBoth('[startup] Game zip is downloaded but not extracted. Extracting now...');
            await extractZip(baseGameZipPath, gameRoot);
            logBoth('[debug] Extraction finished, updating storage.');
            storageData.GAME_UPDATER.baseGame.extracted = true;
            await writeStorage(storageData);
            logBoth('[startup] Extraction complete. Updated baseGame.extracted to true.');
          } else {
            logBoth('[startup] Expected base game zip not found at', baseGameZipPath);
          }
        } catch (extractErr) {
          logBoth.error('[startup] Error during auto-extraction:', extractErr);
        }
      }

      // Robust state detection if currentVersion is 0
      if (Number(storageData.GAME_UPDATER.currentVersion) === 0) {
        // Check for base game zip in downloads
        if (fs.existsSync(baseGameZipPath)) {
          baseGameDownloaded = true;
          logBoth(`[startup] Found base game zip: ${baseGameZipPath}`);
        } else {
          baseGameDownloaded = false;
          logBoth('[startup] Base game zip not found in downloads. Download required.');
        }
        // Check if installPath (Game folder) is empty
        let extracted = false;
        if (baseGameDownloaded) {
          try {
            const files = fs.readdirSync(gameRoot);
            if (files.length === 0) {
              extracted = false;
              logBoth('[startup] Game folder is empty. Extraction required.');
              // Extract the zip into installPath
              const { extractZip } = require('../core/fs');
              await extractZip(baseGameZipPath, gameRoot);
              logBoth('[startup] Extracted base game zip to installPath.');
              extracted = true;
            } else {
              extracted = true;
              logBoth('[startup] Game folder is not empty. Extraction not required.');
            }
          } catch (extractErr) {
            logBoth.error('[startup] Error during extraction check/extract:', extractErr);
            extracted = false;
          }
        }
        baseGameExtracted = extracted;
        // Set currentVersion to 1.0.0 if both downloaded and extracted are true
        if (baseGameDownloaded && baseGameExtracted) {
          storageData.GAME_UPDATER.currentVersion = '1.0.0';
        }
        storageData.GAME_UPDATER.baseGame.downloaded = baseGameDownloaded;
        storageData.GAME_UPDATER.baseGame.extracted = baseGameExtracted;
        // Always coerce updater fields and latestVersion to "0" if null/undefined
        if (storageData.GAME_UPDATER.updater.downloaded == null) storageData.GAME_UPDATER.updater.downloaded = "0";
        if (storageData.GAME_UPDATER.updater.extracted == null) storageData.GAME_UPDATER.updater.extracted = "0";
        if (storageData.GAME_UPDATER.latestVersion == null) storageData.GAME_UPDATER.latestVersion = "0";
        await writeStorage(storageData);
        logBoth(`[startup] State after detection: downloaded=${baseGameDownloaded}, extracted=${baseGameExtracted}, version=${storageData.GAME_UPDATER.currentVersion}`);
      } else {
        baseGameDownloaded = storageData.GAME_UPDATER.baseGame.downloaded;
        baseGameExtracted = storageData.GAME_UPDATER.baseGame.extracted;
        detectedVersion = storageData.GAME_UPDATER.currentVersion;
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
          logBoth('[startup] Updated storage.json with missing paths.');
        }
      }

      // --- Fetch remote version and patch manifest if base game is extracted ---
      if (baseGameExtracted) {
        try {
          logBoth('[startup] Base game extracted, fetching remote release and patch manifest...');
          const release = await getReleaseJson(RELEASE_JSON_URL);
          const patchManifest = await getPatchManifest(release.patchManifestUrl);
          const remoteVersion = patchManifest.latestVersion;
          // Only update latestVersion, do not overwrite currentVersion
          storageData.GAME_UPDATER.latestVersion = remoteVersion;
          await writeStorage(storageData);
          logBoth(`[startup] Updated storage.json: currentVersion=${storageData.GAME_UPDATER.currentVersion}, latestVersion=${remoteVersion}`);
          if (storageData.GAME_UPDATER.currentVersion !== remoteVersion) {
            logBoth(`[startup] Update available: currentVersion=${storageData.GAME_UPDATER.currentVersion}, latestVersion=${remoteVersion}`);
            // Optionally, trigger patch logic here or notify renderer
          } else {
            logBoth('[startup] Game is up to date.');
          }
        } catch (remoteErr) {
          logBoth.warn('[startup] Failed to fetch remote version or patch manifest:', remoteErr);
        }
      }
    } catch (e) {
      logBoth.error('[startup] Failed to initialize storage.json:', e);
    }
  } catch (err) {
    logBoth.error('[startup] Failed to create default config.json:', err);
  }
});
import { autoUpdater } from 'electron-updater';
import { writeJson, readJson } from '../core/fs';
import { downloadGame } from '../logic/download';
import { applyPatches } from '../logic/patch';

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

// IPC handler to read config.json (settings)

async function readConfigHandler() {
  try {
    const paths = getEventidePaths();
    const configPath = paths.config;
    logBoth('Reading config from:', configPath);
    if (!fs.existsSync(configPath)) {
      logBoth.warn('[config] Config file not found at', configPath);
      return { success: false, error: 'Config file not found' };
    }
    logBoth('[config] Reading config file at', configPath);
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    // Retrieve password from keytar if rememberCredentials is true and username is set
    let password = '';
    if (config.rememberCredentials && config.username) {
      try {
        password = (await keytar.getPassword(SERVICE_NAME, config.username)) || '';
      } catch (e) {
        logBoth.warn('[keytar] Failed to get password:', e);
      }
    }
    return { success: true, data: { ...config, password } };
  } catch (error) {
    logBoth.error('Error reading config file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

ipcMain.handle('read-settings', readConfigHandler);
// Alias: support 'read-config' for compatibility
ipcMain.handle('read-config', async (...args) => {
  try {
    // Forward only the event argument, since readConfigHandler expects none or just event
    return await readConfigHandler();
  } catch (error) {
    logBoth.error('[ipc] Error in read-config handler:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Alias: support 'read-config' for compatibility

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
        logBoth.error('[write-settings] Refusing to write config: data too large');
        return {
          success: false,
          error: 'Config data too large to write.'
        };
      }
      logBoth('[write-settings] Writing config data:', json.slice(0, 500) + (json.length > 500 ? '...truncated' : ''));
      logBoth('[config] Writing config file at', configPath);
      await writeJson(configPath, data);
    } catch (writeErr) {
      logBoth.error('[write-settings] writeJson failed:', writeErr);
      return {
        success: false,
        error: writeErr instanceof Error ? writeErr.stack || writeErr.message : String(writeErr)
      };
    }
    return { success: true };
  } catch (error) {
    logBoth.error('[write-settings] outer error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.stack || error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('launcher:downloadGame', async (_event, fullUrl: string, sha256: string, installDir: string, baseVersion: string) => {
  try {
    const paths = getEventidePaths();
    logBoth(`[download] Starting download: ${fullUrl} to ${paths.gameRoot}`);
    await downloadGame(fullUrl, sha256, paths.gameRoot, paths.dlRoot, baseVersion, (dl, total) => {
      logBoth(`[download] Progress: ${dl} / ${total}`);
      if (mainWindow) {
        logBoth(`[ipc] Sending to renderer: download:progress`, { dl, total });
        mainWindow.webContents.send('download:progress', { dl, total });
      }
    });
    logBoth('[download] Download completed successfully');
    return { success: true };
  } catch (err) {
    logBoth.error(`[download] Download failed: ${String(err)}`);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('launcher:applyPatches', async (_event, patchManifest: any, clientVersion: string, installDir: string) => {
  try {
    await applyPatches(patchManifest, clientVersion, installDir);
    return { success: true };
  } catch (err) {
    logBoth.error('[patch] Error applying patches:', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('launcher:launchGame', async (_event, installDir: string) => {
  try {
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');
    logBoth(`[launch] Attempting to launch game using: ${launchBat}`);
    const result = await launchGameWithBatch(installDir, launchBat);
    if (result.success) {
      logBoth('[launch] Game launched successfully');
    } else {
      logBoth.error(`[launch] Failed to launch game: ${result.error}`);
    }
    return result;
  } catch (err) {
    logBoth.error(`[launch] Exception during game launch: ${err}`);
    return { success: false, error: String(err) };
  }
});

// (Manifest schema validation removed; handled in modular code if needed)






let mainWindow: BrowserWindow | null = null;

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
  });
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  logBoth(msgTemplate(arg));
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

ipcMain.handle('read-ini-file', async () => {
  try {
    const paths = getEventidePaths();
    const iniPath = path.join(paths.gameRoot, 'config', 'boot', 'Eventide.ini');
    logBoth(`[INI] Reading INI from: ${iniPath}`);
    logBoth('[INI] Reading INI file at', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);
    logBoth('[INI] INI file read successfully');
    return { success: true, data: config, error: null };
  } catch (error) {
    logBoth.error(`[INI] Error reading INI file: ${String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('update-ini-auth-and-run', async (_event, username: string, password: string, installDir?: string) => {
    logBoth(`[INI] update-ini-auth-and-run called with username='${username}', password='${password}'`);
  try {
    const paths = getEventidePaths();
    const targetDir = installDir || paths.gameRoot;
    // Ensure all required directories exist before anything else
    ensureDirs();
    const iniPath = path.join(targetDir, 'config', 'boot', 'Eventide.ini');
    if (!fs.existsSync(iniPath)) {
      throw new Error(`INI file not found at: ${iniPath}`);
    }
    logBoth('Updating INI at:', iniPath);
    logBoth('[INI] Reading INI file at', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);

    logBoth('Original config:', config['ashita.boot']);

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
        logBoth(`[INI] Appending --user and --pass to command: --user ${username} --pass ${password}`);
        commandParts.push('--user', username, '--pass', password);
      } else {
        logBoth('[INI] Username or password empty, not appending --user/--pass');
      }
      config.ashita.boot.command = commandParts.join(' ');
      logBoth('[INI] Final INI command:', config.ashita.boot.command);
    }

    // Also attempt to read settings.json and apply mapped settings to the INI
    try {
      const settingsPath = paths.config;
      if (fs.existsSync(settingsPath)) {
        logBoth('Applying settings from:', settingsPath);
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
          logBoth('[INI] Created INI backup at', bakPath);
        } catch (bkErr) {
          logBoth.warn('Failed to create INI backup:', bkErr);
        }
        logBoth('[INI] Writing updated INI file at', iniPath);
        fs.writeFileSync(iniPath, newIni, 'utf-8');
        logBoth('INI file updated successfully');
      } else {
        logBoth('No settings.json found at', settingsPath, '- skipping extra INI mappings');
      }
    } catch (err) {
      logBoth.error('Failed to apply settings.json to INI:', err);
    }

    // Do not launch the game here — only update INI. The renderer or user
    // should call `game:launch` when ready. Return the updated config to the caller.
    return { success: true, data: config, error: null };
  } catch (error) {
    logBoth.error('Error updating INI file:', error);
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
    logBoth(`[config] Writing config to: ${configPath}`);
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        logBoth.warn('[config] Could not parse existing config.json, starting fresh.');
      }
    }
    if (data.rememberCredentials && data.username && data.password) {
      logBoth(`[config] Saving password to keytar for user: ${data.username}`);
      await keytar.setPassword(SERVICE_NAME, data.username, data.password);
    } else if (data.username) {
      logBoth(`[config] Deleting password from keytar for user: ${data.username}`);
      await keytar.deletePassword(SERVICE_NAME, data.username);
    }
    const configData = {
      ...existingConfig,
      username: data.username,
      password: '',
      rememberCredentials: data.rememberCredentials,
      launcherVersion: app.getVersion()
    };
    logBoth('[config] Writing config file at', configPath);
    await writeJson(configPath, configData);
    logBoth('[config] Config file written successfully');
    return { success: true };
  } catch (error) {
    logBoth.error(`[config] Error writing config file: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// ---- Game install / update helpers and IPC handlers ----
const streamPipeline = promisify(pipeline);

// Debug startup marker to help confirm main process is running the current source.
try {
  logBoth('Launcher main boot:', { __dirname, NODE_ENV: process.env.NODE_ENV });
} catch (e) {}

// Centralized launcher helper: prefer the batch wrapper and capture output
async function launchGameWithBatch(installDir: string, launchBat: string) {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      if (!fs.existsSync(launchBat)) {
        return resolve({ success: false, error: `Launch batch not found: ${launchBat}` });
      }

      // Use logsRoot for launcher logs
      const paths = getEventidePaths();
      const logPath = path.join(paths.logsRoot, 'launcher-invoke-output.log');
      // Ensure all required directories exist before anything else
      ensureDirs();
      try { fs.appendFileSync(logPath, `\n--- Launcher invoke at ${new Date().toISOString()} ---\n`); } catch {}

      // Use cmd.exe to run the batch file so behavior is closer to double-click
      const child = spawn('cmd.exe', ['/c', launchBat], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: installDir,
      });

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


ipcMain.handle('game:check', async () => {
  try {
    const PATCH_MANIFEST_URL = 'https://raw.githubusercontent.com/bananapretzel/eventide-patch-manifest/refs/heads/main/patch-manifest.json';
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    // Use storage.json for version/status
    let currentVersion = "0";
    let latestVersion = "0";
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
      logBoth.warn('[game:check] Could not read storage.json:', e);
    }

    // If downloaded but not extracted, extract now
    if (baseDownloaded && !baseExtracted) {
      try {
        const { extractZip } = require('../core/fs');
        const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
        const baseGameZipPath = path.join(paths.dlRoot, baseGameZipName);
        logBoth('[game:check] Game zip is downloaded but not extracted. Extracting now...');
        if (fs.existsSync(baseGameZipPath)) {
          await extractZip(baseGameZipPath, installDir);
          // Update storage
          if (storage && storage.GAME_UPDATER) {
            storage.GAME_UPDATER.baseGame.extracted = true;
            await writeStorage(storage);
            baseExtracted = true;
            logBoth('[game:check] Extraction complete. Updated baseGame.extracted to true.');
          }
        } else {
          logBoth('[game:check] Expected base game zip not found at', baseGameZipPath);
        }
      } catch (extractErr) {
        logBoth.error('[game:check] Error during auto-extraction:', extractErr);
      }
    }
    // Fetch remote patch manifest
    const fetchJson = require('./utils/io').fetchJson;
    const patchManifest = await fetchJson(PATCH_MANIFEST_URL);
    latestVersion = String(patchManifest.latestVersion ?? "0");
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
    logBoth('[game:check] currentVersion:', currentVersion);
    logBoth('[game:check] latestVersion:', latestVersion);
    logBoth('[game:check] patchManifest:', JSON.stringify(patchManifest, null, 2));
    logBoth('[game:check] launcherState:', launcherState);
    // For existence, check for a main executable (e.g., ashita-cli.exe) in gameRoot
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    const exists = fs.existsSync(mainExe);
    return { exists, launcherState, latestVersion, installedVersion: currentVersion, baseDownloaded, baseExtracted };
  } catch (err) {
    logBoth.error('[game:check] error:', err);
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

ipcMain.handle('game:download', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const downloadsDir = paths.dlRoot;
    const release = await getReleaseJson(RELEASE_JSON_URL);
    await downloadGame(release.game.fullUrl, release.game.sha256, installDir, downloadsDir, release.game.baseVersion);
    return { success: true };
  } catch (err) {
    logBoth.error('Download failed:', err);
    if (mainWindow) {
      logBoth(`[ipc] Sending to renderer: game:status`, { status: 'error', message: String(err) });
      mainWindow.webContents.send('game:status', { status: 'error', message: String(err) });
    }
    return { success: false, error: String(err) };
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
      logBoth.error('[import] Install directory not found:', installDir);
      return { success: false, error: `Install directory not found: ${installDir}` };
    }

    // quick check for main executable
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    if (!fs.existsSync(mainExe)) {
      logBoth.error('[import] Main executable not found in install directory:', mainExe);
      return { success: false, error: 'Main executable not found in install directory' };
    }

    // list files and compute per-file sha256 (may take time)
    // TODO: Implement or import listRelativeFiles and sha256File if needed
    // const relFiles = listRelativeFiles(installDir);
    // const fileEntries: Array<{ path: string; sha256: string }> = [];
    // for (const rel of relFiles) {
    //   const abs = path.join(installDir, rel);
    //   try {
    //     const h = await sha256File(abs);
    //     fileEntries.push({ path: rel, sha256: h });
    //   } catch (e) {
    //     logBoth.warn('[import] Failed to hash file during import', abs, e);
    //     fileEntries.push({ path: rel, sha256: '' });
    //   }
    // }
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
      logBoth.warn('[import] Error fetching remote manifest:', e);
      // ignore; manifest info is optional for import
    }

    const versionData: any = {
      version: manifest?.version ?? '',
      sha256: snapshotHash,
      source: manifest?.fullUrl ?? null,
      installedFiles: fileEntries,
    };

    const localVersionPath = path.join(installDir, 'game-version.json');
    logBoth('[import] Writing game-version.json at', localVersionPath);
    await writeJson(localVersionPath, versionData);

    return { success: true, installedFiles: fileEntries.length, snapshot: snapshotHash };
  } catch (err) {
    logBoth.error('[import] Error during import-existing:', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:update', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const projectRoot = path.resolve(__dirname, '../../');
    const release = await getReleaseJson(RELEASE_JSON_URL);
    const patchManifest = await getPatchManifest(release.patchManifestUrl);
    const clientVersion = await getClientVersion(projectRoot);
    await applyPatches(patchManifest, clientVersion || '', installDir);
    return { success: true };
  } catch (err) {
    logBoth.error('Update failed:', err);
    if (mainWindow) {
      logBoth(`[ipc] Sending to renderer: game:status`, { status: 'error', message: String(err) });
      mainWindow.webContents.send('game:status', { status: 'error', message: String(err) });
    }
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:launch', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');

    if (mainWindow) {
      logBoth(`[ipc] Sending to renderer: game:status`, { status: 'launching' });
      mainWindow.webContents.send('game:status', { status: 'launching' });
    }

    // Require the batch wrapper in all cases; do not fall back to directly
    // launching the executable. Return a clear error if the wrapper is missing.
    if (!fs.existsSync(launchBat)) {
      const msg = `Launch batch not found: ${launchBat}`;
      logBoth.error(msg);
      if (mainWindow) {
        logBoth(`[ipc] Sending to renderer: game:status`, { status: 'error', message: msg });
        mainWindow.webContents.send('game:status', { status: 'error', message: msg });
      }
      return { success: false, error: msg };
    }

    logBoth('Launching via batch:', launchBat);
    const launchResult = await launchGameWithBatch(installDir, launchBat);
    if (!launchResult.success) {
      logBoth.error('Failed to launch game:', launchResult.error);
      if (mainWindow) {
        logBoth(`[ipc] Sending to renderer: game:status`, { status: 'error', message: String(launchResult.error) });
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
