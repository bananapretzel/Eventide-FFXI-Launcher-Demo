import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { safeInvoke } from '../utils/ipc';
import log from '../logger';

export type GameState =
  | { status: 'checking' }
  | { status: 'missing' }
  | { status: 'needs-extraction' }
  | {
      status: 'downloading';
      progress: number;
      downloaded?: number;
      total?: number;
    }
  | {
      status: 'paused';
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

export type GameAction =
  | { type: 'CHECK' }
  | { type: 'SET'; state: GameState }
  | { type: 'PROGRESS'; p: number; downloaded?: number; total?: number }
  | { type: 'EXTRACT_PROGRESS'; p: number; current?: number; total?: number }
  | { type: 'PAUSE'; p: number; downloaded?: number; total?: number }
  | {
      type: 'ERROR';
      msg: string;
      isRetryable?: boolean;
      lastOperation?: 'download' | 'update' | 'check';
    };

interface GameStateContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

function gameReducer(_: GameState, action: GameAction): GameState {
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
      case 'PAUSE':
        return {
          status: 'paused',
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
    log.error('[GameStateContext reducer] Error:', err, action);
    return { status: 'error', message: String(err) };
  }
}

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, { status: 'checking' });

  useEffect(() => {
    let unsubProgress: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;
    let unsubExtract: (() => void) | undefined;

    const doCheck = async () => {
      dispatch({ type: 'CHECK' });
      try {
        // First check if there's a resumable download
        const resumable = await safeInvoke<any>('game:check-resumable');
        if (resumable?.hasResumable) {
          log.info('[GameStateProvider] Found resumable download:', resumable);
          dispatch({
            type: 'PAUSE',
            p: resumable.percentComplete || 0,
            downloaded: resumable.bytesDownloaded,
            total: resumable.totalBytes,
          });
          return;
        }

        const res = await safeInvoke<any>('game:check');
        const { launcherState, latestVersion, installedVersion } = res ?? {};
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
      } catch (err) {
        log.error('[GameStateProvider] doCheck error:', err);
        dispatch({ type: 'ERROR', msg: String(err) });
      }
    };

    try {
      const { electron } = window as any;
      const ipc = electron?.ipcRenderer;
      if (ipc && typeof ipc.on === 'function') {
        unsubProgress = ipc.on(
          'download:progress',
          (_ev: any, payload: any) => {
            try {
              const { dl, total } = payload ?? {};
              const percent = total ? Math.round((dl / total) * 100) : 0;
              dispatch({
                type: 'PROGRESS',
                p: percent,
                downloaded: dl,
                total,
              });
            } catch (err) {
              log.error(
                '[GameStateProvider] download:progress handler error:',
                err,
              );
            }
          },
        );

        unsubExtract = ipc.on(
          'extract:progress',
          (_ev: any, payload: any) => {
            try {
              const { current, total } = payload ?? {};
              const percent = total ? Math.round((current / total) * 100) : 0;
              dispatch({
                type: 'EXTRACT_PROGRESS',
                p: percent,
                current,
                total,
              });
            } catch (err) {
              log.error(
                '[GameStateProvider] extract:progress handler error:',
                err,
              );
            }
          },
        );

        unsubStatus = ipc.on('game:status', (_ev: any, payload: any) => {
          try {
            const { status, remoteVersion, installedVersion, message, bytesDownloaded, totalBytes } =
              payload ?? {};
            if (status === 'downloaded' || status === 'ready') {
              dispatch({ type: 'SET', state: { status: 'ready' } });
            } else if (status === 'paused') {
              // Handle paused status from main process
              const progress = totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
              dispatch({
                type: 'PAUSE',
                p: progress,
                downloaded: bytesDownloaded,
                total: totalBytes,
              });
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
            } else if (status === 'missing') {
              dispatch({ type: 'SET', state: { status: 'missing' } });
            }
          } catch (err) {
            log.error(
              '[GameStateProvider] game:status handler error:',
              err,
            );
          }
        });
      }
    } catch (err) {
      log.error('[GameStateProvider] subscription error:', err);
    }

    doCheck();

    return () => {
      try {
        if (typeof unsubProgress === 'function') {
          unsubProgress();
        }
      } catch (err) {
        log.error('[GameStateProvider] unsubProgress error:', err);
      }
      try {
        if (typeof unsubExtract === 'function') {
          unsubExtract();
        }
      } catch (err) {
        log.error('[GameStateProvider] unsubExtract error:', err);
      }
      try {
        if (typeof unsubStatus === 'function') {
          unsubStatus();
        }
      } catch (err) {
        log.error('[GameStateProvider] unsubStatus error:', err);
      }
    };
  }, []);

  return (
    <GameStateContext.Provider value={{ state, dispatch }}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const context = useContext(GameStateContext);
  if (context === undefined) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}
