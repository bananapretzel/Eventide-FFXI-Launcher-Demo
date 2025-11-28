// Mock electron-log for Jest tests
const mockFn = () => {};

const mockTransports = {
  file: {
    level: 'debug',
    resolvePathFn: null,
    format: '',
    getFile: () => ({ path: '/mock/log/path' }),
  },
  console: {
    level: 'debug',
    format: '',
  },
  ipc: {
    level: 'debug',
  },
  remote: {
    level: 'debug',
  },
};

const mockFunctions = {
  log: mockFn,
  info: mockFn,
  warn: mockFn,
  error: mockFn,
  debug: mockFn,
  verbose: mockFn,
  silly: mockFn,
};

const mockLogger = {
  ...mockFunctions,
  transports: mockTransports,
  functions: mockFunctions,
  catchErrors: mockFn,
  initialize: mockFn,
  scope: () => mockLogger,
};

// Export as both CommonJS and ES module default
// This handles both main process (electron-log) and renderer (electron-log/renderer)
module.exports = mockLogger;
module.exports.default = mockLogger;
module.exports.__esModule = true;

// Also export transports and functions at the top level for renderer compatibility
module.exports.transports = mockTransports;
module.exports.info = mockFn;
module.exports.warn = mockFn;
module.exports.error = mockFn;
module.exports.debug = mockFn;
module.exports.log = mockFn;
