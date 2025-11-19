
import log from 'electron-log';
import chalk from 'chalk';
import { getEventidePaths, ensureDirs } from './paths';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import keytar from 'keytar';
import { spawn } from 'child_process';
import ini from 'ini';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { resolveHtmlPath } from './util';
import { RELEASE_JSON_URL } from './config';
import { getClientVersion } from '../core/versions';
import { getReleaseJson, getPatchManifest } from '../core/manifest';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { readStorage, writeStorage, hasRequiredGameFiles, getDefaultStorage, validateStorageJson } from '../core/storage';
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
// Consolidated extraction logic for base game zip
async function extractBaseGameIfNeeded(storageData: any, dlRoot: string, gameRoot: string) {
  try {
    const { extractZip } = require('../core/fs');
    const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
    const baseGameZipPath = path.join(dlRoot, baseGameZipName);
    if (fs.existsSync(baseGameZipPath)) {
      log.info(chalk.cyan('[startup] Game zip is downloaded but not extracted. Extracting now...'));
      const g: any = global;
      if (g.mainWindow && g.mainWindow.webContents) {
        g.mainWindow.webContents.send('extract:start');
      }
      await extractZip(baseGameZipPath, gameRoot);
      storageData.GAME_UPDATER.baseGame.extracted = true;
      await writeStorage(storageData);
      log.info(chalk.cyan('[startup] Extraction complete. Updated baseGame.extracted to true.'));
      if (g.mainWindow && g.mainWindow.webContents) {
        g.mainWindow.webContents.send('extract:done');
      }
    } else {
      log.info(chalk.cyan('[startup] Expected base game zip not found at'), baseGameZipPath);
    }
  } catch (extractErr) {
    log.error(chalk.red('[startup] Error during auto-extraction:'), extractErr);
    const g: any = global;
    if (g.mainWindow && g.mainWindow.webContents) {
      g.mainWindow.webContents.send('extract:done');
    }
  }
}


