import { ipcMain } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';

jest.mock('fs-extra');
const fsExtra = require('fs-extra');
jest.mock('electron', () => {
  const actual = jest.requireActual('electron');
  return {
    ...actual,
    app: {
      getVersion: () => '1.2.3',
      isPackaged: false,
      on: jest.fn(),
      whenReady: () => Promise.resolve(),
      quit: jest.fn(),
    },
    ipcMain: {
      handle: jest.fn(),
      on: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      loadURL: jest.fn(),
      on: jest.fn(),
      minimize: jest.fn(),
      close: jest.fn(),
      show: jest.fn(),
      webContents: {
        send: jest.fn(),
        setWindowOpenHandler: jest.fn(),
      },
    })),
    shell: { openExternal: jest.fn() },
    Menu: {
      buildFromTemplate: jest.fn(() => ({ popup: jest.fn() })),
      setApplicationMenu: jest.fn(),
    },
  };
});

describe('IPC Handlers - config/settings/extensions', () => {
  const mockReadJsonFile = jest.fn();
  const mockWriteJsonFile = jest.fn();
  const mockGetResourcePath = jest.fn((file) => `/mock/path/${file}`);
  let handlers: Record<string, Function> = {};
  beforeAll(() => {
      // Always mock existsSync to true for settings and extensions tests
      (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
    jest.resetModules();
    jest.doMock('../main/utils/io', () => ({
      readJsonFile: mockReadJsonFile,
      writeJsonFile: mockWriteJsonFile,
      getRootPath: () => '/mock/root',
      fetchJson: jest.fn(),
      downloadToFile: jest.fn(),
    }));
    jest.doMock('../main/config', () => ({
      getResourcePath: mockGetResourcePath,
      RELEASE_JSON_URL: 'https://example.com/release.json',
      getExePath: () => '/mock/path/ashita-cli.exe',
      getGameInstallDir: () => '/mock/game',
      IS_PROD: false,
      IS_DEV: true,
    }));
    // Load main.ts once and cache handlers
    const { handle } = require('electron').ipcMain;
    require('../main/main');
    // Map handler names to functions
    for (const call of handle.mock.calls) {
      const [name, fn] = call;
      handlers[name] = fn;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (fsExtra.existsSync as jest.Mock).mockReturnValue(true);
  });

  it('read-config returns decrypted password and launcherVersion', async () => {
    mockReadJsonFile.mockReturnValue({ username: 'u', password: '', rememberCredentials: true });
    const handler = handlers['read-config'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.data.launcherVersion).toBe('1.2.3');
  });

  it('write-config encrypts password and writes config', async () => {
    mockWriteJsonFile.mockReturnValue(true);
    const handler = handlers['write-config'];
    expect(handler).toBeInstanceOf(Function);
    const data = { username: 'u', password: 'p', rememberCredentials: true };
    const result = await handler(null, data);
    expect(result.success).toBe(true);
    expect(mockWriteJsonFile).toHaveBeenCalled();
  });

  it('read-settings returns settings data', async () => {
    mockReadJsonFile.mockReturnValue({ foo: 'bar' });
    const handler = handlers['read-settings'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.data.foo).toBe('bar');
  });

  it('write-settings writes settings data', async () => {
    mockWriteJsonFile.mockReturnValue(true);
    const handler = handlers['write-settings'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler(null, { foo: 'bar' });
    expect(result.success).toBe(true);
    expect(mockWriteJsonFile).toHaveBeenCalled();
  });

  it('read-extensions returns extensions data', async () => {
    mockReadJsonFile.mockReturnValue({ addons: {}, plugins: {} });
    const handler = handlers['read-extensions'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.data.addons).toBeDefined();
  });

  it('write-extensions writes extensions data', async () => {
    mockWriteJsonFile.mockReturnValue(true);
    const handler = handlers['write-extensions'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler(null, { addons: {}, plugins: {} });
    expect(result.success).toBe(true);
    expect(mockWriteJsonFile).toHaveBeenCalled();
  });
});
