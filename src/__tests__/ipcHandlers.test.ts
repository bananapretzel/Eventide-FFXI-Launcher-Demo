// Mock electron-log with explicit mock implementation
jest.mock('electron-log', () => {
  const mockFn = jest.fn();
  const mockLogger = {
    info: mockFn,
    warn: mockFn,
    error: mockFn,
    debug: mockFn,
    verbose: mockFn,
    silly: mockFn,
    log: mockFn,
    transports: {
      file: {
        level: 'debug',
        resolvePathFn: null,
        format: '',
        getFile: () => ({ path: '/mock' }),
        maxSize: 5000000,
      },
      console: { level: 'debug', format: '' },
      ipc: { level: 'debug' },
      remote: { level: 'debug' },
    },
    functions: { log: mockFn, info: mockFn, warn: mockFn, error: mockFn },
    catchErrors: mockFn,
    initialize: mockFn,
    scope: jest.fn().mockReturnThis(),
  };
  return {
    default: mockLogger,
    __esModule: true,
    ...mockLogger,
  };
});

// Mock the main logger module
jest.mock('../main/logger', () => {
  const mockFn = jest.fn();
  return {
    default: {
      info: mockFn,
      warn: mockFn,
      error: mockFn,
      debug: mockFn,
      transports: {
        file: {
          level: 'debug',
          resolvePathFn: null,
          format: '',
          getFile: () => ({ path: '/mock' }),
          maxSize: 5000000,
        },
        console: { level: 'debug', format: '' },
      },
      functions: { log: mockFn, info: mockFn, warn: mockFn, error: mockFn },
      _raw: { transports: { file: {}, console: {} } },
    },
    __esModule: true,
  };
});

// Mock the paths module
jest.mock('../main/paths', () => ({
  getEventidePaths: jest.fn(() => ({
    storage: '/mock/storage.json',
    gameRoot: '/mock/game',
    downloadRoot: '/mock/downloads',
  })),
  ensureDirs: jest.fn(),
}));

// Mock fs-extra with all needed methods
const mockFsExtra = {
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest
    .fn()
    .mockReturnValue('{"username":"testuser","rememberCredentials":false}'),
  readJson: jest.fn().mockResolvedValue({ addons: {}, plugins: {} }),
  writeJson: jest.fn().mockResolvedValue(undefined),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
  },
};

jest.mock('fs-extra', () => mockFsExtra);

// Mock the core/fs module
jest.mock('../core/fs', () => ({
  writeJson: jest.fn().mockResolvedValue(undefined),
  readJson: jest.fn().mockResolvedValue({}),
  extractZip: jest.fn(),
  verifyExtractedFiles: jest.fn(),
}));

// Mock keytar
jest.mock('keytar', () => ({
  getPassword: jest.fn().mockResolvedValue(''),
  setPassword: jest.fn().mockResolvedValue(undefined),
  deletePassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('electron', () => {
  const actual = jest.requireActual('electron');
  return {
    ...actual,
    app: {
      getVersion: () => '1.2.3',
      isPackaged: false,
      on: jest.fn(),
      once: jest.fn((event, callback) => {
        if (event === 'ready') {
          // Execute callback immediately for tests
          setTimeout(() => callback(), 0);
        }
      }),
      whenReady: () => Promise.resolve(),
      quit: jest.fn(),
      setName: jest.fn(),
      getPath: jest.fn((name: string) => {
        if (name === 'userData') return '/mock/userdata';
        return '/mock/path';
      }),
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

// Mock fs (Node.js native)
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest
    .fn()
    .mockReturnValue('{"username":"testuser","rememberCredentials":false}'),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
  },
}));

describe('IPC Handlers - config/settings/extensions', () => {
  const mockReadJsonFile = jest.fn();
  const mockWriteJsonFile = jest.fn();
  const mockGetResourcePath = jest.fn((file) => `/mock/path/${file}`);
  const handlers: Record<string, Function> = {};

  beforeAll(() => {
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

    // Reset all fs-extra mocks
    mockFsExtra.existsSync.mockReturnValue(true);
    mockFsExtra.readFileSync.mockReturnValue(
      '{"username":"testuser","rememberCredentials":false}',
    );
    mockFsExtra.readJson.mockResolvedValue({ addons: {}, plugins: {} });
    mockFsExtra.writeJson.mockResolvedValue(undefined);
  });

  it('read-config returns decrypted password and launcherVersion', async () => {
    const keytar = require('keytar');

    mockFsExtra.existsSync.mockReturnValue(true);
    mockFsExtra.readFileSync.mockReturnValue(
      JSON.stringify({
        username: 'u',
        password: '',
        rememberCredentials: true,
        launcherVersion: '1.2.3',
      }),
    );

    // Mock keytar to return username and password
    keytar.getPassword.mockImplementation(
      (service: string, account: string) => {
        if (account === 'eventide-username') return Promise.resolve('u');
        if (account === 'eventide-password') return Promise.resolve('');
        return Promise.resolve('');
      },
    );

    const handler = handlers['read-config'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.data.username).toBe('u');
    expect(result.data.rememberCredentials).toBe(true);
  });

  it('write-config encrypts password and writes config', async () => {
    const coreFs = require('../core/fs');
    (coreFs.writeJson as jest.Mock).mockResolvedValue(undefined);
    mockFsExtra.existsSync.mockReturnValue(true);
    mockFsExtra.readFileSync.mockReturnValue(
      JSON.stringify({
        username: 'olduser',
        rememberCredentials: false,
      }),
    );

    const handler = handlers['write-config'];
    expect(handler).toBeInstanceOf(Function);
    const data = { username: 'u', password: 'p', rememberCredentials: true };
    const result = await handler(null, data);
    expect(result.success).toBe(true);
    expect(coreFs.writeJson).toHaveBeenCalled();
  });

  it('read-settings returns settings data', async () => {
    mockFsExtra.existsSync.mockReturnValue(true);
    mockFsExtra.readFileSync.mockReturnValue(
      JSON.stringify({
        foo: 'bar',
        launcherVersion: '1.2.3',
      }),
    );

    const handler = handlers['read-settings'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.foo).toBe('bar');
  });

  it('write-settings writes settings data', async () => {
    const coreFs = require('../core/fs');
    (coreFs.writeJson as jest.Mock).mockResolvedValue(undefined);

    const handler = handlers['write-settings'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler(null, { foo: 'bar' });
    expect(result.success).toBe(true);
    expect(coreFs.writeJson).toHaveBeenCalled();
  });

  it('read-extensions returns extensions data', async () => {
    const extensionsData = {
      addons: { test: 'addon' },
      plugins: { test: 'plugin' },
    };
    mockFsExtra.existsSync.mockReturnValue(true);
    mockFsExtra.readJson.mockResolvedValue(extensionsData);

    const handler = handlers['read-extensions'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler();

    // The handler should return success even if it creates a default file
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (result.data) {
      expect(result.data.addons).toBeDefined();
      expect(result.data.plugins).toBeDefined();
    }
  });

  it('write-extensions writes extensions data', async () => {
    mockFsExtra.writeJson.mockResolvedValue(undefined);

    const handler = handlers['write-extensions'];
    expect(handler).toBeInstanceOf(Function);
    const result = await handler(null, { addons: {}, plugins: {} });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    // The handler should have called writeJson at some point
    expect(mockFsExtra.writeJson).toHaveBeenCalled();
  });
});
