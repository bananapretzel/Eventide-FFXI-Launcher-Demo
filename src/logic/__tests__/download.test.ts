// Download logic tests
import { downloadGame } from '../download';
import * as net from '../../core/net';
import * as fs from '../../core/fs';
import * as hash from '../../core/hash';
import * as storage from '../../core/storage';
import * as versions from '../../core/versions';
import path from 'path';

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

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../core/net');
jest.mock('../../core/fs');
jest.mock('../../core/hash');
jest.mock('../../core/storage');
jest.mock('../../core/versions');

describe('Download Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks for storage
    (storage.updateStorage as jest.Mock).mockImplementation(async (updater: any) => {
      const mockStorage = storage.getDefaultStorage();
      updater(mockStorage);
      return Promise.resolve();
    });

    (storage.getDefaultStorage as jest.Mock).mockReturnValue({
      schemaVersion: 1,
      paths: { installPath: '', downloadPath: '' },
      GAME_UPDATER: {
        currentVersion: "0.0.0",
        latestVersion: "0.0.0",
        baseGame: { downloaded: false, extracted: false },
        updater: { downloaded: "", extracted: "" },
      },
    });
  });

  it('should call downloadFile with correct parameters', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest.fn().mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(mockVerifyExtractedFiles);
    (versions.setClientVersion as jest.Mock).mockImplementation(mockSetClientVersion);

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';
    const expectedSize = 1000000;

    await downloadGame(url, sha256, installDir, dlDir, baseVersion, expectedSize);

    expect(mockDownloadFile).toHaveBeenCalledWith(
      url,
      path.join(dlDir, 'game.zip'),
      undefined,
      0,
      0,
      expectedSize
    );
    expect(mockVerifySha256).toHaveBeenCalledWith(path.join(dlDir, 'game.zip'), sha256);
    expect(mockExtractZip).toHaveBeenCalledWith(path.join(dlDir, 'game.zip'), installDir, undefined);
    expect(mockVerifyExtractedFiles).toHaveBeenCalledWith(installDir, 100);
    expect(mockSetClientVersion).toHaveBeenCalledWith(installDir, baseVersion);
    expect(storage.updateStorage).toHaveBeenCalledTimes(2); // Once for downloaded, once for extracted
  });

  it('should update storage flags during download process', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest.fn().mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(mockVerifyExtractedFiles);
    (versions.setClientVersion as jest.Mock).mockImplementation(mockSetClientVersion);

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
    expect(mockData1.GAME_UPDATER.baseGame.downloaded).toBe(true);

    // Verify second call set extracted flag
    const secondCall = (storage.updateStorage as jest.Mock).mock.calls[1][0];
    const mockData2 = storage.getDefaultStorage();
    secondCall(mockData2);
    expect(mockData2.GAME_UPDATER.baseGame.extracted).toBe(true);
  });

  it('should throw error if SHA256 verification fails', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(false);

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';

    await expect(downloadGame(url, sha256, installDir, dlDir, baseVersion)).rejects.toThrow('SHA256 mismatch');

    expect(mockDownloadFile).toHaveBeenCalled();
    expect(mockVerifySha256).toHaveBeenCalled();
  });

  it('should throw error if extraction verification fails', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest.fn().mockResolvedValue({ success: false, fileCount: 50 });

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(mockVerifyExtractedFiles);

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';

    await expect(downloadGame(url, sha256, installDir, dlDir, baseVersion)).rejects.toThrow('Extraction verification failed');

    expect(mockExtractZip).toHaveBeenCalled();
    expect(mockVerifyExtractedFiles).toHaveBeenCalledWith(installDir, 100);
  });

  it('should handle progress callbacks', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest.fn().mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(mockVerifyExtractedFiles);
    (versions.setClientVersion as jest.Mock).mockImplementation(mockSetClientVersion);

    const onProgress = jest.fn();
    const onExtractProgress = jest.fn();

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '1.0.0';
    const expectedSize = 1000000;

    await downloadGame(url, sha256, installDir, dlDir, baseVersion, expectedSize, onProgress, onExtractProgress);

    expect(mockDownloadFile).toHaveBeenCalledWith(
      url,
      path.join(dlDir, 'game.zip'),
      onProgress,
      0,
      0,
      expectedSize
    );
    expect(mockExtractZip).toHaveBeenCalledWith(
      path.join(dlDir, 'game.zip'),
      installDir,
      onExtractProgress
    );
  });

  it('should set client version after successful download', async () => {
    const mockDownloadFile = jest.fn().mockResolvedValue(undefined);
    const mockExtractZip = jest.fn().mockResolvedValue(undefined);
    const mockVerifySha256 = jest.fn().mockResolvedValue(true);
    const mockVerifyExtractedFiles = jest.fn().mockResolvedValue({ success: true, fileCount: 150 });
    const mockSetClientVersion = jest.fn().mockResolvedValue(undefined);

    (net.downloadFile as jest.Mock).mockImplementation(mockDownloadFile);
    (fs.extractZip as jest.Mock).mockImplementation(mockExtractZip);
    (hash.verifySha256 as jest.Mock).mockImplementation(mockVerifySha256);
    (fs.verifyExtractedFiles as jest.Mock).mockImplementation(mockVerifyExtractedFiles);
    (versions.setClientVersion as jest.Mock).mockImplementation(mockSetClientVersion);

    const url = 'https://example.com/game.zip';
    const sha256 = 'abc123';
    const installDir = '/install';
    const dlDir = '/downloads';
    const baseVersion = '2.5.0';

    await downloadGame(url, sha256, installDir, dlDir, baseVersion);

    expect(mockSetClientVersion).toHaveBeenCalledWith(installDir, baseVersion);
  });
});
