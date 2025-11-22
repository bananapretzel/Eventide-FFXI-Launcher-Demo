// Settings Page Tests - Clear Downloads Feature
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../pages/SettingsPage';

// Mock window.confirm before any tests run
const mockConfirm = jest.fn();
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: mockConfirm,
});

// Mock electron API
const mockElectron = {
  invoke: jest.fn(),
  readSettings: jest.fn(),
  writeSettings: jest.fn(),
  getPlatform: jest.fn(),
  launchGame: jest.fn(),
  ipcRenderer: {
    on: jest.fn(),
    once: jest.fn(),
    sendMessage: jest.fn(),
  },
};

beforeAll(() => {
  (window as any).electron = mockElectron;
});

describe('Settings Page - Clear Downloads Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockReturnValue(true); // Default to accepting confirmation

    // Default mock implementations
    mockElectron.readSettings.mockResolvedValue({
      success: true,
      data: {
        ffxi: {
          bgWidth: 3840,
          bgHeight: 2160,
        },
      },
    });

    mockElectron.writeSettings.mockResolvedValue({ success: true });

    mockElectron.getPlatform.mockResolvedValue({
      success: true,
      data: 'win32',
    });

    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'eventide:get-paths') {
        return Promise.resolve({
          success: true,
          data: {
            gameRoot: 'C:\\test\\game',
            dlRoot: 'C:\\test\\downloads',
          },
        });
      }
      if (channel === 'clear-downloads') {
        return Promise.resolve({ success: true });
      }
      if (channel === 'open-log-file') {
        return Promise.resolve({ success: true });
      }
      if (channel === 'reapply-patches') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });
  });

  it('should render Clear All Downloads button', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });
  });

  it('should show confirmation dialog when Clear Downloads clicked', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.stringContaining('delete all downloaded files')
    );
  });

  it('should call clear-downloads IPC when confirmed', async () => {
    mockConfirm.mockReturnValue(true);

    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('clear-downloads');
    });
  });

  it('should not call clear-downloads if user cancels confirmation', async () => {
    mockConfirm.mockReturnValue(false);

    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });

    // Should NOT have called clear-downloads
    expect(mockElectron.invoke).not.toHaveBeenCalledWith('clear-downloads');
  });

  it('should show success toast after successful clear', async () => {
    mockConfirm.mockReturnValue(true);

    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Downloads cleared successfully/i)).toBeInTheDocument();
    });
  });

  it('should show error toast if clear fails', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'clear-downloads') {
        return Promise.resolve({ success: false, error: 'Permission denied' });
      }
      if (channel === 'eventide:get-paths') {
        return Promise.resolve({
          success: true,
          data: {
            gameRoot: 'C:\\test\\game',
            dlRoot: 'C:\\test\\downloads',
          },
        });
      }
      return Promise.resolve({ success: true });
    });

    mockConfirm.mockReturnValue(true);

    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to clear downloads/i)).toBeInTheDocument();
      expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
    });
  });

  it('should have red styling for Clear Downloads button', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toHaveStyle({ background: '#ef4444' });
    });
  });

  it('should be placed near other troubleshooting buttons', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      const reapplyButton = screen.getByRole('button', { name: /REAPPLY PATCHES/i });
      const logButton = screen.getByRole('button', { name: /OPEN LOG FILE/i });

      expect(clearButton).toBeInTheDocument();
      expect(reapplyButton).toBeInTheDocument();
      expect(logButton).toBeInTheDocument();
    });
  });

  it('should handle exception during clear operation', async () => {
    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'clear-downloads') {
        throw new Error('Unexpected error');
      }
      if (channel === 'eventide:get-paths') {
        return Promise.resolve({
          success: true,
          data: {
            gameRoot: 'C:\\test\\game',
            dlRoot: 'C:\\test\\downloads',
          },
        });
      }
      return Promise.resolve({ success: true });
    });

    mockConfirm.mockReturnValue(true);

    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });
      expect(clearButton).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /CLEAR ALL DOWNLOADS/i });

    await act(async () => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to clear downloads/i)).toBeInTheDocument();
    });
  });
});

describe('Other Settings Page Features', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockElectron.readSettings.mockResolvedValue({
      success: true,
      data: {
        ffxi: {
          bgWidth: 3840,
          bgHeight: 2160,
        },
      },
    });

    mockElectron.writeSettings.mockResolvedValue({ success: true });

    mockElectron.getPlatform.mockResolvedValue({
      success: true,
      data: 'win32',
    });

    mockElectron.invoke.mockImplementation((channel: string) => {
      if (channel === 'eventide:get-paths') {
        return Promise.resolve({
          success: true,
          data: {
            gameRoot: 'C:\\test\\game',
            dlRoot: 'C:\\test\\downloads',
          },
        });
      }
      if (channel === 'open-log-file') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });
  });

  it('should render Reapply Patches button', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const reapplyButton = screen.getByRole('button', { name: /REAPPLY PATCHES/i });
      expect(reapplyButton).toBeInTheDocument();
    });
  });

  it('should render Open Log File button', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const logButton = screen.getByRole('button', { name: /OPEN LOG FILE/i });
      expect(logButton).toBeInTheDocument();
    });
  });

  it('should call open-log-file when button clicked', async () => {
    render(<SettingsPage />);

    // Switch to Launcher tab
    const launcherTab = screen.getByRole('button', { name: /LAUNCHER/i });
    fireEvent.click(launcherTab);

    await waitFor(() => {
      const logButton = screen.getByRole('button', { name: /OPEN LOG FILE/i });
      expect(logButton).toBeInTheDocument();
    });

    const logButton = screen.getByRole('button', { name: /OPEN LOG FILE/i });

    await act(async () => {
      fireEvent.click(logButton);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('open-log-file');
    });
  });
});
