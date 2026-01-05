// Network module tests
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { downloadFile, fetchJson } from '../net';

// Mock electron-log
jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Network Module', () => {
  const testDir = path.join(os.tmpdir(), 'eventide-test-downloads');
  const originalFetch = global.fetch;

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testDir, file));
      });
    }
  });

  describe('fetchJson', () => {
    beforeEach(() => {
      global.fetch = (jest.fn(async (url: any) => {
        const u = String(url);

        if (u.includes('invalid-domain-that-does-not-exist-12345.com')) {
          throw new Error('ENOTFOUND');
        }

        if (u.includes('api.github.com/repos/nonexistent/nonexistent')) {
          return {
            ok: false,
            status: 404,
            json: jest.fn(async () => ({})),
            text: jest.fn(async () => 'Not Found'),
          } as any;
        }

        if (u.includes('github.com/this-does-not-exist-12345')) {
          return {
            ok: true,
            status: 200,
            json: jest.fn(async () => {
              throw new Error('Unexpected token < in JSON');
            }),
            text: jest.fn(async () => '<html>not json</html>'),
          } as any;
        }

        if (u.includes('api.github.com/repos/microsoft/vscode/releases/latest')) {
          return {
            ok: true,
            status: 200,
            json: jest.fn(async () => ({ tag_name: '1.0.0' })),
            text: jest.fn(async () => JSON.stringify({ tag_name: '1.0.0' })),
          } as any;
        }

        return {
          ok: false,
          status: 500,
          json: jest.fn(async () => ({})),
          text: jest.fn(async () => 'Unhandled test URL'),
        } as any;
      }) as any) as any;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      jest.clearAllMocks();
    });

    it('should fetch and parse valid JSON', async () => {
      const result = await fetchJson(
        'https://api.github.com/repos/microsoft/vscode/releases/latest',
      );
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should throw error for invalid URL', async () => {
      await expect(
        fetchJson('https://invalid-domain-that-does-not-exist-12345.com'),
      ).rejects.toThrow();
    });

    it('should throw error for non-200 status', async () => {
      await expect(
        fetchJson('https://api.github.com/repos/nonexistent/nonexistent'),
      ).rejects.toThrow(/404/);
    });

    it('should throw error for invalid JSON', async () => {
      // GitHub returns HTML for 404, not JSON
      await expect(
        fetchJson('https://github.com/this-does-not-exist-12345'),
      ).rejects.toThrow();
    });
  });

  describe('downloadFile', () => {
    it('should download a small file successfully', async () => {
      const dest = path.join(testDir, 'test-download.json');
      const url =
        'https://raw.githubusercontent.com/microsoft/vscode/main/package.json';

      await downloadFile(url, dest);

      expect(fs.existsSync(dest)).toBe(true);
      const stats = fs.statSync(dest);
      expect(stats.size).toBeGreaterThan(0);
    }, 30000);

    it('should report progress during download', async () => {
      const dest = path.join(testDir, 'test-progress.json');
      const url =
        'https://raw.githubusercontent.com/microsoft/vscode/main/package.json';
      const progressUpdates: Array<{ dl: number; total: number }> = [];

      await downloadFile(url, dest, (dl, total) => {
        progressUpdates.push({ dl, total });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].dl).toBeGreaterThan(0);
    }, 30000);

    it('should handle redirects', async () => {
      const dest = path.join(testDir, 'redirect-test.html');
      // GitHub uses redirects for some URLs
      const url = 'https://github.com/';

      await downloadFile(url, dest);
      expect(fs.existsSync(dest)).toBe(true);
    }, 30000);

    it('should verify file size when expectedSize is provided', async () => {
      const dest = path.join(testDir, 'size-test.json');
      const url =
        'https://raw.githubusercontent.com/microsoft/vscode/main/package.json';

      // This should fail because we provide wrong expected size
      await expect(
        downloadFile(url, dest, undefined, 999999999, 0, 0),
      ).rejects.toThrow(/Size mismatch/);
    }, 30000);

    it('should throw error for non-200 status', async () => {
      const dest = path.join(testDir, 'error-test.txt');
      await expect(
        downloadFile(
          'https://raw.githubusercontent.com/nonexistent/nonexistent/main/file.txt',
          dest,
        ),
      ).rejects.toThrow();
    }, 30000);
  });

  describe('retry logic', () => {
    it('should handle network errors gracefully', async () => {
      const dest = path.join(testDir, 'retry-test.txt');
      // Invalid domain should trigger retry logic
      await expect(
        downloadFile('https://this-domain-does-not-exist-12345.invalid', dest),
      ).rejects.toThrow();
    }, 60000);
  });
});
