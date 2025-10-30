import React, { useState } from 'react';
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

  const canPlay = username.trim().length > 0 && password.trim().length > 0;
  const onMinimize = () => window.electron?.windowControls?.minimize();
  const onClose = () => window.electron?.windowControls?.close();

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
