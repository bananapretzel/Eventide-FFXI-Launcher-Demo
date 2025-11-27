// Settings Page Tests - Troubleshooting Features
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../pages/SettingsPage';

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
  launcherUpdate: {
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    installUpdate: jest.fn(),
    onUpdateEvent: jest.fn(() => () => {}),
  },
};

beforeAll(() => {
  (window as any).electron = mockElectron;
});

describe('Settings Page - Troubleshooting Tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
      if (channel === 'open-log-file') {
        return Promise.resolve({ success: true });
      }
      if (channel === 'open-config-folder') {
        return Promise.resolve({ success: true });
      }
      if (channel === 'reapply-patches') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });
  });

  it('should render troubleshooting tab button', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    expect(troubleshootingTab).toBeInTheDocument();
  });

  it('should switch to troubleshooting tab when clicked', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const configButton = screen.getByRole('button', { name: /Open Configuration Folder/i });
      expect(configButton).toBeInTheDocument();
    });
  });

  it('should render Open Configuration Folder button', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Open Configuration Folder/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should render Open Log File button', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Open Log File/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should call open-log-file when button clicked', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Open Log File/i });
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Open Log File/i });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('open-log-file');
    });
  });

  it('should render Reapply Patches button', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Reapply/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should call reapply-patches when button clicked', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Reapply/i });
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Reapply/i });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(mockElectron.invoke).toHaveBeenCalledWith('reapply-patches');
    });
  });

  it('should render Force Start Game button', async () => {
    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Launch/i });
      expect(button).toBeInTheDocument();
    });
  });

  it('should call launchGame when Force Start button clicked', async () => {
    mockElectron.launchGame.mockResolvedValue({ success: true });

    render(<SettingsPage />);

    const troubleshootingTab = screen.getByRole('button', { name: /TROUBLESHOOTING/i });
    fireEvent.click(troubleshootingTab);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /Launch/i });
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Launch/i });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(mockElectron.launchGame).toHaveBeenCalled();
    });
  });
});

describe('Settings Page - FFXI Tab', () => {
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
    mockElectron.getPlatform.mockResolvedValue({ success: true, data: 'win32' });
  });

  it('should render FFXI category tab', async () => {
    render(<SettingsPage />);

    const ffxiTab = screen.getByRole('button', { name: /FINAL FANTASY XI/i });
    expect(ffxiTab).toBeInTheDocument();
  });

  it('should have sub-tabs for FFXI settings', async () => {
    render(<SettingsPage />);

    const generalTab = screen.getByRole('tab', { name: /^GENERAL$/i });
    const graphicsTab = screen.getByRole('tab', { name: /^GRAPHICS$/i });
    const featuresTab = screen.getByRole('tab', { name: /^FEATURES$/i });
    const otherTab = screen.getByRole('tab', { name: /^OTHER$/i });

    expect(generalTab).toBeInTheDocument();
    expect(graphicsTab).toBeInTheDocument();
    expect(featuresTab).toBeInTheDocument();
    expect(otherTab).toBeInTheDocument();
  });
});

describe('Settings Page - PIVOT Tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockElectron.readSettings.mockResolvedValue({
      success: true,
      data: {},
    });

    mockElectron.writeSettings.mockResolvedValue({ success: true });
    mockElectron.getPlatform.mockResolvedValue({ success: true, data: 'win32' });
  });

  it('should render PIVOT category tab', async () => {
    render(<SettingsPage />);

    const pivotTab = screen.getByRole('button', { name: /^PIVOT$/i });
    expect(pivotTab).toBeInTheDocument();
  });

  it('should show Eventide overlay setting when PIVOT tab clicked', async () => {
    render(<SettingsPage />);

    const pivotTab = screen.getByRole('button', { name: /^PIVOT$/i });
    fireEvent.click(pivotTab);

    await waitFor(() => {
      expect(screen.getByText(/Overlays/i)).toBeInTheDocument();
      const eventideLabel = screen.getByLabelText(/Eventide overlay/i);
      expect(eventideLabel).toBeInTheDocument();
    });
  });
});
