import React, { useEffect, useState } from 'react';
import LauncherButton from './button';
import { getLauncherState, LauncherState } from '../logic/state';

const RELEASE_URL =
  'https://pub-9064140a8f58435fb0d04461223da0f2.r2.dev/release.json';
const INSTALL_DIR = 'asdf';

function Main() {
  const [state, setState] = useState<LauncherState>('missing');
  const [ctx, setCtx] = useState<any>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electron || typeof window.electron.bootstrap !== 'function') {
      const msg =
        '[ERROR] window.electron or window.electron.bootstrap is not available!';
      setErrorMsg(msg);
      setState('error');
      return;
    }
    window.electron
      .bootstrap(RELEASE_URL, INSTALL_DIR)
      .then((result) => {
        if (!result || typeof result !== 'object') {
          const msg = `[ERROR] bootstrap returned null or non-object: ${String(result)}`;
          setErrorMsg(msg);
          setState('error');
          return;
        }
        const { release, patchManifest, clientVersion } = result;
        // eslint-disable-next-line promise/always-return
        if (!release || !clientVersion) {
          const msg = `[ERROR] Missing release or clientVersion in bootstrap result: ${JSON.stringify(
            result,
          )}`;
          setErrorMsg(msg);
          setState('error');
          return;
        }
        setCtx({ release, patchManifest, clientVersion });
        setState(
          getLauncherState({
            clientVersion,
            latestVersion: release.latestVersion,
          }),
        );
      })
      .catch((err) => {
        const msg = `[ERROR] bootstrap threw: ${
          err && err.message ? err.message : String(err)
        }`;
        setErrorMsg(msg);
        setState('error');
      });
  }, []);

  const handleClick = async () => {
    if (state === 'missing') {
      setState('downloading');
      try {
        if (!ctx || !ctx.release || !ctx.release.game) {
          setErrorMsg('Game information is missing. Cannot download.');
          setState('error');
          return;
        }
        await window.electron.downloadGame(
          ctx.release.game.fullUrl,
          ctx.release.game.sha256,
          INSTALL_DIR,
          ctx.release.game.baseVersion,
        );
        setState('latest');
      } catch (err: any) {
        setErrorMsg(
          `Download failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('error');
      }
    } else if (state === 'outdated') {
      setState('updating');
      try {
        if (!ctx || !ctx.patchManifest || !ctx.clientVersion) {
          setErrorMsg(
            'Patch or version information is missing. Cannot update.',
          );
          setState('error');
          return;
        }
        await window.electron.applyPatches(
          ctx.patchManifest,
          ctx.clientVersion,
          INSTALL_DIR,
        );
        setState('latest');
      } catch (err: any) {
        setErrorMsg(
          `Update failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('error');
      }
    } else if (state === 'latest') {
      setState('playing');
      try {
        await window.electron.launchGame(INSTALL_DIR);
        setState('latest');
      } catch (err: any) {
        setErrorMsg(
          `Launch failed: ${err && err.message ? err.message : String(err)}`,
        );
        setState('error');
      }
    }
  };

  return (
    <div>
      <LauncherButton state={state} onClick={handleClick} />
      {state === 'error' && (
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
