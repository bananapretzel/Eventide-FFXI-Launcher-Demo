import React, { useEffect, useReducer } from 'react';
import { siDiscord } from 'simple-icons';
import samplePosts from '../data/feed';

// Check update status on mount
// (moved below imports)

export type HomePageProps = {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  remember: boolean;
  setRemember: (v: boolean) => void;
  canPlay: boolean;
  installDir: string;
};

export default function HomePage(props: HomePageProps) {
  const {
    username,
    setUsername,
    password,
    setPassword,
    remember,
    setRemember,
    canPlay,
    installDir,
  } = props;

  type State =
    | { status: 'checking' }
    | { status: 'missing' }
    | {
        status: 'downloading';
        progress: number;
        downloaded?: number;
        total?: number;
      }
    | {
        status: 'update-available';
        remoteVersion?: string;
        installedVersion?: string;
      }
    | { status: 'ready' }
    | { status: 'launching' }
    | { status: 'error'; message: string };

  type Action =
    | { type: 'CHECK' }
    | { type: 'SET'; state: State }
    | { type: 'PROGRESS'; p: number; downloaded?: number; total?: number }
    | { type: 'ERROR'; msg: string };

  function reducer(_: State, action: Action): State {
    try {
      switch (action.type) {
        case 'CHECK':
          return { status: 'checking' };
        case 'SET':
          return action.state;
        case 'PROGRESS':
          return {
            status: 'downloading',
            progress: action.p,
            downloaded: action.downloaded,
            total: action.total,
          };
        case 'ERROR':
          return { status: 'error', message: action.msg };
        default:
          return { status: 'checking' };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[HomePage reducer] Error:', err, action);
      return { status: 'error', message: String(err) };
    }
  }
  const [state, dispatch] = useReducer(reducer, { status: 'checking' });

  // Debug: log state and button status
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[HomePage] state:',
      state,
      'canPlay:',
      canPlay,
      'disabled:',
      state.status === 'checking' ||
        state.status === 'downloading' ||
        state.status === 'launching',
    );
  }, [state, canPlay]);

  // Helper: safe invoke that prefers window.electron.invoke if available,
  // otherwise falls back to ipcRenderer.sendMessage + once-reply pattern.
  const safeInvoke = async (channel: string, ...args: unknown[]) => {
    const anyWin: any = window as any;
    const { electron } = anyWin;
    if (!electron) {
      throw new Error('IPC not available');
    }

    // Prefer direct invoke if preload exposes it
    if (typeof electron.invoke === 'function') {
      return electron.invoke(channel, ...args);
    }

    // Fallback: use ipcRenderer.sendMessage and wait for a reply on `${channel}:reply`
    const ipc = electron.ipcRenderer;
    if (
      !ipc ||
      typeof ipc.sendMessage !== 'function' ||
      typeof ipc.once !== 'function'
    ) {
      throw new Error('No suitable IPC invoke method available');
    }

    const replyChannel = `${channel}:reply`;
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      let finished = false;

      const handler = (_ev: any, payload: any) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve(payload);
      };

      timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        reject(new Error('IPC invoke timed out'));
      }, 10000);

      ipc.once(replyChannel, handler);
      try {
        ipc.sendMessage(channel, args);
      } catch (err) {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          reject(err);
        }
      }
    });
  };

  // Safely read progress from union-typed state
  const getProgress = (s: State): number | undefined =>
    s.status === 'downloading' ? s.progress : undefined;

  const getDownloaded = (s: State): number | undefined =>
    s.status === 'downloading' ? s.downloaded : undefined;

  const getTotal = (s: State): number | undefined =>
    s.status === 'downloading' ? s.total : undefined;

  const formatBytes = (n?: number) => {
    if (!n || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let val = n;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx += 1;
    }
    return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  useEffect(() => {
    let unsubProgress: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;
    try {
      const doCheck = async () => {
        dispatch({ type: 'CHECK' });
        try {
          const res = await safeInvoke('game:check');
          const { launcherState, latestVersion, installedVersion } = res ?? {};
          if (launcherState === 'missing') {
            dispatch({ type: 'SET', state: { status: 'missing' } });
          } else if (launcherState === 'update-available') {
            dispatch({
              type: 'SET',
              state: {
                status: 'update-available',
                remoteVersion: latestVersion,
                installedVersion,
              },
            });
          } else if (launcherState === 'ready') {
            dispatch({ type: 'SET', state: { status: 'ready' } });
          } else {
            dispatch({ type: 'SET', state: { status: 'missing' } });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[HomePage useEffect] doCheck error:', err);
          dispatch({ type: 'ERROR', msg: String(err) });
        }
      };

      // subscribe to progress/status events (main should send these)
      try {
        const { electron } = window as any;
        const ipc = electron?.ipcRenderer;
        if (ipc && typeof ipc.on === 'function') {
          unsubProgress = ipc.on(
            'download:progress',
            (_ev: any, payload: any) => {
              try {
                // debug log incoming progress payload
                // eslint-disable-next-line no-console
                console.log('[renderer] received download:progress', payload);
                const { dl, total } = payload ?? {};
                const percent = total ? Math.round((dl / total) * 100) : 0;
                dispatch({
                  type: 'PROGRESS',
                  p: percent,
                  downloaded: dl,
                  total,
                });
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error(
                  '[HomePage useEffect] download:progress handler error:',
                  err,
                );
              }
            },
          );

          unsubStatus = ipc.on('game:status', (_ev: any, payload: any) => {
            try {
              const { status, remoteVersion, installedVersion, message } =
                payload ?? {};
              // payload.status: 'downloaded'|'ready'|'error'|'launching' etc.
              if (status === 'downloaded' || status === 'ready') {
                dispatch({ type: 'SET', state: { status: 'ready' } });
              } else if (status === 'error') {
                dispatch({ type: 'ERROR', msg: message ?? 'Unknown error' });
              } else if (status === 'update-available') {
                dispatch({
                  type: 'SET',
                  state: {
                    status: 'update-available',
                    remoteVersion,
                    installedVersion,
                  },
                });
              }
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(
                '[HomePage useEffect] game:status handler error:',
                err,
              );
            }
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[HomePage useEffect] subscription error:', err);
      }

      doCheck();

      return () => {
        try {
          if (typeof unsubProgress === 'function') {
            unsubProgress();
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[HomePage useEffect] unsubProgress error:', err);
        }
        try {
          if (typeof unsubStatus === 'function') {
            unsubStatus();
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[HomePage useEffect] unsubStatus error:', err);
        }
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[HomePage useEffect] outer error:', err);
    }
    return undefined;
  }, []);

  const handleActionClick = async () => {
    console.log('[HomePage] Play/Action button clicked, state:', state);
    try {
      if (state.status === 'missing') {
        // start download
        dispatch({
          type: 'SET',
          state: { status: 'downloading', progress: 0 },
        });
        await safeInvoke('game:download');
        // main should emit game:status 'downloaded' -> ready
      } else if (state.status === 'update-available') {
        dispatch({
          type: 'SET',
          state: { status: 'downloading', progress: 0 },
        });
        await safeInvoke('game:update');
        // Fallback: if main does not emit game:status 'ready', set it here
        dispatch({ type: 'SET', state: { status: 'ready' } });
      } else if (state.status === 'ready') {
        // save credentials and update INI before launching
        await (window as any).electron.writeConfig({
          username: remember ? username : '',
          password: remember ? password : '',
          rememberCredentials: remember,
        });

        const updateResult = await (
          window as any
        ).electron.updateIniCredentials(username, password, installDir);
        if (!updateResult?.success) {
          dispatch({
            type: 'ERROR',
            msg: updateResult?.error ?? 'Failed to update INI',
          });
          return;
        }

        dispatch({ type: 'SET', state: { status: 'launching' } });
        await safeInvoke('game:launch');
        // main can emit status if needed
      } else if (state.status === 'error') {
        // on error, re-check when user clicks retry
        dispatch({ type: 'CHECK' });
        await safeInvoke('game:check');
      }
    } catch (err) {
      dispatch({ type: 'ERROR', msg: String(err) });
    }
  };

  const renderLabel = () => {
    switch (state.status) {
      case 'checking':
        return 'Checking…';
      case 'missing':
        return 'Download';
      case 'downloading':
        return `Downloading ${getProgress(state) ?? 0}%`;
      case 'update-available':
        return 'Update';
      case 'ready':
        return 'Play';
      case 'launching':
        return 'Launching…';
      case 'error':
        return 'Retry';
      default:
        return 'Play';
    }
  };

  // Only require credentials for Play, not for Update/Download
  // (button 'disabled' prop is computed inline below)

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

          <button
            type="button"
            className="play-btn"
            disabled={
              state.status === 'checking' ||
              state.status === 'downloading' ||
              state.status === 'launching' ||
              (state.status === 'ready' && !canPlay)
            }
            onClick={handleActionClick}
          >
            {renderLabel()}
          </button>

          {state.status === 'downloading' && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  width: '100%',
                  height: 10,
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
                aria-hidden
              >
                <div
                  style={{
                    width: `${getProgress(state) ?? 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg,#6ee7b7,#3b82f6)',
                    transition: 'width 200ms linear',
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--muted)',
                }}
              >
                {(() => {
                  const d = getDownloaded(state);
                  const t = getTotal(state);
                  if (typeof t === 'number' && t > 0) {
                    return `${formatBytes(d)} / ${formatBytes(t)} (${getProgress(state) ?? 0}%)`;
                  }
                  return `${formatBytes(d)} downloaded`;
                })()}
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div style={{ color: 'var(--danger)', marginTop: 8 }}>
              {(state as any).message}
            </div>
          )}
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
          {(samplePosts || []).map((p) => (
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
