// Test setup file
import fetch from 'node-fetch';

// Mock electron-log before any imports use it
jest.mock('electron-log', () => {
  const mockFn = () => {};
  return {
    default: {
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
          getFile: () => ({ path: '/mock/log/path' }),
        },
        console: { level: 'debug', format: '' },
        ipc: { level: 'debug' },
        remote: { level: 'debug' },
      },
      functions: {
        log: mockFn,
        info: mockFn,
        warn: mockFn,
        error: mockFn,
        debug: mockFn,
        verbose: mockFn,
        silly: mockFn,
      },
      catchErrors: mockFn,
      initialize: mockFn,
      scope: () => this,
    },
    __esModule: true,
  };
});

jest.mock('electron-log/renderer', () => {
  const mockFn = () => {};
  return {
    default: {
      info: mockFn,
      warn: mockFn,
      error: mockFn,
      debug: mockFn,
      verbose: mockFn,
      silly: mockFn,
      log: mockFn,
      transports: {
        file: { level: 'debug' },
        console: { level: 'debug' },
      },
    },
    __esModule: true,
  };
});

jest.mock('electron-log/preload', () => {
  return { default: undefined, __esModule: true };
});

// Add fetch to global scope for tests
if (!global.fetch) {
  (global as any).fetch = fetch;
}
