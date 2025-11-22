// HomePage component tests
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../pages/HomePage';

// Mock electron API with comprehensive IPC support
const mockElectron = {
  invoke: jest.fn(),
  writeConfig: jest.fn(),
  updateIniCredentials: jest.fn(),
  ipcRenderer: {
    on: jest.fn((channel: string, callback: any) => {
      // Store callback for manual triggering
      const listeners = (mockElectron as any)._listeners || {};
      if (!listeners[channel]) listeners[channel] = [];
      listeners[channel].push(callback);
      (mockElectron as any)._listeners = listeners;

      // Return cleanup function
      return () => {
        const idx = listeners[channel].indexOf(callback);
        if (idx >= 1) listeners[channel].splice(idx, 1);
      };
    }),
    once: jest.fn(),
    sendMessage: jest.fn(),
  },
  _listeners: {} as Record<string, Function[]>,
  _emit: (channel: string, ...args: any[]) => {
    const listeners = (mockElectron as any)._listeners[channel] || [];
    listeners.forEach((cb: Function) => cb({}, ...args));
  }
};

beforeAll(() => {
  (window as any).electron = mockElectron;
});

// Default props for testing
const defaultProps = {
  username: '',
  setUsername: jest.fn(),
  password: '',
  setPassword: jest.fn(),
  remember: false,
  setRemember: jest.fn(),
  canPlay: false,
  installDir: 'C:\\test\\game'
};

