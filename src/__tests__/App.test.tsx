// Mock electron-log/renderer before any imports
jest.mock('electron-log/renderer', () => {
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
      file: { level: 'debug' },
      console: { level: 'debug', format: '' },
    },
    scope: jest.fn(() => mockLogger),
  };
  return { default: mockLogger, __esModule: true };
});

import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import App from '../renderer/App';

// Mock the electron API
const mockElectron = {
  readConfig: jest.fn().mockResolvedValue({
    success: true,
    data: {
      username: '',
      password: '',
      rememberCredentials: true,
      launcherVersion: '1.0.0',
    },
  }),
  writeConfig: jest.fn().mockResolvedValue({ success: true }),
  readSettings: jest.fn().mockResolvedValue({
    success: true,
    data: {},
  }),
  writeSettings: jest.fn().mockResolvedValue({ success: true }),
  readExtensions: jest.fn().mockResolvedValue({
    success: true,
    data: { addons: [], plugins: [] },
  }),
  writeExtensions: jest.fn().mockResolvedValue({ success: true }),
  readFeed: jest.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
  launchGame: jest.fn().mockResolvedValue({ success: true }),
};

// Set up the window.electron mock before tests
beforeAll(() => {
  Object.defineProperty(window, 'electron', {
    writable: true,
    value: mockElectron,
  });
});

describe('App', () => {
  it('should render', () => {
    expect(render(<App />)).toBeTruthy();
  });
});
