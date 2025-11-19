// Storage module tests
import { hasRequiredGameFiles } from '../storage';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

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