describe('HomePage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectron._listeners = {};

    // Default invoke response for game:check
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  it('should render the component', () => {
    render(<HomePage {...defaultProps} />);
    expect(screen.getByText(/ACCOUNT LOGIN/i)).toBeInTheDocument();
  });

  it('should show checking state initially', () => {
    render(<HomePage {...defaultProps} />);
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });

  it('should show missing state when game not installed', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should trigger download when install button clicked', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      if (channel === 'game:download') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: /Download/i });

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('game:download');
    });
  });

  it('should show download progress during download', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    // Simulate progress update
    await act(async () => {
      mockElectron._emit('download:progress', { dl: 500000, total: 1000000 });
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Downloading.*50%/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should show extraction progress during extraction', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    // Simulate extraction progress
    await act(async () => {
      mockElectron._emit('extract:progress', { current: 75, total: 100 });
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Extracting.*75%/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should handle download errors', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      if (channel === 'game:download') {
        return Promise.reject(new Error('Download failed'));
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: /Download/i });

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Download failed/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should show ready state when game is installed and up to date', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'ready',
          latestVersion: '1.0.0',
          installedVersion: '1.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} canPlay={true} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should show update-available state when update is needed', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'update-available',
          latestVersion: '2.0.0',
          installedVersion: '1.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Update/i });
      expect(button).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should trigger update when update button clicked', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'update-available',
          latestVersion: '2.0.0',
          installedVersion: '1.0.0'
        });
      }
      if (channel === 'game:update') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Update/i });
      expect(button).toBeInTheDocument();
    });

    const updateButton = screen.getByRole('button', { name: /Update/i });

    await act(async () => {
      fireEvent.click(updateButton);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('game:update');
    });
  });

  it('should launch game when play button clicked with valid credentials', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'ready',
          latestVersion: '1.0.0',
          installedVersion: '1.0.0'
        });
      }
      if (channel === 'game:launch') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    mockElectron.writeConfig.mockResolvedValue({ success: true });
    mockElectron.updateIniCredentials.mockResolvedValue({ success: true });

    const props = {
      ...defaultProps,
      username: 'testuser',
      password: 'testpass',
      canPlay: true
    };

    render(<HomePage {...props} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    });

    const playButton = screen.getByRole('button', { name: /^Play$/i });

    await act(async () => {
      fireEvent.click(playButton);
    });

    await waitFor(() => {
      expect(mockElectron.writeConfig).toHaveBeenCalled();
      expect(mockElectron.updateIniCredentials).toHaveBeenCalled();
      expect(mockElectron.invoke).toHaveBeenCalledWith('game:launch');
    });
  });

  it('should handle error from game:status event', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    // Emit error status
    await act(async () => {
      mockElectron._emit('game:status', {
        status: 'error',
        message: 'Installation failed'
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Installation failed/i)).toBeInTheDocument();
    });
  });

  it('should transition to ready state from game:status event', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} canPlay={true} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    // Emit ready status
    await act(async () => {
      mockElectron._emit('game:status', {
        status: 'ready'
      });
    });

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should allow retry after error', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      if (channel === 'game:download') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: /Download/i });

    await act(async () => {
      fireEvent.click(downloadButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    // Now mock successful download
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      if (channel === 'game:download') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    // Click the main retry button (with emoji)
    const retryButton = screen.getByRole('button', { name: /⚠️ Retry/i });

    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('game:download');
    });
  });

  it('should disable play button when credentials are missing', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'ready',
          latestVersion: '1.0.0',
          installedVersion: '1.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} canPlay={false} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    });

    const playButton = screen.getByRole('button', { name: /^Play$/i });
    expect(playButton).toBeDisabled();
  });

  it('should update username input', () => {
    const setUsername = jest.fn();
    const props = { ...defaultProps, setUsername };

    render(<HomePage {...props} />);

    const usernameInput = screen.getByPlaceholderText(/Username/i);

    fireEvent.change(usernameInput, { target: { value: 'newuser' } });

    expect(setUsername).toHaveBeenCalledWith('newuser');
  });

  it('should update password input', () => {
    const setPassword = jest.fn();
    const props = { ...defaultProps, setPassword };

    render(<HomePage {...props} />);

    const passwordInput = screen.getByPlaceholderText(/Password/i);

    fireEvent.change(passwordInput, { target: { value: 'newpass' } });

    expect(setPassword).toHaveBeenCalledWith('newpass');
  });

  it('should update remember checkbox', () => {
    const setRemember = jest.fn();
    const props = { ...defaultProps, setRemember };

    render(<HomePage {...props} />);

    const rememberCheckbox = screen.getByRole('checkbox', { name: /Remember credentials/i });

    fireEvent.click(rememberCheckbox);

    expect(setRemember).toHaveBeenCalledWith(true);
  });

  it('should display download progress with bytes', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'missing',
          latestVersion: '1.0.0',
          installedVersion: '0.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    render(<HomePage {...defaultProps} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Download/i });
      expect(button).toBeInTheDocument();
    });

    // Simulate progress with specific byte values
    await act(async () => {
      mockElectron._emit('download:progress', { dl: 524288000, total: 1048576000 }); // 500MB / 1000MB
    });

    await waitFor(() => {
      // Check for the progress info text that shows bytes
      expect(screen.getByText(/500.*MB.*1000.*MB/i)).toBeInTheDocument();
    });
  });

  it('should handle config write failure', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'ready',
          latestVersion: '1.0.0',
          installedVersion: '1.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    mockElectron.writeConfig.mockResolvedValue({ success: false, error: 'Write failed' });

    const props = {
      ...defaultProps,
      username: 'testuser',
      password: 'testpass',
      canPlay: true
    };

    render(<HomePage {...props} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    });

    const playButton = screen.getByRole('button', { name: /^Play$/i });

    await act(async () => {
      fireEvent.click(playButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Write failed/i)).toBeInTheDocument();
    });
  });

  it('should handle INI update failure', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'game:check') {
        return Promise.resolve({
          launcherState: 'ready',
          latestVersion: '1.0.0',
          installedVersion: '1.0.0'
        });
      }
      return Promise.resolve({ success: true });
    });

    mockElectron.writeConfig.mockResolvedValue({ success: true });
    mockElectron.updateIniCredentials.mockResolvedValue({ success: false, error: 'INI update failed' });

    const props = {
      ...defaultProps,
      username: 'testuser',
      password: 'testpass',
      canPlay: true
    };

    render(<HomePage {...props} />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /^Play$/i });
      expect(button).toBeInTheDocument();
    });

    const playButton = screen.getByRole('button', { name: /^Play$/i });

    await act(async () => {
      fireEvent.click(playButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/INI update failed/i)).toBeInTheDocument();
    });
  });

  describe('New Error Handling Features', () => {
    it('should show error card with icon and categorization', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0'
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Network error: ENOTFOUND'));
        }
        return Promise.resolve({ success: true });
      });

      render(<HomePage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
        expect(screen.getByText(/🌐/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry Now/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Clear Downloads/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View Log/i })).toBeInTheDocument();
      });
    });

    it('should apply error styling to play button', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0'
          });
        }
        if (channel === 'game:download') {
          return Promise.reject(new Error('Download failed'));
        }
        return Promise.resolve({ success: true });
      });

      render(<HomePage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        const errorButton = screen.getByRole('button', { name: /⚠️ Retry/i });
        expect(errorButton).toBeInTheDocument();
        expect(errorButton).toHaveClass('is-error');
      });
    });

    it('should handle clear downloads action', async () => {
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0'
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

      render(<HomePage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Clear Downloads/i })).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /Clear Downloads/i });
      await act(async () => {
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(mockElectron.invoke).toHaveBeenCalledWith('clear-downloads');
      });
    });

    it('should show different error categories correctly', async () => {
      const errorScenarios = [
        { error: 'SHA256 mismatch', expectedTitle: 'Download Corrupted', expectedIcon: '🔍' },
        { error: 'Extraction failed', expectedTitle: 'Extraction Failed', expectedIcon: '📦' },
        { error: 'ENOSPC: no space', expectedTitle: 'Insufficient Disk Space', expectedIcon: '💾' },
        { error: 'EACCES: permission denied', expectedTitle: 'Permission Denied', expectedIcon: '🔒' },
      ];

      for (const scenario of errorScenarios) {
        jest.clearAllMocks();
        mockElectron._listeners = {};

        mockElectron.invoke.mockImplementation((channel: string) => {
          if (channel === 'game:check') {
            return Promise.resolve({
              launcherState: 'missing',
              latestVersion: '1.0.0',
              installedVersion: '0.0.0'
            });
          }
          if (channel === 'game:download') {
            return Promise.reject(new Error(scenario.error));
          }
          return Promise.resolve({ success: true });
        });

        const { unmount } = render(<HomePage {...defaultProps} />);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
        });

        const downloadButton = screen.getByRole('button', { name: /Download/i });
        await act(async () => {
          fireEvent.click(downloadButton);
        });

        await waitFor(() => {
          expect(screen.getByText(new RegExp(scenario.expectedTitle, 'i'))).toBeInTheDocument();
          expect(screen.getByText(scenario.expectedIcon)).toBeInTheDocument();
        });

        unmount();
      }
    });

    it('should allow multiple retry attempts', async () => {
      let attemptCount = 0;
      mockElectron.invoke.mockImplementation((channel: string) => {
        if (channel === 'game:check') {
          return Promise.resolve({
            launcherState: 'missing',
            latestVersion: '1.0.0',
            installedVersion: '0.0.0'
          });
        }
        if (channel === 'game:download') {
          attemptCount++;
          if (attemptCount < 3) {
            return Promise.reject(new Error('Network error'));
          }
          // Success on third attempt
          setTimeout(() => {
            mockElectron._emit('game:status', { status: 'ready' });
          }, 100);
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true });
      });

      render(<HomePage {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
      });

      // Attempt 1
      const downloadButton = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
      });

      // Attempt 2
      let retryButton = screen.getByRole('button', { name: /Retry Now/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Network Error/i)).toBeInTheDocument();
      });

      // Attempt 3 - succeeds
      retryButton = screen.getByRole('button', { name: /Retry Now/i });
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
      });

      expect(attemptCount).toBe(3);
    });
  });
});
