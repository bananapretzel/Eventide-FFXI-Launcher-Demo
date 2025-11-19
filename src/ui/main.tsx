import React, { useEffect, useState } from 'react';
import LauncherButton from './button';
import { getLauncherState, LauncherState } from '../logic/state';

const RELEASE_URL =
  'https://pub-9064140a8f58435fb0d04461223da0f2.r2.dev/release.json';
// INSTALL_DIR is retrieved from IPC (eventide:get-paths) at runtime

function Main() {
  const [state, setState] = useState<LauncherState>('NOT_INSTALLED');
  const [ctx, setCtx] = useState<any>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electron || typeof window.electron.bootstrap !== 'function') {
      const msg =
        '[ERROR] window.electron or window.electron.bootstrap is not available!';
      setErrorMsg(msg);
      setState('DOWNLOAD_FAILED');
      return;
    }

    // Get install directory from IPC first
    window.electron
      .invoke('eventide:get-paths')
      .then((pathsResult: any) => {
        if (!pathsResult?.success || !pathsResult?.data?.gameRoot) {
          throw new Error('Failed to get install paths from main process');
        }
        const installDir = pathsResult.data.gameRoot;
        return window.electron.bootstrap(RELEASE_URL, installDir);
      })
      .then((result): void => {
        if (!result || typeof result !== 'object') {
          const msg = `[ERROR] bootstrap returned null or non-object: ${String(result)}`;
          setErrorMsg(msg);
          setState('DOWNLOAD_FAILED');
          throw new Error(msg);
        }
        const {
          release,
          patchManifest,
          clientVersion,
          baseGameDownloaded,
          baseGameExtracted,
        } = result;
        if (!release || !clientVersion) {
          const msg = `[ERROR] Missing release or clientVersion in bootstrap result: ${JSON.stringify(result)}`;
          setErrorMsg(msg);
          setState('DOWNLOAD_FAILED');
          throw new Error(msg);
        }
        setCtx({
          release,
          patchManifest,
          clientVersion,
          baseGameDownloaded,
          baseGameExtracted,
        });
        setState(
          getLauncherState({
            clientVersion,
            latestVersion: release.latestVersion,
            baseGameDownloaded: !!baseGameDownloaded,
            baseGameExtracted: !!baseGameExtracted,
          }),
        );
        return undefined;
      })
      .catch((err) => {
        const msg = `[ERROR] bootstrap threw: ${err && err.message ? err.message : String(err)}`;
        setErrorMsg(msg);
        setState('DOWNLOAD_FAILED');
      });

    // Listen for extraction and patching IPC events
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('extract:start', () => {
        setState('EXTRACTING');
      });
      window.electron.ipcRenderer.on('extract:done', () => {
        setState((prev) => (prev === 'EXTRACTING' ? 'READY_TO_PLAY' : prev));
      });
      window.electron.ipcRenderer.on('patch:start', () => {
        setState('PATCHING');
      });
      window.electron.ipcRenderer.on('patch:done', () => {
        setState((prev) => (prev === 'PATCHING' ? 'READY_TO_PLAY' : prev));
      });
    }
  }, []);

  const handleClick = async () => {
    if (state === 'NOT_INSTALLED') {
      setState('DOWNLOADING');
      try {
        if (!ctx || !ctx.release || !ctx.release.game) {
          setErrorMsg('Game information is missing. Cannot download.');
          setState('DOWNLOAD_FAILED');
          return;
        }

        // Get install dir from IPC
        const pathsResult = await window.electron.invoke('eventide:get-paths');
        if (!pathsResult?.success || !pathsResult?.data?.gameRoot) {
          setErrorMsg('Failed to get install directory from main process.');
          setState('DOWNLOAD_FAILED');
          return;
        }
        const installDir = pathsResult.data.gameRoot;

        await window.electron.downloadGame(
          ctx.release.game.fullUrl,
          ctx.release.game.sha256,
          installDir,
          ctx.release.game.baseVersion,
        );
        setState('DOWNLOADED');
      } catch (err: any) {
        setErrorMsg(
          `Download failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('DOWNLOAD_FAILED');
      }
    } else if (state === 'CHECKING_FOR_UPDATES') {
      setState('PATCHING');
      try {
        if (!ctx || !ctx.patchManifest || !ctx.clientVersion) {
          setErrorMsg(
            'Patch or version information is missing. Cannot update.',
          );
          setState('PATCH_FAILED');
          return;
        }

        // Get install dir from IPC
        const pathsResult = await window.electron.invoke('eventide:get-paths');
        if (!pathsResult?.success || !pathsResult?.data?.gameRoot) {
          setErrorMsg('Failed to get install directory from main process.');
          setState('PATCH_FAILED');
          return;
        }
        const installDir = pathsResult.data.gameRoot;

        await window.electron.applyPatches(
          ctx.patchManifest,
          ctx.clientVersion,
          installDir,
        );
        setState('READY_TO_PLAY');
      } catch (err: any) {
        setErrorMsg(
          `Update failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('PATCH_FAILED');
      }
    } else if (state === 'READY_TO_PLAY') {
      // No PLAYING state in the new enum, just set to READY_TO_PLAY after launch
      try {
        // Get install dir from IPC
        const pathsResult = await window.electron.invoke('eventide:get-paths');
        if (!pathsResult?.success || !pathsResult?.data?.gameRoot) {
          setErrorMsg('Failed to get install directory from main process.');
          setState('PATCH_FAILED');
          return;
        }
        const installDir = pathsResult.data.gameRoot;

        await window.electron.launchGame(installDir);
        setState('READY_TO_PLAY');
      } catch (err: any) {
        setErrorMsg(
          `Launch failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('PATCH_FAILED');
      }
    }
  };

  return (
    <div>
      <LauncherButton state={state} onClick={handleClick} />
      {(state === 'DOWNLOAD_FAILED' ||
        state === 'EXTRACT_FAILED' ||
        state === 'PATCH_FAILED') && (
        <div style={{ color: 'red', marginTop: 16 }}>
          Error occurred. Please check logs.
          <br />
          {errorMsg && <pre style={{ whiteSpace: 'pre-wrap' }}>{errorMsg}</pre>}
        </div>
      )}
    </div>
  );
}

export default Main;
