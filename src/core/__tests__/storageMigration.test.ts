// Storage Schema Migration Tests
// Tests for v1 → v2 schema migration

// Mock electron-log - uses __mocks__/electron-log.js
import {
  validateStorageJson,
  getDefaultStorage,
  StorageJson,
} from '../storage';

jest.mock('electron-log');

// Mock electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
    getName: jest.fn(() => 'eventide-test'),
    getVersion: jest.fn(() => '1.0.0'),
  },
}));

// Mock the paths module
jest.mock('../../main/paths', () => ({
  getEventidePaths: jest.fn(() => ({
    storage: '/mock/storage.json',
    gameRoot: '/mock/game',
    downloadRoot: '/mock/downloads',
  })),
}));

describe('Storage Schema Migration', () => {
  describe('validateStorageJson', () => {
    it('should return false for null input', () => {
      expect(validateStorageJson(null)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(validateStorageJson(undefined)).toBe(false);
    });

    it('should return false for non-object input', () => {
      expect(validateStorageJson('string')).toBe(false);
      expect(validateStorageJson(123)).toBe(false);
      expect(validateStorageJson([])).toBe(false);
    });

    it('should return false for missing schemaVersion', () => {
      const data = {
        paths: { installPath: '', downloadPath: '' },
        gameState: {},
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for v1 schema (triggers migration)', () => {
      const v1Data = {
        schemaVersion: 1,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        GAME_UPDATER: {
          currentVersion: '1.0.0',
          latestVersion: '1.1.0',
          baseGame: { downloaded: true, extracted: true },
          updater: { downloaded: '1.1.0', extracted: '1.0.0' },
        },
      };
      // Should return false to trigger migration in readStorage
      expect(validateStorageJson(v1Data)).toBe(false);
    });

    it('should return false for wrong schema version', () => {
      const data = {
        schemaVersion: 99,
        paths: { installPath: '', downloadPath: '' },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.0.0',
          baseGame: { isDownloaded: false, isExtracted: false },
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for missing paths', () => {
      const data = {
        schemaVersion: 2,
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.0.0',
          baseGame: { isDownloaded: false, isExtracted: false },
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for missing gameState', () => {
      const data = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for invalid installedVersion type', () => {
      const data = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: 123, // Should be string
          availableVersion: '1.0.0',
          baseGame: { isDownloaded: false, isExtracted: false },
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for missing baseGame', () => {
      const data = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.0.0',
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return false for missing patches', () => {
      const data = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.0.0',
          baseGame: { isDownloaded: false, isExtracted: false },
        },
      };
      expect(validateStorageJson(data)).toBe(false);
    });

    it('should return true for valid v2 schema', () => {
      const validData: StorageJson = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.1.0',
          baseGame: { isDownloaded: true, isExtracted: true },
          patches: { downloadedVersion: '1.1.0', appliedVersion: '1.0.0' },
        },
      };
      expect(validateStorageJson(validData)).toBe(true);
    });

    it('should set default availableVersion if missing', () => {
      const data: Record<string, any> = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: '1.0.0',
          // availableVersion missing
          baseGame: { isDownloaded: false, isExtracted: false },
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      // After validation, availableVersion should be set
      validateStorageJson(data);
      expect(data.gameState.availableVersion).toBe('0.0.0');
    });

    it('should allow optional downloadProgress field', () => {
      const validData: StorageJson = {
        schemaVersion: 2,
        paths: { installPath: '/game', downloadPath: '/downloads' },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.1.0',
          baseGame: { isDownloaded: false, isExtracted: false },
          patches: { downloadedVersion: '', appliedVersion: '' },
          downloadProgress: {
            url: 'https://example.com/game.zip',
            destPath: '/downloads/game.zip',
            bytesDownloaded: 50000,
            totalBytes: 100000,
            sha256: 'abc123',
            isPaused: false,
            startedAt: Date.now(),
            lastUpdatedAt: Date.now(),
          },
        },
      };
      expect(validateStorageJson(validData)).toBe(true);
    });

    it('should allow optional customInstallDir in paths', () => {
      const validData: StorageJson = {
        schemaVersion: 2,
        paths: {
          installPath: '/game',
          downloadPath: '/downloads',
          customInstallDir: '/custom/path',
        },
        gameState: {
          installedVersion: '1.0.0',
          availableVersion: '1.1.0',
          baseGame: { isDownloaded: true, isExtracted: true },
          patches: { downloadedVersion: '', appliedVersion: '' },
        },
      };
      expect(validateStorageJson(validData)).toBe(true);
    });
  });

  describe('getDefaultStorage', () => {
    it('should return a valid storage structure', () => {
      const defaultStorage = getDefaultStorage();
      expect(validateStorageJson(defaultStorage)).toBe(true);
    });

    it('should have schema version 2', () => {
      const defaultStorage = getDefaultStorage();
      expect(defaultStorage.schemaVersion).toBe(2);
    });

    it('should have default version values', () => {
      const defaultStorage = getDefaultStorage();
      expect(defaultStorage.gameState.installedVersion).toBe('0.0.0');
      expect(defaultStorage.gameState.availableVersion).toBe('0.0.0');
    });

    it('should have false download/extract flags by default', () => {
      const defaultStorage = getDefaultStorage();
      expect(defaultStorage.gameState.baseGame.isDownloaded).toBe(false);
      expect(defaultStorage.gameState.baseGame.isExtracted).toBe(false);
    });

    it('should have empty patch versions by default', () => {
      const defaultStorage = getDefaultStorage();
      expect(defaultStorage.gameState.patches.downloadedVersion).toBe('');
      expect(defaultStorage.gameState.patches.appliedVersion).toBe('');
    });
  });
});
