import React from 'react';
import { siDiscord } from 'simple-icons';
import samplePosts from '../data/feed';

export type HomePageProps = {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  canPlay: boolean;
};

export default function HomePage({
  username,
  setUsername,
  password,
  setPassword,
  remember,
  setRemember,
  canPlay,
}: HomePageProps) {
  return (
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
  );
}
