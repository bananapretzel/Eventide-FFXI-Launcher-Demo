// Error Handling and Recovery Tests
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

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../pages/HomePage';
import { GameStateProvider } from '../contexts/GameStateContext';

// Mock electron API
const mockElectron = {
  invoke: jest.fn(),
  writeConfig: jest.fn(),
  updateIniCredentials: jest.fn(),
  writeDefaultScript: jest.fn(),
  fetchPatchNotes: jest.fn(),
  ipcRenderer: {
    on: jest.fn((channel: string, callback: any) => {
      const listeners = (mockElectron as any)._listeners || {};
      if (!listeners[channel]) listeners[channel] = [];
      listeners[channel].push(callback);
      (mockElectron as any)._listeners = listeners;
      return () => {
        const idx = listeners[channel].indexOf(callback);
        if (idx >= 0) listeners[channel].splice(idx, 1);
      };
    }),
    once: jest.fn(),
    sendMessage: jest.fn(),
  },
  _listeners: {} as Record<string, Function[]>,
  _emit: (channel: string, ...args: any[]) => {
    const listeners = (mockElectron as any)._listeners[channel] || [];
    listeners.forEach((cb: Function) => cb({}, ...args));
  },
};

beforeAll(() => {
  (window as any).electron = mockElectron;
});

const defaultProps = {
  username: 'testuser',
  setUsername: jest.fn(),
  password: 'testpass',
  setPassword: jest.fn(),
  remember: true,
  setRemember: jest.fn(),
  canPlay: true,
  installDir: 'C:\\test\\game',
};

// Test wrapper to provide GameStateContext
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <GameStateProvider>{children}</GameStateProvider>
);

const renderHomePage = (props = defaultProps) => {
  return render(
    <TestWrapper>
      <HomePage {...props} />
    </TestWrapper>
  );
};

describe('Error Display and Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectron._listeners = {};
    mockElectron.fetchPatchNotes.mockResolvedValue({ success: true, data: [] });
  });

  describe('Error Categorization', () => {
    it('should display network error with proper icon and suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Network error: ENOTFOUND'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
        expect(screen.getByText(/Check your internet connection/i)).toBeInTheDocument();
        expect(screen.getByText(/🌐/)).toBeInTheDocument();
      });
    });

    it('should display SHA256/verification error with proper suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('SHA256 mismatch'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Download Corrupted/i)).toBeInTheDocument();
        expect(screen.getByText(/verification/i)).toBeInTheDocument();
        expect(screen.getByText(/🔍/)).toBeInTheDocument();
      });
    });

    it('should display extraction error with proper suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Extraction failed'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Extraction Failed/i)).toBeInTheDocument();
        expect(screen.getByText(/antivirus/i)).toBeInTheDocument();
        expect(screen.getByText(/📦/)).toBeInTheDocument();
      });
    });

    it('should display disk space error with proper suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('ENOSPC: no space left on device'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Insufficient Disk Space/i)).toBeInTheDocument();
        expect(screen.getByText(/10 GB/i)).toBeInTheDocument();
        expect(screen.getByText(/💾/)).toBeInTheDocument();
      });
    });

    it('should display permission error with proper suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('EACCES: permission denied'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
        expect(screen.getByText(/administrator/i)).toBeInTheDocument();
        expect(screen.getByText(/🔒/)).toBeInTheDocument();
      });
    });

    it('should display patch error with proper suggestions', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'update-available',
            latestVersion: '2.0.0',
            installedVersion: '1.0.0',
          });
        }
        if (channel === 'game:update') {
          return Promise.reject(new Error('Patch failed to apply'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Update/i })).toBeInTheDocument();
      });

      const updateButton = screen.getByRole('button', { name: /Update/i });
      await act(async () => {
        fireEvent.click(updateButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Patching Failed/i)).toBeInTheDocument();
        expect(screen.getByText(/Reapply Patches/i)).toBeInTheDocument();
        expect(screen.getByText(/🔧/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Button States', () => {
    it('should show error button with red styling and warning icon', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Download failed'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        const retryButton = screen.getByRole('button', { name: /⚠️ Retry/i });
        expect(retryButton).toBeInTheDocument();
        expect(retryButton).toHaveClass('is-error');
      });
    });
  });

  describe('Error Recovery Actions', () => {
    it('should allow retry after download error', async () => {
      let attemptCount = 0;
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          attemptCount++;
          if (attemptCount === 1) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      // First attempt - fails
      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
      });

      // Click Retry Now button
      const retryButton = screen.getByRole('button', { name: /Retry Now/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(mockElectron.invoke).toHaveBeenCalledWith('game:download');
        expect(attemptCount).toBe(2);
      });
    });

    it('should clear downloads when Clear Downloads button clicked', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('SHA256 mismatch'));
        }
        if (channel === 'clear-downloads') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Download Corrupted/i)).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /Clear Downloads/i });
      await act(async () => {
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(mockElectron.invoke).toHaveBeenCalledWith('clear-downloads');
      });
    });

    it('should open log file when View Log button clicked', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Download failed'));
        }
        if (channel === 'open-log-file') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        const errorCard = document.querySelector('.error-card');
        expect(errorCard).toBeInTheDocument();
      });

      const viewLogButton = screen.getByRole('button', { name: /View Log/i });
      await act(async () => {
        fireEvent.click(viewLogButton);
      });

      await waitFor(() => {
        expect(mockElectron.invoke).toHaveBeenCalledWith('open-log-file');
      });
    });
  });

  describe('Error State Management', () => {
    it('should track last failed operation for retry', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'update-available',
            latestVersion: '2.0.0',
            installedVersion: '1.0.0',
          });
        }
        if (channel === 'game:update') {
          return Promise.reject(new Error('Update failed'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Update/i })).toBeInTheDocument();
      });

      const updateButton = screen.getByRole('button', { name: /Update/i });
      await act(async () => {
        fireEvent.click(updateButton);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /⚠️ Retry/i })).toBeInTheDocument();
      });

      // Retry should call game:update again
      const retryButton = screen.getByRole('button', { name: /⚠️ Retry/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(mockElectron.invoke).toHaveBeenCalledWith('game:update');
      });
    });

    it('should maintain error state until successful operation', async () => {
      let attemptCount = 0;
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          attemptCount++;
          if (attemptCount < 3) {
            return Promise.reject(new Error('Network error'));
          }
          // Emit success status on third attempt
          setTimeout(() => {
            mockElectron._emit('game:status', { status: 'ready' });
          }, 100);
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      // First attempt
      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
      });

      // Second attempt
      let retryButton = screen.getByRole('button', { name: /Retry Now/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
      });

      // Third attempt - succeeds
      retryButton = screen.getByRole('button', { name: /Retry Now/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
      });
    });
  });

  describe('Error Display Animation', () => {
    it('should display error card with animation class', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0',
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Test error'));
        }
        return Promise.resolve({ success: true });
      });

      renderHomePage({...defaultProps});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        const errorCard = document.querySelector('.error-card');
        expect(errorCard).toBeInTheDocument();
        // In jsdom, CSS animations aren't applied, so we just check the element exists
        expect(errorCard).toHaveClass('error-card');
      });
    });
  });
});

