// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Helpful runtime log to verify preload is loaded in the renderer process
try {
  // eslint-disable-next-line no-console
  console.log('[preload] loaded');
} catch (e) {}

export type Channels =
  | 'ipc-example'
  | 'window:minimize'
  | 'window:close'
  | 'download:progress'
  | 'game:status';

const electronHandler = {
  getUpdateStatus: (installDir?: string) => ipcRenderer.invoke('get-update-status', installDir),
  // Launcher API for renderer
  bootstrap: (releaseUrl: string, installDir: string) =>
    ipcRenderer.invoke('launcher:bootstrap', releaseUrl, installDir),
  downloadGame: (fullUrl: string, sha256: string, installDir: string, baseVersion: string) =>
    ipcRenderer.invoke('launcher:downloadGame', fullUrl, sha256, installDir, baseVersion),
  applyPatches: (patchManifest: any, clientVersion: string, installDir: string) =>
    ipcRenderer.invoke('launcher:applyPatches', patchManifest, clientVersion, installDir),
  launchGame: (installDir: string) =>
    ipcRenderer.invoke('launcher:launchGame', installDir),
  ipcRenderer: {
    sendMessage(channel: string, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      const subscription = (event: IpcRendererEvent, ...args: unknown[]) =>
        func(event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (event, ...args) => func(event, ...args));
    },
  },
  // generic invoke helper so renderer can use ipcRenderer.invoke via the preload
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args);
  },
  windowControls: {
    minimize() {
      ipcRenderer.send('window:minimize');
    },
    close() {
      ipcRenderer.send('window:close');
    },
  },
  readIniFile: () => ipcRenderer.invoke('read-ini-file'),
  updateIniCredentials: (username: string, password: string, installDir?: string) =>
    ipcRenderer.invoke('update-ini-auth-and-run', username, password, installDir),
  readExtensions: () => ipcRenderer.invoke('read-extensions'),
  writeExtensions: (data: { addons: Record<string, boolean>, plugins: Record<string, boolean> }) =>
    ipcRenderer.invoke('write-extensions', data),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (data: Record<string, any>) =>
    ipcRenderer.invoke('write-settings', data),
  readConfig: () => ipcRenderer.invoke('read-config'),
  writeConfig: (data: { username: string, password: string, rememberCredentials: boolean }) =>
    ipcRenderer.invoke('write-config', data),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
