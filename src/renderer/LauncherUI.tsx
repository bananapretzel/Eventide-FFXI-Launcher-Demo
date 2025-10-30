import React, { useState } from 'react';
import { siDiscord } from 'simple-icons';
import './LauncherUI.css';
import { Home, Puzzle, Settings, Minus, X } from 'lucide-react';
import logo from '../../assets/slime2.png';
import titleLogo from '../../assets/eventide-logo.png';

type Post = {
  id: string;
  title: string;
  body: string;
};

const samplePosts: Post[] = [
  {
    id: '1',
    title: 'Lorem ipsum',
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer euismod, estda avet fultue vitacies amn ecu. Masque eleifeila lectus ultricies nec.',
  },
  {
    id: '2',
    title: 'Lorem ipsum',
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer euismod estda avet fultue vitacies sem ecu. Masque eleifend lectus ultricies nec.',
  },
  {
    id: '3',
    title: 'Lorem ipsum',
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer ipsum lor ortit amet, consectetuer ultriceing aliqusan.',
  },
  {
    id: '4',
    title: 'New Update Available',
    body: 'A new version of the client is available for download. This update includes performance improvements and bug fixes. Please restart your launcher to apply the changes.',
  },
  {
    id: '5',
    title: 'Community Spotlight',
    body: 'This week we are featuring some amazing community creations. Check out the new "Creations" tab in the extensions menu to see what your fellow players have been up to!',
  },
  {
    id: '6',
    title: 'Scheduled Maintenance',
    body: 'We will be performing scheduled maintenance on our servers this Friday. The game will be unavailable from 2:00 AM to 4:00 AM UTC. We apologize for any inconvenience.',
  },
];

export default function LauncherUI() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  const canPlay = username.trim().length > 0 && password.trim().length > 0;

  return (
    <div className="launcher">
      <div className="launcher-shell">
        <header className="launcher-header">
          {/* window controls live here */}
          <div className="window-controls" aria-label="Window controls">
            <button
              type="button"
              className="win-btn minimize-btn"
              aria-label="Minimize"
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <button
              type="button"
              className="win-btn close-btn"
              aria-label="Close"
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
            <a href="#home" className="nav-link is-active">
              <Home size={24} /> HOME
            </a>
            <a href="#Extensions" className="nav-link">
              <Puzzle size={24} /> EXTENSIONS
            </a>
            <a href="#settings" className="nav-link">
              <Settings size={24} /> SETTINGS
            </a>
          </nav>
        </header>

        <main className="launcher-main">
          <section className="login-section">
            <div className="login-card">
              <h2 className="section-title">ACCOUNT LOGIN</h2>
              <div className="field">
                <input
                  id="username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <label className="checkbox" htmlFor="remember-checkbox">
                <input
                  id="remember-checkbox"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember credentials</span>
              </label>

              <button type="button" className="play-btn" disabled={!canPlay}>
                PLAY
              </button>
            </div>
            <div className="players-online">1234 PLAYERS ONLINE</div>
          </section>

          <section className="news-section">
            <div className="news-header">
              <h2 className="section-title">LATEST NEWS</h2>
              <div className="social-links">
                <a
                  href="https://discord.gg/vT4UQU8z"
                  className="social-btn"
                  title="Discord"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Discord"
                >
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                  >
                    <title>Discord</title>
                    <path fill="currentColor" d={siDiscord.path} />
                  </svg>
                </a>
              </div>
            </div>
            <div className="feed">
              {samplePosts.map((p) => (
                <article key={p.id} className="post">
                  <h3 className="post-title">{p.title}</h3>
                  <p className="post-body">{p.body}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
