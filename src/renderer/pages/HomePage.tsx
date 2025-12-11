import { useEffect, useState, useRef, useCallback } from 'react';
import { siDiscord } from 'simple-icons';
import { fetchPatchNotes } from '../data/feed';
import type { Post } from '../types/feed';
import { useGameState } from '../contexts/GameStateContext';
import { safeInvoke } from '../utils/ipc';
import { formatBytes, formatSpeed, formatTimeRemaining } from '../utils/format';
import log from '../logger';
import { DISCORD_INVITE_URL } from '../../core/constants';

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
  const [, setUpdateStatus] = useState<string>('idle');
  const [, setUpdateInfo] = useState<any>(null);
  const [currentInstallDir, setCurrentInstallDir] =
    useState<string>(installDir);
  const [downloadStartTime, setDownloadStartTime] = useState<number | null>(
    null,
  );
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const cancelDialogRef = useRef<HTMLDivElement | null>(null);

  // Speed tracking state
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<number>(0); // Calculated remaining time (updated every 1 second)
  const lastBytesRef = useRef<number>(0);
  const lastSpeedTimeRef = useRef<number>(Date.now());
  const smoothedSpeedRef = useRef<number>(0); // Exponentially smoothed speed

  // Helper to strip trailing /Game or \Game from a path
  const stripGameSuffix = (path: string) => {
    if (!path) return path;
    return path.replace(/[\\/](Game)$/i, '');
  };

  // Update currentInstallDir when installDir prop changes, stripping /Game or \Game
  useEffect(() => {
    setCurrentInstallDir(stripGameSuffix(installDir));
  }, [installDir]);

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
        log.error('[HomePage] Error loading patch notes:', error);
        // Keep posts as empty array on error
      }
    };
    loadPatchNotes();
  }, []);

  // Focus the cancel dialog when it opens so it can receive keyboard events
  useEffect(() => {
    if (showCancelDialog && cancelDialogRef.current) {
      // focus the dialog element so it receives keyboard events
      cancelDialogRef.current.focus();
    }
  }, [showCancelDialog]);

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

  // Debug: log significant state changes only (not progress updates)
  useEffect(() => {
    // Only log non-progress states to avoid spam during download/extraction
    if (state.status !== 'downloading' && state.status !== 'extracting') {
      log.debug('[HomePage] state changed to:', state.status);
    }
  }, [state.status]);

  // Timer effect for download/extraction duration
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (state.status === 'downloading' || state.status === 'extracting') {
      // Reset timer when transitioning between downloading and extracting (but not from paused)
      if (lastStatus !== state.status && lastStatus !== 'paused') {
        setDownloadStartTime(Date.now());
        setElapsedTime(0);
        setDownloadSpeed(0);
        lastBytesRef.current = 0;
        lastSpeedTimeRef.current = Date.now();
        setLastStatus(state.status);
      } else if (lastStatus === 'paused') {
        // Resuming from pause - adjust start time to account for elapsed time
        setDownloadStartTime(Date.now() - elapsedTime * 1000);
        setLastStatus(state.status);
      }
      // Update elapsed time every second
      interval = setInterval(() => {
        if (downloadStartTime !== null) {
          setElapsedTime(Math.floor((Date.now() - downloadStartTime) / 1000));
        }
      }, 1000);
    } else if (state.status === 'paused') {
      // Paused - keep the elapsed time but stop the timer
      setLastStatus(state.status);
      // Don't reset downloadSpeed - let speed calculation effect preserve it
      // Don't reset downloadStartTime or elapsedTime
    } else {
      // Reset timer when not downloading/extracting/paused
      setDownloadStartTime(null);
      setElapsedTime(0);
      setDownloadSpeed(0);
      setLastStatus(null);
      // Reset isUpdating when we're done
      if (
        state.status === 'ready' ||
        state.status === 'error' ||
        state.status === 'missing'
      ) {
        setIsUpdating(false);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.status, downloadStartTime, lastStatus, elapsedTime]);

  // Helper functions to extract download progress
  const getDownloaded = useCallback(
    (s: typeof state): number | undefined =>
      s.status === 'downloading' || s.status === 'paused'
        ? s.downloaded
        : undefined,
    [],
  );

  const getTotal = useCallback(
    (s: typeof state): number | undefined =>
      s.status === 'downloading' || s.status === 'paused' ? s.total : undefined,
    [],
  );

  // Calculate download speed when progress changes
  useEffect(() => {
    if (state.status === 'downloading') {
      const currentBytes = getDownloaded(state) || 0;
      const now = Date.now();
      const timeDiff = (now - lastSpeedTimeRef.current) / 1000; // in seconds

      if (timeDiff >= 1 && currentBytes > lastBytesRef.current) {
        const bytesDiff = currentBytes - lastBytesRef.current;
        const instantSpeed = bytesDiff / timeDiff;

        // Exponential smoothing: S_t = α * X_t + (1 - α) * S_{t-1}
        // α (alpha) = smoothing factor (0.3 = gives 30% weight to new value, 70% to historical)
        const alpha = 0.3;
        const smoothedSpeed =
          smoothedSpeedRef.current === 0
            ? instantSpeed // First measurement, use instant speed
            : alpha * instantSpeed + (1 - alpha) * smoothedSpeedRef.current;

        smoothedSpeedRef.current = smoothedSpeed;
        setDownloadSpeed(smoothedSpeed);

        // Calculate and store remaining time (updated only at this interval)
        const total = getTotal(state) || 0;
        const remaining = total - currentBytes;
        const timeRemaining = smoothedSpeed > 0 ? remaining / smoothedSpeed : 0;
        setRemainingTime(timeRemaining);

        lastBytesRef.current = currentBytes;
        lastSpeedTimeRef.current = now;
      }
    } else if (state.status === 'paused') {
      // Keep the last known speed for time estimate
      // Don't reset smoothedSpeedRef
    } else {
      // Reset when not downloading/paused
      smoothedSpeedRef.current = 0;
      setDownloadSpeed(0);
      setRemainingTime(0);
    }
  }, [state, getDownloaded, getTotal]);

  // Get remaining time (calculated only when speed updates, not on every render)
  const getRemainingTime = (): number => {
    return remainingTime;
  };

  // Format elapsed time as MM:SS (kept for extraction which shows elapsed)
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Safely read progress from union-typed state
  const getProgress = (s: typeof state): number | undefined => {
    if (
      s.status === 'downloading' ||
      s.status === 'extracting' ||
      s.status === 'paused'
    ) {
      return s.progress;
    }
    return undefined;
  };

  const handleActionClick = async () => {
    log.debug('[HomePage] Play/Action button clicked, state:', state);
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
      } else if (state.status === 'paused') {
        // Resume download
        dispatch({
          type: 'SET',
          state: {
            status: 'downloading',
            progress: getProgress(state) || 0,
            downloaded: getDownloaded(state),
            total: getTotal(state),
          },
        });
        try {
          await safeInvoke('game:resume-download');
          // main should emit game:status based on result
        } catch (err) {
          dispatch({
            type: 'ERROR',
            msg: String(err),
            isRetryable: true,
            lastOperation: 'download',
          });
        }
      } else if (state.status === 'needs-extraction') {
        // Start extraction of existing ZIP
        dispatch({
          type: 'SET',
          state: { status: 'extracting', progress: 0 },
        });
        try {
          await safeInvoke('game:extract');
          // main should emit game:status 'ready' or 'update-available'
        } catch (err) {
          dispatch({
            type: 'ERROR',
            msg: String(err),
            isRetryable: true,
            lastOperation: 'download',
          });
        }
      } else if (state.status === 'update-available') {
        setIsUpdating(true);
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
              log.warn(
                '[HomePage] Failed to write default.txt:',
                scriptResult?.error,
              );
              // Don't block launch on script write failure
            } else {
              log.debug('[HomePage] Successfully wrote default.txt');
            }
          } catch (err) {
            log.warn('[HomePage] Error writing default.txt:', err);
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
            log.error('[HomePage] Launch error:', launchErr);
            dispatch({
              type: 'ERROR',
              msg: String(launchErr),
              isRetryable: false,
            });
          }
        } catch (err) {
          log.error('[HomePage] Ready status error:', err);
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
          setIsUpdating(true);
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
          try {
            const res = await safeInvoke<any>('game:check');
            const { launcherState, latestVersion, installedVersion } =
              res ?? {};
            if (launcherState === 'missing') {
              dispatch({ type: 'SET', state: { status: 'missing' } });
            } else if (launcherState === 'needs-extraction') {
              dispatch({ type: 'SET', state: { status: 'needs-extraction' } });
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
          } catch (checkErr) {
            dispatch({
              type: 'ERROR',
              msg: String(checkErr),
              isRetryable: true,
              lastOperation: 'check',
            });
          }
        }
      }
    } catch (error) {
      log.error('[handleActionClick] Error:', error);
      dispatch({
        type: 'ERROR',
        msg: String(error),
        isRetryable: true,
      });
    }
  };

  const renderLabel = () => {
    // When updating, show simple "Updating..." for both download and extract phases
    if (
      isUpdating &&
      (state.status === 'downloading' || state.status === 'extracting')
    ) {
      return 'Updating...';
    }

    switch (state.status) {
      case 'checking':
        return 'Checking…';
      case 'missing':
        return 'Download';
      case 'needs-extraction':
        return 'Extract';
      case 'downloading':
        return 'Downloading...';
      case 'paused':
        return 'Paused';
      case 'extracting':
        return 'Extracting...';
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
      };
    }

    // HTTP 416 Range Not Satisfiable - resume download issue
    if (msg.includes('416') || msg.includes('range not satisfiable')) {
      return {
        title: 'Download Resume Error',
        message: 'Unable to resume the download from where it left off.',
        suggestions: [
          'Click "Clear Downloads" to start fresh',
          'The partial download may have become corrupted',
          'The server file may have been updated',
        ],
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
    };
  };

  // Handler to select installation directory
  const handleSelectInstallDir = async () => {
    try {
      const result = await (window as any).electron.selectInstallDirectory();
      if (result?.success && result.path) {
        // Strip trailing /Game or \Game for display
        const cleanedPath = stripGameSuffix(result.path);
        const setResult = await (window as any).electron.setInstallDirectory(
          cleanedPath,
        );
        if (setResult?.success) {
          setCurrentInstallDir(cleanedPath);
          handleShowToast('Installation directory updated successfully!');
          // Refresh paths
          const pathsResult = await (window as any).electron.invoke(
            'eventide:get-paths',
          );
          if (pathsResult?.success && pathsResult.data?.gameRoot) {
            setCurrentInstallDir(stripGameSuffix(pathsResult.data.gameRoot));
          }
        } else {
          handleShowToast(
            `Failed to set directory: ${setResult?.error || 'Unknown error'}`,
          );
        }
      } else if (!result?.canceled) {
        handleShowToast(
          `Failed to select directory: ${result?.error || 'Unknown error'}`,
        );
      }
    } catch (err) {
      log.error('Failed to select installation directory:', err);
      handleShowToast(`Error: ${String(err)}`);
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
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
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

          {/* Installation Directory Selector - Only show when missing, not during checking */}
          {state.status === 'missing' && (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                Installation Directory
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: currentInstallDir ? 'var(--muted)' : '#ef4444',
                  marginBottom: 8,
                  opacity: 0.8,
                  fontStyle: currentInstallDir ? 'normal' : 'italic',
                }}
              >
                {currentInstallDir ||
                  'No directory selected - please choose a location below'}
              </div>
              <button
                type="button"
                onClick={handleSelectInstallDir}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  borderRadius: 6,
                  color: '#3b82f6',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                }}
              >
                <span style={{ color: '#3b82f6' }}>
                  Choose Installation Directory
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={`play-btn ${state.status === 'error' ? 'is-error' : ''}`}
            disabled={
              state.status === 'checking' ||
              state.status === 'downloading' ||
              state.status === 'extracting' ||
              state.status === 'launching' ||
              state.status === 'paused' ||
              (state.status === 'ready' && !canPlay) ||
              (state.status === 'missing' && !currentInstallDir)
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {(() => {
                    const d = getDownloaded(state);
                    const t = getTotal(state);
                    if (typeof t === 'number' && t > 0) {
                      return `${formatBytes(d)} / ${formatBytes(t)} (${getProgress(state) ?? 0}%)`;
                    }
                    return `${formatBytes(d)} downloaded`;
                  })()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      opacity: 0.8,
                    }}
                  >
                    {formatSpeed(downloadSpeed)}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Courier New', Courier, monospace",
                      minWidth: '50px',
                      textAlign: 'right',
                    }}
                    title="Time remaining"
                  >
                    {formatTimeRemaining(getRemainingTime())}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        // Just call pause - the main process will send game:status event
                        // with accurate bytesDownloaded/totalBytes from disk
                        await safeInvoke('game:pause-download');
                        // Don't dispatch locally - let the game:status event from main update state
                      } catch (err) {
                        log.error('[HomePage] Pause error:', err);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      fontSize: 16,
                      opacity: 0.7,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.7';
                    }}
                    aria-label="Pause download"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 -960 960 960"
                      fill="#3b82f6"
                      aria-hidden="true"
                    >
                      <path d="M520-200v-560h240v560zm-320 0v-560h240v560zm400-80h80v-400h-80zm-320 0h80v-400h-80zm0-400v400zm320 0v400z" />
                    </svg>
                  </button>
                  {/* Cancel button - only show for base game download, not updates */}
                  {!isUpdating && (
                    <button
                      type="button"
                      onClick={() => setShowCancelDialog(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        fontSize: 16,
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                      }}
                      aria-label="Cancel download"
                      title="Cancel download"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 -960 960 960"
                        fill="#ef4444"
                        aria-hidden="true"
                      >
                        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Paused state progress display */}
          {state.status === 'paused' && (
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
                    background: 'linear-gradient(90deg,#facc15,#eab308)',
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {(() => {
                    const d = getDownloaded(state);
                    const t = getTotal(state);
                    if (typeof t === 'number' && t > 0) {
                      return `Paused: ${formatBytes(d)} / ${formatBytes(t)} (${getProgress(state) ?? 0}%)`;
                    }
                    return `Paused: ${formatBytes(d)} downloaded`;
                  })()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        dispatch({
                          type: 'SET',
                          state: {
                            status: 'downloading',
                            progress: getProgress(state) || 0,
                            downloaded: getDownloaded(state),
                            total: getTotal(state),
                          },
                        });
                        await safeInvoke('game:resume-download');
                      } catch (err) {
                        log.error('[HomePage] Resume error:', err);
                        dispatch({
                          type: 'ERROR',
                          msg: String(err),
                          isRetryable: true,
                          lastOperation: 'download',
                        });
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      fontSize: 16,
                      opacity: 0.7,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.7';
                    }}
                    aria-label="Resume download"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 -960 960 960"
                      fill="#3b82f6"
                      aria-hidden="true"
                    >
                      <path d="M320-200v-560l440 280zm80-146 210-134-210-134z" />
                    </svg>
                  </button>
                  {/* Cancel button - only show for base game download, not updates */}
                  {!isUpdating && (
                    <button
                      type="button"
                      onClick={() => setShowCancelDialog(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        fontSize: 16,
                        opacity: 0.7,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                      }}
                      aria-label="Cancel download"
                      title="Cancel download"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 -960 960 960"
                        fill="#ef4444"
                        aria-hidden="true"
                      >
                        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            </div>
          )}

          {state.status === 'extracting' && (
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
                    background: 'linear-gradient(90deg,#a78bfa,#6366f1)',
                    transition: 'width 200ms linear',
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {(() => {
                    const current =
                      state.status === 'extracting'
                        ? (state as any).current
                        : 0;
                    const total =
                      state.status === 'extracting' ? (state as any).total : 0;
                    if (typeof total === 'number' && total > 0) {
                      return `${current?.toLocaleString() ?? 0} / ${total.toLocaleString()} files (${getProgress(state) ?? 0}%)`;
                    }
                    return `Extracting... ${getProgress(state) ?? 0}%`;
                  })()}
                </span>
                <span
                  style={{
                    fontFamily: "'Courier New', Courier, monospace",
                    minWidth: '50px',
                    textAlign: 'right',
                  }}
                >
                  {formatElapsedTime(elapsedTime)}
                </span>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="error-card">
              <div className="error-header">
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
                      return errorInfo.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ));
                    })()}
                  </ul>
                </div>
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
              href={DISCORD_INVITE_URL}
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
                      color: 'orange',
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

      {/* Cancel download confirmation dialog */}
      {showCancelDialog && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={() => setShowCancelDialog(false)}
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            role="dialog"
            ref={cancelDialogRef}
            tabIndex={-1}
            aria-labelledby="cancel-dialog-title"
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCancelDialog(false);
            }}
          >
            <h3
              id="cancel-dialog-title"
              style={{
                marginTop: 0,
                marginBottom: '16px',
                fontSize: '20px',
                color: '#ffffff',
              }}
            >
              Cancel Download?
            </h3>
            <p
              style={{
                marginBottom: '24px',
                color: 'rgba(255, 255, 255, 0.7)',
                lineHeight: '1.6',
              }}
            >
              Are you sure you want to cancel the download? All progress will be
              lost and you&apos;ll need to start over.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowCancelDialog(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: 'rgba(255, 255, 255, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                }}
              >
                Keep Downloading
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setShowCancelDialog(false);
                    log.info('[HomePage] Canceling download...');
                    await safeInvoke('game:cancel-download');
                    // The main process will send game:status 'missing'
                  } catch (err) {
                    log.error('[HomePage] Cancel download error:', err);
                    dispatch({
                      type: 'ERROR',
                      msg: String(err),
                      isRetryable: true,
                      lastOperation: 'download',
                    });
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                }}
              >
                Cancel Download
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
