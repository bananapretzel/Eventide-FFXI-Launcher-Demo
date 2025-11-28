// Storage module tests
// Mock electron-log before any imports
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
      file: { level: 'debug', resolvePathFn: null, format: '', getFile: () => ({ path: '/mock' }) },
      console: { level: 'debug', format: '' },
      ipc: { level: 'debug' },
      remote: { level: 'debug' },
    },
    functions: { log: mockFn, info: mockFn, warn: mockFn, error: mockFn },
    catchErrors: mockFn,
    initialize: mockFn,
    scope: jest.fn(() => mockLogger),
  };
  return { default: mockLogger, __esModule: true };
});

// Mock electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
    getName: jest.fn(() => 'eventide-test'),
    getVersion: jest.fn(() => '1.0.0'),
  },
}));

import { hasRequiredGameFiles } from '../storage';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('Storage Module', () => {
  const testDir = path.join(os.tmpdir(), 'eventide-storage-test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('hasRequiredGameFiles', () => {
    it('should return false for non-existent directory', () => {
      const result = hasRequiredGameFiles(path.join(testDir, 'nonexistent'));
      expect(result).toBe(false);
    });

    it('should return false for empty directory', () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = hasRequiredGameFiles(emptyDir);
      expect(result).toBe(false);
    });

    it('should return true when required game files exist', () => {
      const gameDir = path.join(testDir, 'game');
      fs.mkdirSync(gameDir, { recursive: true });
      fs.writeFileSync(path.join(gameDir, 'ashita-cli.exe'), 'mock');

      const result = hasRequiredGameFiles(gameDir);
      expect(result).toBe(true);
    });
  });
});
