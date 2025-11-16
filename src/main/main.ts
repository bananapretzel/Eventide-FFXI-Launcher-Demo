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
// Set the app name to 'Eventide Launcherv2' so userData points to %APPDATA%\Eventide Launcherv2
app.setName('Eventide Launcherv2');

// --- Ensure config.json exists with defaults on startup ---
// ...existing code...
app.once('ready', async () => {
  try {
    const paths = getEventidePaths();
    const configPath = paths.config;
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        username: '',
        password: '',
        rememberCredentials: false,
        launcherVersion: '0.1.0',
        installDir: ''
      };
      await writeJson(configPath, defaultConfig);
      console.log('[startup] Created default config.json at', configPath);
    }
  } catch (err) {
    console.error('[startup] Failed to create default config.json:', err);
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
    console.log('Reading config from:', configPath);
    if (!fs.existsSync(configPath)) {
      return { success: false, error: 'Config file not found' };
    }
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    // Retrieve password from keytar if rememberCredentials is true and username is set
    let password = '';
    if (config.rememberCredentials && config.username) {
      try {
        password = (await keytar.getPassword(SERVICE_NAME, config.username)) || '';
      } catch (e) {
        console.warn('[keytar] Failed to get password:', e);
      }
    }
    return { success: true, data: { ...config, password } };
  } catch (error) {
    console.error('Error reading config file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

ipcMain.handle('read-settings', readConfigHandler);
// Alias: support 'read-config' for compatibility
ipcMain.handle('read-config', readConfigHandler);

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
        console.error('[write-settings] Refusing to write config: data too large');
        return {
          success: false,
          error: 'Config data too large to write.'
        };
      }
      console.log('[write-settings] Writing config data:', json.slice(0, 500) + (json.length > 500 ? '...truncated' : ''));
      await writeJson(configPath, data);
    } catch (writeErr) {
      console.error('[write-settings] writeJson failed:', writeErr);
      return {
        success: false,
        error: writeErr instanceof Error ? writeErr.stack || writeErr.message : String(writeErr)
      };
    }
    return { success: true };
  } catch (error) {
    console.error('[write-settings] outer error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.stack || error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('launcher:downloadGame', async (_event, fullUrl: string, sha256: string, installDir: string, baseVersion: string) => {
  try {
    const paths = getEventidePaths();
    await downloadGame(fullUrl, sha256, paths.gameRoot, paths.dlRoot, baseVersion, (dl, total) => {
      console.log('[main] download:progress', dl, total);
      if (mainWindow) {
        mainWindow.webContents.send('download:progress', { dl, total });
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('launcher:applyPatches', async (_event, patchManifest: any, clientVersion: string, installDir: string) => {
  try {
    await applyPatches(patchManifest, clientVersion, installDir);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('launcher:launchGame', async (_event, installDir: string) => {
  try {
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');
    const result = await launchGameWithBatch(installDir, launchBat);
    return result;
  } catch (err) {
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
  console.log(msgTemplate(arg));
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
    // Always use canonical gameRoot for INI file
    const paths = getEventidePaths();
    const iniPath = path.join(paths.gameRoot, 'config', 'boot', 'Eventide.ini');
    console.log('Reading INI from:', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);
    return { success: true, data: config, error: null };
  } catch (error) {
    console.error('Error reading INI file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('update-ini-auth-and-run', async (_event, username: string, password: string, installDir?: string) => {
  try {
    const paths = getEventidePaths();
    const targetDir = installDir || paths.gameRoot;
    // Ensure all required directories exist before anything else
    ensureDirs();
    const iniPath = path.join(targetDir, 'config', 'boot', 'Eventide.ini');
    if (!fs.existsSync(iniPath)) {
      throw new Error(`INI file not found at: ${iniPath}`);
    }
    console.log('Updating INI at:', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);

    console.log('Original config:', config['ashita.boot']);

    // Update or add --user and --pass in the command (ALWAYS PLAINTEXT PASSWORD)
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
      // Always append new --user and --pass (PLAINTEXT password)
      commandParts.push('--user', username, '--pass', password);
      config.ashita.boot.command = commandParts.join(' ');
      console.log('Updated command (plaintext password):', config.ashita.boot.command);
    }

    // Also attempt to read settings.json and apply mapped settings to the INI
    try {
      const settingsPath = paths.config;
      if (fs.existsSync(settingsPath)) {
        console.log('Applying settings from:', settingsPath);
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
          console.log('Created INI backup at', bakPath);
        } catch (bkErr) {
          console.warn('Failed to create INI backup:', bkErr);
        }
        fs.writeFileSync(iniPath, newIni, 'utf-8');
        console.log('INI file updated successfully');
      } else {
        console.log('No settings.json found at', settingsPath, '- skipping extra INI mappings');
      }
    } catch (err) {
      console.error('Failed to apply settings.json to INI:', err);
    }

    // Do not launch the game here — only update INI. The renderer or user
    // should call `game:launch` when ready. Return the updated config to the caller.
    return { success: true, data: config, error: null };
  } catch (error) {
    console.error('Error updating INI file:', error);
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
    console.log('Writing config to:', configPath);
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Could not parse existing config.json, starting fresh.');
      }
    }
    // Save password to keytar if rememberCredentials is true, otherwise delete
    if (data.rememberCredentials && data.username && data.password) {
      await keytar.setPassword(SERVICE_NAME, data.username, data.password);
    } else if (data.username) {
      await keytar.deletePassword(SERVICE_NAME, data.username);
    }
    // Do not store password in config file
    const configData = {
      ...existingConfig,
      username: data.username,
      password: '',
      rememberCredentials: data.rememberCredentials,
      launcherVersion: app.getVersion()
    };
    await writeJson(configPath, configData);
    return { success: true };
  } catch (error) {
    console.error('Error writing config file:', error);
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
  console.log('Launcher main boot:', { __dirname, NODE_ENV: process.env.NODE_ENV });
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
    // Read local version from game-version.json
    let localVersion = '';
    let localVersionPath = path.join(installDir, 'game-version.json');
    if (fs.existsSync(localVersionPath)) {
      try {
        const localData = fs.readJsonSync(localVersionPath);
        localVersion = localData.version || '';
      } catch (e) {
        console.warn('[game:check] Failed to read local game-version.json in installDir:', e);
      }
    }
    // Fetch remote patch manifest
    const fetchJson = require('./utils/io').fetchJson;
    const patchManifest = await fetchJson(PATCH_MANIFEST_URL);
    const remoteVersion = patchManifest.latestVersion;
    // Compare versions (simple string compare, can be improved)
    const updateAvailable = localVersion !== remoteVersion;
    console.log('[game:check] localVersion:', localVersion);
    console.log('[game:check] remoteVersion:', remoteVersion);
    console.log('[game:check] patchManifest:', JSON.stringify(patchManifest, null, 2));
    console.log('[game:check] updateAvailable:', updateAvailable);
    // For existence, check for a main executable (e.g., ashita-cli.exe) in gameRoot
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    const exists = fs.existsSync(mainExe);
    return { exists, updateAvailable, remoteVersion, installedVersion: localVersion };
  } catch (err) {
    console.error('[game:check] error:', err);
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
    console.error('Download failed:', err);
    mainWindow?.webContents.send('game:status', { status: 'error', message: String(err) });
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
      return { success: false, error: `Install directory not found: ${installDir}` };
    }

    // quick check for main executable
    const mainExe = path.join(installDir, 'ashita-cli.exe');
    if (!fs.existsSync(mainExe)) {
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
    //     try { console.warn('Failed to hash file during import', abs, e); } catch {}
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
      // ignore; manifest info is optional for import
    }

    const versionData: any = {
      version: manifest?.version ?? '',
      sha256: snapshotHash,
      source: manifest?.fullUrl ?? null,
      installedFiles: fileEntries,
    };

    const localVersionPath = path.join(installDir, 'game-version.json');
    await writeJson(localVersionPath, versionData);

    return { success: true, installedFiles: fileEntries.length, snapshot: snapshotHash };
  } catch (err) {
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
    console.error('Update failed:', err);
    mainWindow?.webContents.send('game:status', { status: 'error', message: String(err) });
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:launch', async () => {
  try {
    const paths = getEventidePaths();
    const installDir = paths.gameRoot;
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');

    mainWindow?.webContents.send('game:status', { status: 'launching' });

    // Require the batch wrapper in all cases; do not fall back to directly
    // launching the executable. Return a clear error if the wrapper is missing.
    if (!fs.existsSync(launchBat)) {
      const msg = `Launch batch not found: ${launchBat}`;
      console.error(msg);
      mainWindow?.webContents.send('game:status', { status: 'error', message: msg });
      return { success: false, error: msg };
    }

    console.log('Launching via batch:', launchBat);
    const launchResult = await launchGameWithBatch(installDir, launchBat);
    if (!launchResult.success) {
      console.error('Failed to launch game:', launchResult.error);
      mainWindow?.webContents.send('game:status', { status: 'error', message: String(launchResult.error) });
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
