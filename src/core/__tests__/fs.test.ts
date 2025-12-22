// Filesystem module tests
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileExists, readJson, writeJson, verifyExtractedFiles } from '../fs';

jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Filesystem Module', () => {
  const testDir = path.join(os.tmpdir(), 'eventide-test-fs');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      files.forEach((file) => {
        const filePath = path.join(testDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
      });
    }
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const testFile = path.join(testDir, 'exists.txt');
      fs.writeFileSync(testFile, 'test');
      expect(await fileExists(testFile)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist.txt');
      expect(await fileExists(nonExistent)).toBe(false);
    });
  });

  describe('readJson', () => {
    it('should read valid JSON file', async () => {
      const testFile = path.join(testDir, 'test.json');
      const testData = { foo: 'bar', num: 123 };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      const result = await readJson(testFile);
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent file', async () => {
      const nonExistent = path.join(testDir, 'missing.json');
      const result = await readJson(nonExistent);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      const testFile = path.join(testDir, 'invalid.json');
      fs.writeFileSync(testFile, 'not valid json {');
      const result = await readJson(testFile);
      expect(result).toBeNull();
    });
  });

  describe('writeJson', () => {
    it('should write JSON file', async () => {
      const testFile = path.join(testDir, 'output.json');
      const testData = { foo: 'bar', nested: { value: 123 } };

      await writeJson(testFile, testData);

      expect(fs.existsSync(testFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
      expect(content).toEqual(testData);
    });

    it('should overwrite existing file', async () => {
      const testFile = path.join(testDir, 'overwrite.json');
      fs.writeFileSync(testFile, JSON.stringify({ old: 'data' }));

      const newData = { new: 'data' };
      await writeJson(testFile, newData);

      const content = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
      expect(content).toEqual(newData);
    });

    it('should format JSON with proper indentation', async () => {
      const testFile = path.join(testDir, 'formatted.json');
      await writeJson(testFile, { a: 1, b: { c: 2 } });

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toContain('\n'); // Should have actual newlines
      expect(content).toContain('  '); // Should have indentation
    });
  });

  describe('verifyExtractedFiles', () => {
    it('should count files in directory', async () => {
      const testSubdir = path.join(testDir, 'verify-test');
      fs.mkdirSync(testSubdir, { recursive: true });

      fs.writeFileSync(path.join(testSubdir, 'file1.txt'), 'test');
      fs.writeFileSync(path.join(testSubdir, 'file2.txt'), 'test');
      fs.writeFileSync(path.join(testSubdir, 'file3.txt'), 'test');

      const result = await verifyExtractedFiles(testSubdir, 3);
      expect(result.success).toBe(true);
      expect(result.fileCount).toBe(3);
    });

    it('should count files recursively', async () => {
      const testSubdir = path.join(testDir, 'recursive-test');
      const nestedDir = path.join(testSubdir, 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });

      fs.writeFileSync(path.join(testSubdir, 'file1.txt'), 'test');
      fs.writeFileSync(path.join(nestedDir, 'file2.txt'), 'test');

      const result = await verifyExtractedFiles(testSubdir);
      expect(result.fileCount).toBe(2);
    });

    it('should fail when minimum file count not met', async () => {
      const testSubdir = path.join(testDir, 'min-files-test');
      fs.mkdirSync(testSubdir, { recursive: true });
      fs.writeFileSync(path.join(testSubdir, 'file1.txt'), 'test');

      const result = await verifyExtractedFiles(testSubdir, 10);
      expect(result.success).toBe(false);
      expect(result.fileCount).toBe(1);
    });
  });
});
