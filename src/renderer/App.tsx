import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Home, Puzzle, Settings, Minus, X } from 'lucide-react';
import './App.css';
import logo from '../../assets/slime2.png';
import titleLogo from '../../assets/eventide-logo.png';
import HomePage from './pages/HomePage';
import ExtensionsPage from './pages/ExtensionsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installDir, setInstallDir] = useState<string>(''); // will be set from IPC

  // Play button handler
  const handlePlay = async () => {
    try {
      if (!window.electron?.launchGame) {
        setError('Electron preload API not available.');
        return;
      }
      await window.electron.launchGame(installDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error launching game:', err);
      setError('Failed to launch game.');
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
          if (res && res.success && res.data && res.data.gameRoot) {
            defaultInstallDir = res.data.gameRoot;
            setInstallDir(defaultInstallDir);
          }
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
          } = result.data;
          if (rememberCredentials) {
            setUsername(savedUsername || '');
            setPassword(savedPassword || '');
          }
          setRemember(rememberCredentials);
          // Use savedInstallDir if present, else default from IPC
          if (savedInstallDir && typeof savedInstallDir === 'string') {
            setInstallDir(savedInstallDir);
          } else if (defaultInstallDir) {
            setInstallDir(defaultInstallDir);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading config or paths:', err);
      }
    };
    loadConfigAndPaths();
  }, []);

  // Save config when credentials or remember state changes
  useEffect(() => {
    const saveConfig = async () => {
      try {
        if (!window.electron?.writeConfig) {
          setError('Electron preload API not available.');
          return;
        }
        // Only save password if remember is true
        await window.electron.writeConfig({
          username: remember ? username : '',
          password: remember ? password : '',
          rememberCredentials: remember,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error saving config:', err);
      }
    };

    // Only save if we have some user interaction (not initial load)
    if (username || password || !remember) {
      saveConfig();
    }
  }, [username, password, remember]);

  const canPlay = true; // Allow play even if username/password are empty
  const onMinimize = () =>
    window.electron?.windowControls?.minimize &&
    window.electron.windowControls.minimize();
  const onClose = () =>
    window.electron?.windowControls?.close &&
    window.electron.windowControls.close();

  return (
    <div className="launcher">
      <HashRouter>
        <div className="launcher-shell">
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
            </nav>
          </header>

          {/* Error display */}
          {error && (
            <div className="error" style={{ color: 'red', margin: '1em' }}>
              {error}
            </div>
          )}

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
        </div>
      </HashRouter>
    </div>
  );
}
