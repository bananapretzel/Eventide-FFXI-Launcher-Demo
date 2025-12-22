import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import {
  Home,
  Puzzle,
  Settings,
  Minus,
  X,
  Globe,
  Moon,
  Sun,
} from 'lucide-react';
import './App.css';
import log from './logger';
import { EVENTIDE_WEBSITE_URL } from '../core/constants';
import logo from '../../assets/slime2.png';
import titleLogo from '../../assets/eventideXI.png';
import HomePage from './pages/HomePage';
import ExtensionsPage from './pages/ExtensionsPage';
import SettingsPage from './pages/SettingsPage';
import { GameStateProvider } from './contexts/GameStateContext';

// Version display component
function VersionDisplay() {
  const [launcherVersion, setLauncherVersion] = useState<string>('');
  const [gameVersion, setGameVersion] = useState<string>('');

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        // Get launcher version
        if (window.electron?.getLauncherVersion) {
          const version = await window.electron.getLauncherVersion();
          setLauncherVersion(version || '');
        }

        // Get game version from game:check
        if (window.electron?.invoke) {
          const result = await window.electron.invoke('game:check');
          if (
            result &&
            result.installedVersion &&
            result.installedVersion !== '0.0.0'
          ) {
            setGameVersion(result.installedVersion);
          }
        }
      } catch (err) {
        log.error('Error fetching versions:', err);
      }
    };

    fetchVersions();

    // Also listen for game status updates to refresh game version
    const unsubscribe = window.electron?.ipcRenderer?.on(
      'game:status',
      (_event: any, payload: any) => {
        // If installedVersion is in the payload, update immediately
        if (payload?.installedVersion && payload.installedVersion !== '0.0.0') {
          setGameVersion(payload.installedVersion);
        } else {
          // Otherwise fetch versions
          fetchVersions();
        }
      },
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const versionText = [
    launcherVersion ? `Launcher v${launcherVersion}` : '',
    gameVersion ? `Game v${gameVersion}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  if (!versionText) return null;

  return <div className="version-display">{versionText}</div>;
}

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installDir, setInstallDir] = useState<string>(''); // will be set from IPC
  const [darkMode, setDarkMode] = useState(false);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Toggle dark mode and save to config
  const toggleDarkMode = async () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    try {
      if (window.electron?.readConfig && window.electron?.writeConfig) {
        const result = await window.electron.readConfig();
        if (result.success && result.data) {
          await window.electron.writeConfig({
            ...result.data,
            darkMode: newDarkMode,
          });
        }
      }
    } catch (err) {
      log.error('Error saving dark mode preference:', err);
    }
  };

  // Load config and default installDir on mount
  useEffect(() => {
    const loadConfigAndPaths = async () => {
      try {
        // Get paths from main process
        let defaultInstallDir = '';
        if (window.electron?.invoke) {
          const res = await window.electron.invoke('eventide:get-paths');
          // Only set installDir if user has already selected a directory
          if (
            res &&
            res.success &&
            res.hasSelectedDir &&
            res.data &&
            res.data.gameRoot
          ) {
            defaultInstallDir = res.data.gameRoot;
            setInstallDir(defaultInstallDir);
          }
          // Otherwise leave installDir as empty string to indicate no selection made
        }
        if (!window.electron?.readConfig) {
          setError('Electron preload API not available.');
          return;
        }
        const result = await window.electron.readConfig();
        if (result.success && result.data) {
          const {
            username: savedUsername,
            password: savedPassword,
            rememberCredentials,
            installDir: savedInstallDir,
            darkMode: savedDarkMode,
          } = result.data;
          setRemember(!!rememberCredentials);
          if (savedDarkMode !== undefined) {
            setDarkMode(!!savedDarkMode);
          }
          if (rememberCredentials && savedUsername) {
            setUsername(savedUsername || '');
            setPassword(savedPassword || '');
          } else {
            setUsername(savedUsername || '');
            setPassword('');
          }
          // Use savedInstallDir if present, else default from IPC
          if (savedInstallDir && typeof savedInstallDir === 'string') {
            setInstallDir(savedInstallDir);
          } else if (defaultInstallDir) {
            setInstallDir(defaultInstallDir);
          }
        }
      } catch (err) {
        log.error('Error loading config or paths:', err);
      }
    };
    loadConfigAndPaths();
  }, []);

  // ...existing code...

  const canPlay = true; // Allow play even if username/password are empty
  const onMinimize = () =>
    window.electron?.windowControls?.minimize &&
    window.electron.windowControls.minimize();
  const onClose = () =>
    window.electron?.windowControls?.close &&
    window.electron.windowControls.close();

  return (
    <HashRouter>
      <div className="launcher-shell">
        <div className="drag-region" />
        <header className="launcher-header">
          {/* window controls live here */}
          <div className="window-controls" aria-label="Window controls">
            <button
              type="button"
              className="win-btn minimize-btn"
              aria-label="Minimize"
              onClick={onMinimize}
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <button
              type="button"
              className="win-btn close-btn"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={20} strokeWidth={3} />
            </button>
          </div>

          <div className="brand">
            <img src={logo} alt="Eventide Logo" className="eventide-slime" />
            <img
              src={titleLogo}
              alt="Eventide"
              className="eventide-title-logo"
            />
          </div>

          <nav className="main-nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <Home size={24} /> HOME
            </NavLink>
            <NavLink
              to="/extensions"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <Puzzle size={24} /> EXTENSIONS
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'is-active' : ''}`
              }
            >
              <Settings size={24} /> SETTINGS
            </NavLink>
            <button
              type="button"
              className="dark-mode-toggle"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={
                darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'
              }
            >
              {darkMode ? <Sun size={23} /> : <Moon size={23} />}
            </button>
            <button
              type="button"
              className="website-link"
              title="Visit Eventide Website"
              onClick={(e) => {
                e.preventDefault();
                window.electron?.openExternal?.(EVENTIDE_WEBSITE_URL);
              }}
            >
              <Globe size={23} />
            </button>
          </nav>
        </header>

        {/* Error display */}
        {error && (
          <div className="error" style={{ color: 'red', margin: '1em' }}>
            {error}
          </div>
        )}

        <GameStateProvider>
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  username={username}
                  setUsername={setUsername}
                  password={password}
                  setPassword={setPassword}
                  remember={remember}
                  setRemember={setRemember}
                  canPlay={canPlay}
                  installDir={installDir}
                />
              }
            />
            <Route path="/extensions" element={<ExtensionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </GameStateProvider>

        <VersionDisplay />
      </div>
    </HashRouter>
  );
}
