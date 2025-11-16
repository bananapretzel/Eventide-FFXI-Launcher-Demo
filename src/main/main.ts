

import log from 'electron-log';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
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
import { autoUpdater } from 'electron-updater';
import { writeJson, readJson } from '../core/fs';
import { downloadGame } from '../logic/download';
import { applyPatches } from '../logic/patch';

// Crypto constants for password encryption (replace with secure values in production)
const IV_LENGTH = 16;
const ENCRYPTION_KEY = crypto.randomBytes(32); // Replace with a securely stored key

// IPC handler to read settings.json
ipcMain.handle('read-settings', async () => {
  try {
    const settingsPath = getResourcePath('settings.json');
    console.log('Reading settings from:', settingsPath);
    if (!fs.existsSync(settingsPath)) {
      return { success: false, error: 'Settings file not found' };
    }
    const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);
    return { success: true, data: settings };
  } catch (error) {
    console.error('Error reading settings file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// IPC handler to write settings.json
ipcMain.handle('write-settings', async (_event, data: any) => {
  try {
    const settingsPath = getResourcePath('settings.json');
    console.log('Writing settings to:', settingsPath);
    await writeJson(settingsPath, data);
    return { success: true };
  } catch (error) {
    console.error('Error writing settings file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('launcher:downloadGame', async (_event, fullUrl: string, sha256: string, installDir: string, baseVersion: string) => {
  try {
    await downloadGame(fullUrl, sha256, installDir, baseVersion);
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


function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedPassword: string): string {
  try {
    const parts = encryptedPassword.split(':');
    if (parts.length !== 2) {
      return '';
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}




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
    // Try to use installDir if available from global or environment (for renderer calls, prefer root fallback)
    let iniPath: string;
    const installDir = process.env.EVENTIDE_INSTALL_DIR;
    if (installDir) {
      iniPath = path.join(installDir, 'config', 'boot', 'Eventide.ini');
    } else {
      iniPath = getResourcePath('Eventide.ini');
    }
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
    if (!installDir) {
      throw new Error('installDir is required and was not provided.');
    }
    const iniPath = path.join(installDir, 'config', 'boot', 'Eventide.ini');
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
      const settingsPath = getResourcePath('settings.json');
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

// ...existing code...
// IPC handler to read config.json
ipcMain.handle('read-config', async () => {
  try {
    const configPath = getResourcePath('config.json');
    console.log('Reading config from:', configPath);
    if (!fs.existsSync(configPath)) {
      return { success: false, error: 'Config file not found' };
    }
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    return { success: true, data: config };
  } catch (error) {
    console.error('Error reading config file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('write-config', async (_event, data: { username: string, password: string, rememberCredentials: boolean }) => {
  try {
    const configPath = getResourcePath('config.json');
    console.log('Writing config to:', configPath);
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Could not parse existing config.json, starting fresh.');
      }
    }
    const encryptedPassword = data.password && data.password.length > 0
      ? encryptPassword(data.password)
      : '';
    const configData = {
      ...existingConfig,
      username: data.username,
      password: encryptedPassword,
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

      const logPath = path.join(installDir, 'launcher-invoke-output.log');
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
    const exePath = getExePath();
    const installDir = path.dirname(exePath);
    const exists = fs.existsSync(exePath);
    // Read local version from game-version.json (try installDir, then project root)
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
    // Fallback: check project root if not found
    if (!localVersion) {
      const projectRootPath = path.join(__dirname, '../../game-version.json');
      if (fs.existsSync(projectRootPath)) {
        try {
          const localData = fs.readJsonSync(projectRootPath);
          localVersion = localData.version || '';
        } catch (e) {
          console.warn('[game:check] Failed to read local game-version.json in project root:', e);
        }
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
    const exePath = getExePath();
    const installDir = path.dirname(exePath);
    const release = await getReleaseJson(RELEASE_JSON_URL);
    await downloadGame(release.game.fullUrl, release.game.sha256, installDir, release.game.baseVersion);
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
    const exePath = getExePath();
    const installDir = app.isPackaged ? path.dirname(exePath) : path.join(__dirname, '../../');

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
    // safeWriteJson(localVersionPath, versionData);
    await writeJson(localVersionPath, versionData);

    return { success: true, installedFiles: fileEntries.length, snapshot: snapshotHash };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('game:update', async () => {
  try {
    const exePath = getExePath();
    const installDir = path.dirname(exePath);
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
    const exePath = getExePath();
    const installDir = app.isPackaged ? path.dirname(exePath) : getGameInstallDir();
    const launchBat = path.join(installDir, 'Launch_Eventide.bat');

    mainWindow?.webContents.send('game:status', { status: 'launching' });

    console.log('exePath =', exePath);
console.log('installDir =', installDir);
console.log('launchBat =', launchBat);
console.log('launchBat exists?', fs.existsSync(launchBat));

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
