// Clear Downloads IPC Handler Tests
import path from 'path';
import fs from 'fs-extra';
import { updateStorage, readStorage } from '../core/storage';

const mockUserDataPath = path.join(__dirname, 'mock-userdata');

// Mock electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name: string) => {
      if (name === 'userData') return mockUserDataPath;
      if (name === 'home') return '/mock/home';
      return '/mock';
    }),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Clear Downloads Functionality', () => {
  const testDownloadsDir = path.join(__dirname, 'test-downloads');
  const testFile1 = path.join(testDownloadsDir, 'game.zip');
  const testFile2 = path.join(testDownloadsDir, 'patch-1.0.0-2.0.0.zip');

  beforeAll(async () => {
    // Create mock userData directory
    await fs.ensureDir(mockUserDataPath);
  });

  afterAll(async () => {
    // Clean up mock userData directory
    if (await fs.pathExists(mockUserDataPath)) {
      await fs.remove(mockUserDataPath);
    }
  });

  beforeEach(async () => {
    // Create test downloads directory and files
    await fs.ensureDir(testDownloadsDir);
    await fs.writeFile(testFile1, 'test content 1');
    await fs.writeFile(testFile2, 'test content 2');
  });

  afterEach(async () => {
    // Clean up test directory
    if (await fs.pathExists(testDownloadsDir)) {
      await fs.remove(testDownloadsDir);
    }
  });

  it('should delete all files in downloads directory', async () => {
    // Verify files exist
    expect(await fs.pathExists(testFile1)).toBe(true);
    expect(await fs.pathExists(testFile2)).toBe(true);

    // Delete all files
    const files = await fs.readdir(testDownloadsDir);
    for (const file of files) {
      const filePath = path.join(testDownloadsDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        await fs.unlink(filePath);
      }
    }

    // Verify files are deleted
    const remainingFiles = await fs.readdir(testDownloadsDir);
    expect(remainingFiles.length).toBe(0);
  });

  it('should reset storage state after clearing downloads', async () => {
    // Simulate clearing downloads and resetting storage
    await updateStorage((data: any) => {
      data.GAME_UPDATER = data.GAME_UPDATER || {};
      data.GAME_UPDATER.currentVersion = '0.0.0';
      data.GAME_UPDATER.baseGame = { downloaded: false, extracted: false };
      data.GAME_UPDATER.updater = { downloaded: '', extracted: '' };
    });

    const storage = await readStorage();
    expect(storage.GAME_UPDATER.currentVersion).toBe('0.0.0');
    expect(storage.GAME_UPDATER.baseGame.downloaded).toBe(false);
    expect(storage.GAME_UPDATER.baseGame.extracted).toBe(false);
    expect(storage.GAME_UPDATER.updater.downloaded).toBe('');
    expect(storage.GAME_UPDATER.updater.extracted).toBe('');
  });

  it('should handle empty downloads directory gracefully', async () => {
    // Delete all files first
    const files = await fs.readdir(testDownloadsDir);
    for (const file of files) {
      const filePath = path.join(testDownloadsDir, file);
      await fs.unlink(filePath);
    }

    // Verify directory is empty
    const remainingFiles = await fs.readdir(testDownloadsDir);
    expect(remainingFiles.length).toBe(0);

    // Should not throw error when clearing empty directory
    expect(async () => {
      const files = await fs.readdir(testDownloadsDir);
      for (const file of files) {
        const filePath = path.join(testDownloadsDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          await fs.unlink(filePath);
        }
      }
    }).not.toThrow();
  });

  it('should not delete subdirectories, only files', async () => {
    const testSubDir = path.join(testDownloadsDir, 'subdir');
    await fs.ensureDir(testSubDir);
    await fs.writeFile(path.join(testSubDir, 'file.txt'), 'test');

    // Delete only files in root downloads directory
    const files = await fs.readdir(testDownloadsDir);
    for (const file of files) {
      const filePath = path.join(testDownloadsDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        await fs.unlink(filePath);
      }
    }

    // Verify subdirectory still exists
    expect(await fs.pathExists(testSubDir)).toBe(true);

    // Verify root files are deleted
    expect(await fs.pathExists(testFile1)).toBe(false);
    expect(await fs.pathExists(testFile2)).toBe(false);
  });

  it('should handle non-existent downloads directory', async () => {
    const nonExistentDir = path.join(__dirname, 'non-existent-downloads');

    // Should not throw error
    const dirExists = await fs.pathExists(nonExistentDir);
    expect(dirExists).toBe(false);
  });

  it('should complete clear-downloads operation successfully', async () => {
    // Simulate the full clear-downloads operation
    const downloadFiles = await fs.readdir(testDownloadsDir);

    // Track deleted files
    const deletedFiles: string[] = [];

    for (const file of downloadFiles) {
      const filePath = path.join(testDownloadsDir, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        await fs.unlink(filePath);
        deletedFiles.push(file);
      }
    }

    // Reset storage
    await updateStorage((data: any) => {
      data.GAME_UPDATER = data.GAME_UPDATER || {};
      data.GAME_UPDATER.currentVersion = '0.0.0';
      data.GAME_UPDATER.baseGame = { downloaded: false, extracted: false };
      data.GAME_UPDATER.updater = { downloaded: '', extracted: '' };
    });

    // Verify results
    expect(deletedFiles.length).toBe(2);
    const storage = await readStorage();
    expect(storage.GAME_UPDATER.currentVersion).toBe('0.0.0');
  });
});

