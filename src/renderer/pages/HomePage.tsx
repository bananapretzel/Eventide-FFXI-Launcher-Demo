import React, { useEffect, useReducer, useState } from 'react';
import { siDiscord } from 'simple-icons';
import { fetchPatchNotes } from '../data/feed';
import type { Post } from '../types/feed';

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
        status: 'extracting';
        progress: number;
        current?: number;
        total?: number;
      }
    | {
        status: 'update-available';
        remoteVersion?: string;
        installedVersion?: string;
      }
    | { status: 'ready' }
    | { status: 'launching' }
    | {
        status: 'error';
        message: string;
        isRetryable?: boolean;
        lastOperation?: 'download' | 'update' | 'check';
      };

  type Action =
    | { type: 'CHECK' }
    | { type: 'SET'; state: State }
    | { type: 'PROGRESS'; p: number; downloaded?: number; total?: number }
    | { type: 'EXTRACT_PROGRESS'; p: number; current?: number; total?: number }
    | {
        type: 'ERROR';
        msg: string;
        isRetryable?: boolean;
        lastOperation?: 'download' | 'update' | 'check';
      };

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
        case 'EXTRACT_PROGRESS':
          return {
            status: 'extracting',
            progress: action.p,
            current: action.current,
            total: action.total,
          };
        case 'ERROR':
          return {
            status: 'error',
            message: action.msg,
            isRetryable: action.isRetryable,
            lastOperation: action.lastOperation,
          };
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
  const [posts, setPosts] = useState<Post[]>([]);

  // Fetch patch notes on mount
  useEffect(() => {
    const loadPatchNotes = async () => {
      try {
        const patchNotes = await fetchPatchNotes();
        setPosts(patchNotes);
      } catch (error) {
        console.error('[HomePage] Error loading patch notes:', error);
        // Keep posts as empty array on error
      }
    };
    loadPatchNotes();
  }, []);

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
  const getProgress = (s: State): number | undefined => {
    if (s.status === 'downloading' || s.status === 'extracting') {
      return s.progress;
    }
    return undefined;
  };

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
    let unsubExtract: (() => void) | undefined;

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

          // Add extraction progress listener
          unsubExtract = ipc.on(
            'extract:progress',
            (_ev: any, payload: any) => {
              try {
                // eslint-disable-next-line no-console
                console.log('[renderer] received extract:progress', payload);
                const { current, total } = payload ?? {};
                const percent = total ? Math.round((current / total) * 100) : 0;
                dispatch({
                  type: 'EXTRACT_PROGRESS',
                  p: percent,
                  current,
                  total,
                });
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error(
                  '[HomePage useEffect] extract:progress handler error:',
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
                dispatch({
                  type: 'ERROR',
                  msg: message ?? 'Unknown error',
                  isRetryable: true,
                });
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
          if (typeof unsubExtract === 'function') {
            unsubExtract();
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[HomePage useEffect] unsubExtract error:', err);
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
        try {
          await safeInvoke('game:download');
          // main should emit game:status 'downloaded' -> ready
        } catch (err) {
          dispatch({
            type: 'ERROR',
            msg: String(err),
            isRetryable: true,
            lastOperation: 'download',
          });
        }
      } else if (state.status === 'update-available') {
        dispatch({
          type: 'SET',
          state: { status: 'downloading', progress: 0 },
        });
        try {
          await safeInvoke('game:update');
          // Fallback: if main does not emit game:status 'ready', set it here
          dispatch({ type: 'SET', state: { status: 'ready' } });
        } catch (err) {
          dispatch({
            type: 'ERROR',
            msg: String(err),
            isRetryable: true,
            lastOperation: 'update',
          });
        }
      } else if (state.status === 'ready') {
        // save credentials and update INI before launching
        const writeResult = await (window as any).electron.writeConfig({
          username: remember ? username : '',
          password: remember ? password : '',
          rememberCredentials: remember,
        });
        if (!writeResult?.success) {
          dispatch({
            type: 'ERROR',
            msg:
              writeResult?.error ||
              'Failed to save credentials. Please check your system keychain and try again.',
            isRetryable: false,
          });
          return;
        }

        const updateResult = await (
          window as any
        ).electron.updateIniCredentials(username, password, installDir);
        if (!updateResult?.success) {
          dispatch({
            type: 'ERROR',
            msg: updateResult?.error ?? 'Failed to update INI',
            isRetryable: false,
          });
          return;
        }

        // Write default.txt script with enabled addons and plugins
        try {
          const scriptResult = await (
            window as any
          ).electron.writeDefaultScript();
          if (!scriptResult?.success) {
            // eslint-disable-next-line no-console
            console.warn(
              '[HomePage] Failed to write default.txt:',
              scriptResult?.error,
            );
            // Don't block launch on script write failure
          } else {
            // eslint-disable-next-line no-console
            console.log('[HomePage] Successfully wrote default.txt');
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[HomePage] Error writing default.txt:', err);
          // Don't block launch on script write failure
        }

        dispatch({ type: 'SET', state: { status: 'launching' } });

        // Check if we should close launcher on game run
        try {
          const settingsResult = await (window as any).electron.readSettings();
          if (
            settingsResult?.success &&
            settingsResult?.data?.launcher?.closeOnRun
          ) {
            // Launch game and close launcher after a brief delay
            await safeInvoke('game:launch');
            setTimeout(() => {
              (window as any).electron?.windowControls?.close?.();
            }, 1000);
          } else {
            // Just launch without closing
            await safeInvoke('game:launch');
          }
        } catch {
          // If settings read fails, just launch normally
          await safeInvoke('game:launch');
        }
        // main can emit status if needed
      } else if (state.status === 'error') {
        // Retry the last failed operation
        if (state.lastOperation === 'download') {
          dispatch({
            type: 'SET',
            state: { status: 'downloading', progress: 0 },
          });
          try {
            await safeInvoke('game:download');
          } catch (err) {
            dispatch({
              type: 'ERROR',
              msg: String(err),
              isRetryable: true,
              lastOperation: 'download',
            });
          }
        } else if (state.lastOperation === 'update') {
          dispatch({
            type: 'SET',
            state: { status: 'downloading', progress: 0 },
          });
          try {
            await safeInvoke('game:update');
            dispatch({ type: 'SET', state: { status: 'ready' } });
          } catch (err) {
            dispatch({
              type: 'ERROR',
              msg: String(err),
              isRetryable: true,
              lastOperation: 'update',
            });
          }
        } else {
          // Default: re-check status
          dispatch({ type: 'CHECK' });
          await safeInvoke('game:check');
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[handleActionClick] Error:', error);
      dispatch({
        type: 'ERROR',
        msg: String(error),
        isRetryable: true,
      });
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
      case 'extracting':
        return `Extracting ${getProgress(state) ?? 0}%`;
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
              value={username ?? ''}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="field">
            <input
              id="password"
              type="password"
              placeholder="Password"
              value={password ?? ''}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <label className="checkbox" htmlFor="remember-checkbox">
            <input
              id="remember-checkbox"
              type="checkbox"
              checked={!!remember}
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
      </section>

      <section className="news-section">
        <div className="news-header">
          <h2 className="section-title">PATCH UPDATES</h2>
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
          {(posts || []).map((p) => {
            // Calculate days old if timestamp exists
            let daysOld: number | null = null;
            if (p.timestamp) {
              const postDate = new Date(p.timestamp);
              const now = new Date();
              const diffMs = now.getTime() - postDate.getTime();
              daysOld = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            }

            return (
              <article key={p.id} className="post" style={{ position: 'relative' }}>
                {daysOld !== null && daysOld <= 7 && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '12px',
                    fontSize: '0.7em',
                    color: '#10b981',
                    fontWeight: 'bold',
                    opacity: 0.8
                  }}>
                    {daysOld === 0 ? 'New!' : `${daysOld} day${daysOld === 1 ? '' : 's'} old!`}
                  </div>
                )}
                <h3 className="post-title" style={{ fontSize: '0.95em' }}>
                  {p.title}
                  {p.author && (
                    <span style={{ color: '#ef4444' }}> - {p.author}</span>
                  )}
                </h3>
                <p className="post-body">{p.body}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