app.once('ready', async () => {
  try {
    ensureDirs(); // Centralized directory creation
    const paths = getEventidePaths();
    const { gameRoot, dlRoot } = paths;
    // Read storage.json with validation and log resets
    let storageData = await readStorage((msg) => log.warn(chalk.yellow(msg)));
    if (!storageData) {
      storageData = getDefaultStorage();
      await writeStorage(storageData);
      log.warn(chalk.yellow('[startup] storage.json was missing or invalid, created default.'));
    }

    // If the game is downloaded but not extracted, extract now (consolidated logic)
    if (storageData.GAME_UPDATER.baseGame.downloaded && !storageData.GAME_UPDATER.baseGame.extracted) {
      await extractBaseGameIfNeeded(storageData, dlRoot, gameRoot);
    }
    const version = app.getVersion ? app.getVersion() : 'unknown';
    const env = process.env.NODE_ENV || 'production';
    log.info(chalk.cyan(`[startup] Launcher version: ${version}, environment: ${env}`));
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
      log.info(chalk.cyan('[startup] First run detected. Created default config.json at'), configPath);
    }

    // Always check for required files in Game folder and update baseGame.extracted accordingly
    try {
      const actuallyExtracted = hasRequiredGameFiles(gameRoot);
      if (storageData.GAME_UPDATER.baseGame.extracted !== actuallyExtracted) {
        storageData.GAME_UPDATER.baseGame.extracted = actuallyExtracted;
        await writeStorage(storageData);
        log.info(chalk.cyan(`[startup] Synced baseGame.extracted to ${actuallyExtracted} based on required files in Game folder.`));
      }
    } catch (e) {
      log.error(chalk.red('[startup] Error checking Game folder for extraction state:'), e);
      storageData.GAME_UPDATER.baseGame.extracted = false;
      await writeStorage(storageData);
    }

    // If the game is downloaded but not extracted, extract now
    if (storageData.GAME_UPDATER.baseGame.downloaded && !storageData.GAME_UPDATER.baseGame.extracted) {
      log.info(chalk.cyan('[debug] Extraction block entered: downloaded=true, extracted=false'));
      await extractBaseGameIfNeeded(storageData, dlRoot, gameRoot);
    }

    // Robust state detection if currentVersion is 0 (treat '0', '0.0.0', etc. as zero)
    const baseGameZipName = 'Eventide-test.zip'; // TODO: make dynamic if needed
    const baseGameZipPath = path.join(dlRoot, baseGameZipName);
    let baseGameDownloaded = false;
    let baseGameExtracted = false;
    if (isZeroVersion(storageData.GAME_UPDATER.currentVersion)) {
      // Check for base game zip in downloads
      if (fs.existsSync(baseGameZipPath)) {
        baseGameDownloaded = true;
        log.info(chalk.cyan(`[startup] Found base game zip: ${baseGameZipPath}`));
      } else {
        baseGameDownloaded = false;
        log.info(chalk.cyan('[startup] Base game zip not found in downloads. Download required.'));
      }
      // Check for required files in installPath (Game folder)
      let extracted = false;
      if (baseGameDownloaded) {
        try {
          if (hasRequiredGameFiles(gameRoot)) {
            extracted = true;
            log.info(chalk.cyan('[startup] Required files found in Game folder. Extraction not required.'));
          } else {
            extracted = false;
            log.info(chalk.cyan('[startup] Required files missing. Extraction required.'));
            // Extract the zip into installPath
            const { extractZip } = require('../core/fs');
            await extractZip(baseGameZipPath, gameRoot);
            log.info(chalk.cyan('[startup] Extracted base game zip to installPath.'));
            extracted = hasRequiredGameFiles(gameRoot);
          }
        } catch (extractErr) {
          log.error(chalk.red('[startup] Error during extraction check/extract:'), extractErr);
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
      log.info(chalk.cyan(`[startup] State after detection: downloaded=${baseGameDownloaded}, extracted=${baseGameExtracted}, version=${storageData.GAME_UPDATER.currentVersion}`));
    } else {
      baseGameDownloaded = storageData.GAME_UPDATER.baseGame.downloaded;
      baseGameExtracted = storageData.GAME_UPDATER.baseGame.extracted;
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
        log.info(chalk.cyan('[startup] Updated storage.json with missing paths.'));
      }
    }

    // --- Fetch remote version and patch manifest if base game is extracted ---
    if (baseGameExtracted) {
      try {
        log.info(chalk.cyan('[startup] Base game extracted, fetching remote release and patch manifest...'));
        const release = await getReleaseJson(RELEASE_JSON_URL);
        const patchManifest = await getPatchManifest(release.patchManifestUrl);
        const remoteVersion = patchManifest.latestVersion;
        // Only update latestVersion, do not overwrite currentVersion
        storageData.GAME_UPDATER.latestVersion = remoteVersion;
        await writeStorage(storageData);
        log.info(chalk.cyan(`[startup] Updated storage.json: currentVersion=${storageData.GAME_UPDATER.currentVersion}, latestVersion=${remoteVersion}`));
        if (storageData.GAME_UPDATER.currentVersion !== remoteVersion) {
          log.info(chalk.cyan(`[startup] Update available: currentVersion=${storageData.GAME_UPDATER.currentVersion}, latestVersion=${remoteVersion}`));
          // Optionally, trigger patch logic here or notify renderer
        } else {
          log.info(chalk.cyan('[startup] Game is up to date.'));
        }
      } catch (remoteErr) {
        log.warn(chalk.yellow('[startup] Failed to fetch remote version or patch manifest:'), remoteErr);
      }
    }
  } catch (err) {
    log.error(chalk.red('[startup] Failed to create default config.json:'), err);
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
    log.info(chalk.cyan('Reading config from:'), configPath);
    if (!fs.existsSync(configPath)) {
      log.warn(chalk.yellow('[config] Config file not found at'), configPath);
      return { success: false, error: 'Config file not found' };
    }
    log.info(chalk.cyan('[config] Reading config file at'), configPath);
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    // Retrieve password from keytar if rememberCredentials is true and username is set
    let password = '';
    if (config.rememberCredentials && config.username) {
      try {
        log.info(chalk.cyan(`[keytar] Attempting to get password for user: ${config.username}`));
        password = (await keytar.getPassword(SERVICE_NAME, config.username)) || '';
        log.info(chalk.cyan(`[keytar] Got password for user: ${config.username}?`), !!password);
      } catch (e) {
        log.warn(chalk.yellow('[keytar] Failed to get password:'), e);
      }
    }
    return { success: true, data: { ...config, password } };
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

ipcMain.handle('launcher:downloadGame', async (_event, fullUrl: string, sha256: string, installDir: string, baseVersion: string) => {
  try {
    const paths = getEventidePaths();
    log.info(chalk.cyan(`[download] Starting download: ${fullUrl} to ${paths.gameRoot}`));
    await downloadGame(fullUrl, sha256, paths.gameRoot, paths.dlRoot, baseVersion, (dl, total) => {
      log.info(chalk.cyan(`[download] Progress: ${dl} / ${total}`));
      if (mainWindow) {
        log.info(chalk.cyan(`[ipc] Sending to renderer: download:progress`), { dl, total });
        mainWindow.webContents.send('download:progress', { dl, total });
      }
    });
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

ipcMain.handle('launcher:applyPatches', async (_event, patchManifest: any, clientVersion: string, installDir: string) => {
  try {
    await applyPatches(patchManifest, clientVersion, installDir);
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
    log.info(chalk.cyan(`[INI] update-ini-auth-and-run called with username='${username}', password='${password}'`));
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
        log.info(chalk.cyan(`[INI] Appending --user and --pass to command: --user ${username} --pass ${password}`));
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
    // Remove password if present in the old config
    if (existingConfig && typeof existingConfig === 'object' && 'password' in existingConfig) {
      delete existingConfig.password;
    }
    // Only store non-sensitive fields and preserve other settings (except password)
    const configData = {
      ...existingConfig,
      username: data.username || '',
      rememberCredentials: data.rememberCredentials,
      launcherVersion: app.getVersion()
    };
    // Handle password in keytar only
    if (data.rememberCredentials && data.username && data.password) {
      log.info(chalk.cyan(`[keytar] Saving password to keytar for user: ${data.username}`));
      await keytar.setPassword(SERVICE_NAME, data.username, data.password);
      log.info(chalk.cyan(`[keytar] Password saved for user: ${data.username}`));
    } else if (data.username) {
      log.info(chalk.cyan(`[keytar] Deleting password from keytar for user: ${data.username}`));
      await keytar.deletePassword(SERVICE_NAME, data.username);
      log.info(chalk.cyan(`[keytar] Password deleted for user: ${data.username}`));
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

// ---- Game install / update helpers and IPC handlers ----
const streamPipeline = promisify(pipeline);

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
      log.warn(chalk.yellow('[game:check] Could not read storage.json:'), e);
    }

    // If downloaded but not extracted, extract now
    if (baseDownloaded && !baseExtracted) {
      await extractBaseGameIfNeeded(storage, paths.dlRoot, installDir);
      // Update local state after extraction
      if (storage && storage.GAME_UPDATER) {
        baseExtracted = !!storage.GAME_UPDATER.baseGame.extracted;
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

ipcMain.handle('game:download', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const downloadsDir = paths.dlRoot;
    const release = await getReleaseJson(RELEASE_JSON_URL);
    await downloadGame(release.game.fullUrl, release.game.sha256, installDir, downloadsDir, release.game.baseVersion);
    return { success: true };
  } catch (err) {
    log.error(chalk.red('Download failed:'), err);
    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: String(err) });
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
    const release = await getReleaseJson(RELEASE_JSON_URL);
    const patchManifest = await getPatchManifest(release.patchManifestUrl);
    const clientVersion = await getClientVersion(projectRoot);
    await applyPatches(patchManifest, clientVersion || '', installDir);
    return { success: true };
  } catch (err) {
    log.error(chalk.red('Update failed:'), err);
    if (mainWindow) {
      log.info(chalk.cyan(`[ipc] Sending to renderer: game:status`), { status: 'error', message: String(err) });
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
