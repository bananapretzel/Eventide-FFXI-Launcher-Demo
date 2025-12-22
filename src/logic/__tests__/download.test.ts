// Download logic tests
// Mock electron-log with explicit mock implementation
import path from 'path';
import { downloadGame } from '../download';
import * as net from '../../core/net';
import * as fs from '../../core/fs';
import * as hash from '../../core/hash';
import * as storage from '../../core/storage';
import * as versions from '../../core/versions';

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

// Mock electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name: string) => {
      if (name === 'userData') return '/mock/userdata';
      return '/mock/path';
    }),
    isPackaged: false,
    getVersion: jest.fn(() => '1.0.0'),
  },
}));

// Mock the paths module to avoid logger initialization issues
jest.mock('../../main/paths', () => ({
  getEventidePaths: jest.fn(() => ({
    storage: '/mock/storage.json',
    gameRoot: '/mock/game',
    downloadRoot: '/mock/downloads',
  })),
}));

jest.mock('../../core/net');
jest.mock('../../core/fs');
jest.mock('../../core/hash');
jest.mock('../../core/storage');
jest.mock('../../core/versions');

describe('Download Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks for net module functions
    (net.createDownloadController as jest.Mock).mockReturnValue(
      new AbortController(),
    );
    (net.clearDownloadController as jest.Mock).mockImplementation(() => {});
    (net.abortDownload as jest.Mock).mockImplementation(() => {});
    (net.getPartialDownloadSize as jest.Mock).mockReturnValue(0);
    (net.downloadFileResumable as jest.Mock).mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });

    // Setup default mocks for storage
    (storage.getDownloadProgress as jest.Mock).mockResolvedValue(null);
    (storage.clearDownloadProgress as jest.Mock).mockResolvedValue(undefined);
    (storage.saveDownloadProgress as jest.Mock).mockResolvedValue(undefined);
    (storage.updateStorage as jest.Mock).mockImplementation(
      async (updater: any) => {
        const mockStorage = storage.getDefaultStorage();
        updater(mockStorage);
        return Promise.resolve();
      },
    );

    (storage.getDefaultStorage as jest.Mock).mockReturnValue({
      schemaVersion: 2,
      paths: { installPath: '', downloadPath: '' },
      gameState: {
        installedVersion: '0.0.0',
        availableVersion: '0.0.0',
        baseGame: { isDownloaded: false, isExtracted: false },
        patches: { downloadedVersion: '', appliedVersion: '' },
      },
    });
  });

  it('should call downloadFileResumable with correct parameters', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest
      .fn()
      .mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(
      mockVerifyExtractedFiles,
    );
    (versions.setClientVersion as jest.Mock).mockImplementation(
      mockSetClientVersion,
    );

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';
    const expectedSize = 1000000;

    await downloadGame(
      url,
      sha256,
      installDir,
      dlDir,
      baseVersion,
      expectedSize,
    );

    expect(mockDownloadFileResumable).toHaveBeenCalledWith(
      url,
      path.join(dlDir, 'game.zip'),
      0, // startByte
      expectedSize,
      expect.any(Function), // progress callback wrapper
      expect.any(Object), // AbortSignal
    );
    expect(mockVerifySha256).toHaveBeenCalledWith(
      path.join(dlDir, 'game.zip'),
      sha256,
    );
    expect(mockExtractZip).toHaveBeenCalledWith(
      path.join(dlDir, 'game.zip'),
      installDir,
      undefined,
    );
    expect(mockVerifyExtractedFiles).toHaveBeenCalledWith(installDir, 100);
    expect(mockSetClientVersion).toHaveBeenCalledWith(installDir, baseVersion);
    expect(storage.updateStorage).toHaveBeenCalledTimes(2); // Once for downloaded, once for extracted
  });

  it('should update storage flags during download process', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest
      .fn()
      .mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(
      mockVerifyExtractedFiles,
    );
    (versions.setClientVersion as jest.Mock).mockImplementation(
      mockSetClientVersion,
    );

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';

    await downloadGame(url, sha256, installDir, dlDir, baseVersion);

    // Verify storage was updated twice
    expect(storage.updateStorage).toHaveBeenCalledTimes(2);

    // Verify first call set downloaded flag
    const firstCall = (storage.updateStorage as jest.Mock).mock.calls[0][0];
    const mockData1 = storage.getDefaultStorage();
    firstCall(mockData1);
    expect(mockData1.gameState.baseGame.isDownloaded).toBe(true);

    // Verify second call set extracted flag
    const secondCall = (storage.updateStorage as jest.Mock).mock.calls[1][0];
    const mockData2 = storage.getDefaultStorage();
    secondCall(mockData2);
    expect(mockData2.gameState.baseGame.isExtracted).toBe(true);
  });

  it('should throw error if SHA256 verification fails', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockVerifySha256 = jest.fn().mockResolvedValue(false);

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';

    await expect(
      downloadGame(url, sha256, installDir, dlDir, baseVersion),
    ).rejects.toThrow('SHA256 mismatch');

    expect(mockDownloadFileResumable).toHaveBeenCalled();
    expect(mockVerifySha256).toHaveBeenCalled();
  });

  it('should throw error if extraction verification fails', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest
      .fn()
      .mockResolvedValue({ success: false, fileCount: 50 });

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(
      mockVerifyExtractedFiles,
    );

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';

    await expect(
      downloadGame(url, sha256, installDir, dlDir, baseVersion),
    ).rejects.toThrow('Extraction verification failed');

    expect(mockExtractZip).toHaveBeenCalled();
    expect(mockVerifyExtractedFiles).toHaveBeenCalledWith(installDir, 100);
  });

  it('should handle progress callbacks', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest
      .fn()
      .mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(
      mockVerifyExtractedFiles,
    );
    (versions.setClientVersion as jest.Mock).mockImplementation(
      mockSetClientVersion,
    );

    const onProgress = jest.fn();
    const onExtractProgress = jest.fn();

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';
    const expectedSize = 1000000;

    await downloadGame(
      url,
      sha256,
      installDir,
      dlDir,
      baseVersion,
      expectedSize,
      onProgress,
      onExtractProgress,
    );

    expect(mockDownloadFileResumable).toHaveBeenCalledWith(
      url,
      path.join(dlDir, 'game.zip'),
      0, // startByte
      expectedSize,
      expect.any(Function), // progress callback wrapper
      expect.any(Object), // AbortSignal
    );
    expect(mockExtractZip).toHaveBeenCalledWith(
      path.join(dlDir, 'game.zip'),
      installDir,
      onExtractProgress,
    );
  });

  it('should set client version after successful download', async () => {
    const mockDownloadFileResumable = jest.fn().mockResolvedValue({
      completed: true,
      wasPaused: false,
      bytesDownloaded: 1000000,
      totalBytes: 1000000,
    });
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest
      .fn()
      .mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFileResumable as jest.Mock).mockImplementation(
      mockDownloadFileResumable,
    );
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(
      mockVerifyExtractedFiles,
    );
    (versions.setClientVersion as jest.Mock).mockImplementation(
      mockSetClientVersion,
    );

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '2.5.0';

    await downloadGame(url, sha256, installDir, dlDir, baseVersion);

    expect(mockSetClientVersion).toHaveBeenCalledWith(installDir, baseVersion);
  });
});