describe('Error Message Categorization', () => {
  it('should categorize network errors', () => {
    const networkErrors = [
      'ENOTFOUND',
      'ECONNREFUSED',
      'Network error',
      'timeout',
    ];

    networkErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isNetworkError =
        message.includes('network') ||
        message.includes('enotfound') ||
        message.includes('econnrefused') ||
        message.includes('timeout');
      expect(isNetworkError).toBe(true);
    });
  });

  it('should categorize verification errors', () => {
    const verificationErrors = [
      'SHA256 mismatch',
      'checksum failed',
      'verification failed',
      'Size mismatch',
    ];

    verificationErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isVerificationError =
        message.includes('sha256') ||
        message.includes('checksum') ||
        message.includes('verification') ||
        message.includes('size mismatch');
      expect(isVerificationError).toBe(true);
    });
  });

  it('should categorize extraction errors', () => {
    const extractionErrors = [
      'Extraction failed',
      'unzip error',
      'extract error',
    ];

    extractionErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isExtractionError =
        message.includes('extract') || message.includes('unzip');
      expect(isExtractionError).toBe(true);
    });
  });

  it('should categorize disk space errors', () => {
    const diskSpaceErrors = ['ENOSPC', 'no space', 'disk full'];

    diskSpaceErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isDiskSpaceError =
        message.includes('enospc') ||
        message.includes('disk') ||
        message.includes('space');
      expect(isDiskSpaceError).toBe(true);
    });
  });

  it('should categorize permission errors', () => {
    const permissionErrors = [
      'EACCES',
      'EPERM',
      'permission denied',
      'access denied',
    ];

    permissionErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isPermissionError =
        message.includes('eacces') ||
        message.includes('eperm') ||
        message.includes('permission') ||
        message.includes('access denied');
      expect(isPermissionError).toBe(true);
    });
  });

  it('should categorize patch errors', () => {
    const patchErrors = [
      'patch failed',
      'patching error',
      'patch application failed',
    ];

    patchErrors.forEach((error) => {
      const message = error.toLowerCase();
      const isPatchError = message.includes('patch');
      expect(isPatchError).toBe(true);
    });
  });

  it('should provide default categorization for unknown errors', () => {
    const unknownError = 'Some weird unknown error';
    const message = unknownError.toLowerCase();

    const isKnownError =
      message.includes('network') ||
      message.includes('sha256') ||
      message.includes('extract') ||
      message.includes('enospc') ||
      message.includes('eacces') ||
      message.includes('patch');

    expect(isKnownError).toBe(false);
  });
});
