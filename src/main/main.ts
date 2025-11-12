/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import fs from 'fs';
import ini from 'ini';
import { spawn } from 'child_process';
import crypto from 'crypto';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

// Encryption configuration
const ENCRYPTION_KEY = crypto.scryptSync('eventide-launcher-key', 'salt', 32);
const IV_LENGTH = 16;

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
      return ''; // Return empty string if format is invalid
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error decrypting password:', error);
    return ''; // Return empty string if decryption fails
  }
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

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
    // Use the project root directory instead of app path
    const iniPath = app.isPackaged
      ? path.join(process.resourcesPath, 'Eventide.ini')
      : path.join(__dirname, '../../Eventide.ini');

    console.log('Reading INI from:', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);
    return { success: true, data: config };
  } catch (error) {
    console.error('Error reading INI file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('update-ini-auth-and-run', async (_event, username: string, password: string) => {
  try {
    // Use the project root directory instead of app path
    const iniPath = app.isPackaged
      ? path.join(process.resourcesPath, 'Eventide.ini')
      : path.join(__dirname, '../../Eventide.ini');

    console.log('Updating INI at:', iniPath);
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    const config = ini.parse(iniContent);

    console.log('Original config:', config['ashita.boot']);

    // Update the username and password in the command
    if (config?.ashita?.boot?.command) {
      // Parse the existing command
      const commandParts = config.ashita.boot.command.split(' ');

      // Find and update --user and --pass values
      for (let i = 0; i < commandParts.length; i++) {
        if (commandParts[i] === '--user' && i + 1 < commandParts.length) {
          commandParts[i + 1] = username;
        } else if (commandParts[i] === '--pass' && i + 1 < commandParts.length) {
          commandParts[i + 1] = password;
        }
      }

      config.ashita.boot.command = commandParts.join(' ');
      console.log('Updated command:', config.ashita.boot.command);
    }

    // Also attempt to read settings.json and apply mapped settings to the INI
    try {
      const settingsPath = app.isPackaged
        ? path.join(process.resourcesPath, 'settings.json')
        : path.join(__dirname, '../../settings.json');

      if (fs.existsSync(settingsPath)) {
        console.log('Applying settings from:', settingsPath);
        const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsContent) as Record<string, any>;

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

        // After applying all mappings, compare to original to avoid unnecessary writes
        const newIni = ini.stringify(config);
        if (newIni === originalIni) {
          console.log('No INI changes detected; skipping write');
        } else {
          // backup existing INI before writing
          try {
            const bakPath = `${iniPath}.bak`;
            fs.copyFileSync(iniPath, bakPath);
            console.log('Created INI backup at', bakPath);
          } catch (bkErr) {
            console.warn('Failed to create INI backup:', bkErr);
          }

          fs.writeFileSync(iniPath, newIni, 'utf-8');
          console.log('INI file updated successfully');
        }
      } else {
        console.log('No settings.json found at', settingsPath, '- skipping extra INI mappings');
      }
    } catch (err) {
      console.error('Failed to apply settings.json to INI:', err);
    }

    // Execute ashita-cli.exe with eventide.ini as argument
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath, 'ashita-cli.exe')
      : path.join(__dirname, '../../ashita-cli.exe');

    console.log('Executing:', exePath, iniPath);

    // Check if the executable exists
    if (!fs.existsSync(exePath)) {
      console.error('Executable not found:', exePath);
      return {
        success: false,
        error: `Executable not found: ${exePath}`
      };
    }

    const child = spawn(exePath, [iniPath], {
      detached: true,
      stdio: 'ignore',
      shell: true,
      cwd: path.dirname(exePath)
    });

    child.on('error', (err) => {
      console.error('Failed to start subprocess:', err);
    });

    // Allow the child process to run independently
    child.unref();

    console.log('ashita-cli.exe launched successfully');

    return { success: true, data: config };
  } catch (error) {
    console.error('Error updating INI file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('read-extensions', async () => {
  try {
    const extensionsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'extensions.json')
      : path.join(__dirname, '../../extensions.json');

    console.log('Reading extensions from:', extensionsPath);

    if (!fs.existsSync(extensionsPath)) {
      // Return default state if file doesn't exist
      return { success: true, data: { addons: {}, plugins: {} } };
    }

    const extensionsContent = fs.readFileSync(extensionsPath, 'utf-8');
    const data = JSON.parse(extensionsContent);
    return { success: true, data };
  } catch (error) {
    console.error('Error reading extensions file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('write-extensions', async (_event, data: { addons: Record<string, boolean>, plugins: Record<string, boolean> }) => {
  try {
    const extensionsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'extensions.json')
      : path.join(__dirname, '../../extensions.json');

    console.log('Writing extensions to:', extensionsPath);

    const extensionsContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(extensionsPath, extensionsContent, 'utf-8');

    return { success: true };
  } catch (error) {
    console.error('Error writing extensions file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('read-settings', async () => {
  try {
    const settingsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'settings.json')
      : path.join(__dirname, '../../settings.json');

    console.log('Reading settings from:', settingsPath);

    if (!fs.existsSync(settingsPath)) {
      // Return default state if file doesn't exist
      return { success: true, data: {} };
    }

    const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(settingsContent);
    return { success: true, data };
  } catch (error) {
    console.error('Error reading settings file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('write-settings', async (_event, data: Record<string, any>) => {
  try {
    const settingsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'settings.json')
      : path.join(__dirname, '../../settings.json');

    console.log('Writing settings to:', settingsPath);

    const settingsContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(settingsPath, settingsContent, 'utf-8');

    return { success: true };
  } catch (error) {
    console.error('Error writing settings file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('read-config', async () => {
  try {
    const configPath = app.isPackaged
      ? path.join(process.resourcesPath, 'config.json')
      : path.join(__dirname, '../../config.json');

    console.log('Reading config from:', configPath);

    if (!fs.existsSync(configPath)) {
      // Return default config if file doesn't exist
      const defaultConfig = {
        username: '',
        password: '',
        rememberCredentials: true,
        launcherVersion: app.getVersion()
      };
      return { success: true, data: defaultConfig };
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(configContent);

    // Decrypt password if it exists and is not empty
    if (data.password && data.password.length > 0) {
      data.password = decryptPassword(data.password);
    }

    // Ensure launcherVersion is always up to date
    data.launcherVersion = app.getVersion();

    return { success: true, data };
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
    const configPath = app.isPackaged
      ? path.join(process.resourcesPath, 'config.json')
      : path.join(__dirname, '../../config.json');

    console.log('Writing config to:', configPath);

    // Encrypt password if it exists and is not empty
    const encryptedPassword = data.password && data.password.length > 0
      ? encryptPassword(data.password)
      : '';

    const configData = {
      username: data.username,
      password: encryptedPassword,
      rememberCredentials: data.rememberCredentials,
      launcherVersion: app.getVersion()
    };

    const configContent = JSON.stringify(configData, null, 2);
    fs.writeFileSync(configPath, configContent, 'utf-8');

    return { success: true };
  } catch (error) {
    console.error('Error writing config file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
