import React, { useEffect, useState, useCallback } from 'react';
import { siDiscord } from 'simple-icons';
import { fetchPatchNotes } from '../data/feed';
import type { Post } from '../types/feed';
import { useGameState } from '../contexts/GameStateContext';
import { safeInvoke } from '../utils/ipc';
import { formatBytes } from '../utils/format';

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

  // Use the shared game state from context
  const { state, dispatch } = useGameState();
  const [posts, setPosts] = useState<Post[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState<string>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  // Toast helper function
  const handleShowToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

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

  // Listen for launcher update events
  useEffect(() => {
    if (!window.electron?.launcherUpdate?.onUpdateEvent) {
      return () => {}; // Return empty cleanup function
    }

    const cleanup = window.electron.launcherUpdate.onUpdateEvent(
      (_event, payload) => {
        switch (payload.status) {
          case 'checking':
            setUpdateStatus('checking');
            break;
          case 'update-available':
            setUpdateStatus('available');
            setUpdateInfo(payload.info);
            handleShowToast(
              payload.message ||
                `New launcher update available: ${payload.info?.version || 'Unknown'}`,
            );
            break;
          case 'up-to-date':
            setUpdateStatus('up-to-date');
            handleShowToast(payload.message || 'Launcher is up to date!');
            break;
          case 'downloading':
            setUpdateStatus('downloading');
            break;
          case 'downloaded':
            setUpdateStatus('downloaded');
            handleShowToast(
              payload.message ||
                'Update downloaded! Go to Settings to install.',
            );
            break;
          case 'error':
            setUpdateStatus('error');
            handleShowToast(
              payload.message || `Update error: ${payload.error}`,
            );
            break;
          default:
            break;
        }
      },
    );

    return cleanup;
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

  // Safely read progress from union-typed state
  const getProgress = (s: typeof state): number | undefined => {
    if (s.status === 'downloading' || s.status === 'extracting') {
      return s.progress;
    }
    return undefined;
  };

  const getDownloaded = (s: typeof state): number | undefined =>
    s.status === 'downloading' ? s.downloaded : undefined;

  const getTotal = (s: typeof state): number | undefined =>
    s.status === 'downloading' ? s.total : undefined;

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
        try {
          // Validate password for forbidden characters: dash, hash, and space
          const forbiddenChars = [];
          if (password) {
            if (password.includes('-')) forbiddenChars.push('dash (-)');
            if (password.includes('#')) forbiddenChars.push('hash (#)');
            if (password.includes(' ')) forbiddenChars.push('space');
          }

          if (forbiddenChars.length > 0) {
            const charList = forbiddenChars.join(', ');
            const confirmed = window.confirm(
              `WARNING: Your password contains forbidden character(s): ${charList}.\n\n` +
                'These characters may cause the game to crash on launch due to command-line parsing issues.\n\n' +
                'It is strongly recommended to change your password to one without these characters.\n\n' +
                'Do you want to proceed anyway?',
            );
            if (!confirmed) {
              return; // User cancelled, don't launch
            }
          }

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

          // Launch game and close launcher after a brief delay
          try {
            await safeInvoke('game:launch');
            setTimeout(() => {
              (window as any).electron?.windowControls?.close?.();
            }, 1000);
          } catch (launchErr) {
            // eslint-disable-next-line no-console
            console.error('[HomePage] Launch error:', launchErr);
            dispatch({
              type: 'ERROR',
              msg: String(launchErr),
              isRetryable: false,
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[HomePage] Ready status error:', err);
          dispatch({
            type: 'ERROR',
            msg: String(err),
            isRetryable: false,
          });
        }
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
        return '⚠️ Retry';
      default:
        return 'Play';
    }
  };

  // Helper to categorize error messages and provide suggestions
  const categorizeError = (errorMsg: string) => {
    const msg = errorMsg.toLowerCase();

    // Network errors
    if (
      msg.includes('network') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('server is offline') ||
      msg.includes('unreachable')
    ) {
      return {
        title: 'Network Error',
        message: 'Unable to connect to the download server.',
        suggestions: [
          'Check your internet connection',
          'Verify your firewall is not blocking the launcher',
          'Server may be temporarily offline',
          'Try again in a few minutes',
        ],
        icon: '🌐',
      };
    }

    // SHA256/Verification errors
    if (
      msg.includes('sha256') ||
      msg.includes('checksum') ||
      msg.includes('verification') ||
      msg.includes('size mismatch')
    ) {
      return {
        title: 'Download Corrupted',
        message: 'The downloaded file failed verification.',
        suggestions: [
          'The download may have been interrupted',
          'Try clearing downloads and downloading again',
          'Check available disk space',
        ],
        icon: '🔍',
      };
    }

    // Extraction errors
    if (msg.includes('extract') || msg.includes('unzip')) {
      return {
        title: 'Extraction Failed',
        message: 'Failed to extract game files.',
        suggestions: [
          'The archive may be corrupted',
          'Ensure you have enough disk space',
          'Check that antivirus is not blocking extraction',
          'Try clearing downloads and re-downloading',
        ],
        icon: '📦',
      };
    }

    // Disk space errors
    if (
      msg.includes('enospc') ||
      msg.includes('disk') ||
      msg.includes('space')
    ) {
      return {
        title: 'Insufficient Disk Space',
        message: 'Not enough free space on your drive.',
        suggestions: [
          'Free up at least 10 GB of disk space',
          'Choose a different installation directory',
        ],
        icon: '💾',
      };
    }

    // Permission errors
    if (
      msg.includes('eacces') ||
      msg.includes('eperm') ||
      msg.includes('permission')
    ) {
      return {
        title: 'Permission Denied',
        message: 'The launcher does not have permission to write files.',
        suggestions: [
          'Run the launcher as administrator',
          'Check folder permissions',
          'Choose a different installation directory',
        ],
        icon: '🔒',
      };
    }

    // Patch errors
    if (msg.includes('patch')) {
      return {
        title: 'Patching Failed',
        message: 'Failed to apply game patches.',
        suggestions: [
          'Try using "Reapply Patches" in Settings',
          'Check your internet connection',
          'Contact support if the issue persists',
        ],
        icon: '🔧',
      };
    }

    // Default error
    return {
      title: 'Error',
      message: errorMsg,
      suggestions: [
        'Try the operation again',
        'Check the log file for details',
        'Contact support if the issue persists',
      ],
      icon: '⚠️',
    };
  };

  // Handler to clear downloads and reset state
  const handleClearDownloads = async () => {
    try {
      const result = await (window as any).electron.invoke('clear-downloads');
      if (result?.success) {
        dispatch({ type: 'SET', state: { status: 'missing' } });
      } else {
        dispatch({
          type: 'ERROR',
          msg: result?.error || 'Failed to clear downloads',
          isRetryable: true,
        });
      }
    } catch (err) {
      dispatch({
        type: 'ERROR',
        msg: String(err),
        isRetryable: true,
      });
    }
  };

  // Handler to open log file
  const handleOpenLog = async () => {
    try {
      await (window as any).electron.invoke('open-log-file');
    } catch (err) {
      console.error('Failed to open log file:', err);
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
            className={`play-btn ${state.status === 'error' ? 'is-error' : ''}`}
            disabled={
              state.status === 'checking' ||
              state.status === 'downloading' ||
              state.status === 'extracting' ||
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
            <div className="error-card">
              <div className="error-header">
                <div className="error-icon">
                  {(() => {
                    const errorInfo = categorizeError(
                      (state as any).message || 'Unknown error',
                    );
                    return errorInfo.icon;
                  })()}
                </div>
                <div className="error-content">
                  <h4 className="error-title">
                    {(() => {
                      const errorInfo = categorizeError(
                        (state as any).message || 'Unknown error',
                      );
                      return errorInfo.title;
                    })()}
                  </h4>
                  <p className="error-message">
                    {(() => {
                      const errorInfo = categorizeError(
                        (state as any).message || 'Unknown error',
                      );
                      return errorInfo.message;
                    })()}
                  </p>
                  <ul className="error-suggestions">
                    {(() => {
                      const errorInfo = categorizeError(
                        (state as any).message || 'Unknown error',
                      );
                      return errorInfo.suggestions.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ));
                    })()}
                  </ul>
                </div>
              </div>
              <div className="error-actions">
                <button
                  type="button"
                  className="error-btn"
                  onClick={handleActionClick}
                >
                  Retry Now
                </button>
                <button
                  type="button"
                  className="error-btn secondary"
                  onClick={handleClearDownloads}
                >
                  Clear Downloads
                </button>
                <button
                  type="button"
                  className="error-btn secondary"
                  onClick={handleOpenLog}
                >
                  View Log
                </button>
              </div>
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
              <article
                key={p.id}
                className="post"
                style={{ position: 'relative' }}
              >
                {daysOld !== null && daysOld <= 7 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '12px',
                      fontSize: '0.7em',
                      color: '#10b981',
                      fontWeight: 'bold',
                      opacity: 0.8,
                    }}
                  >
                    {daysOld === 0
                      ? 'New!'
                      : `${daysOld} day${daysOld === 1 ? '' : 's'} old!`}
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

      {/* Toast notification positioned at bottom right */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            zIndex: 10000,
            maxWidth: '400px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            animation: 'fadeIn 0.3s ease-in',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        >
          {toastMessage}
        </div>
      )}
    </main>
  );
}
