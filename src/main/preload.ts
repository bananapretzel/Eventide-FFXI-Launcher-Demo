// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import log from 'electron-log/preload';

// Helpful runtime log to verify preload is loaded in the renderer process
try {
  log.info('[preload] loaded');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
} catch (e) {
  // Silently fail
}

export type Channels =
  | 'ipc-example'
  | 'window:minimize'
  | 'window:close'
  | 'download:progress'
  | 'game:status'
  | 'launcher:update-event';

const electronHandler = {
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),
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
  // Resumable download controls
  pauseDownload: () => ipcRenderer.invoke('game:pause-download'),
  resumeDownload: () => ipcRenderer.invoke('game:resume-download'),
  cancelDownload: () => ipcRenderer.invoke('game:cancel-download'),
  checkResumableDownload: () => ipcRenderer.invoke('game:check-resumable'),
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
  writeConfig: (data: Record<string, any>) =>
    ipcRenderer.invoke('write-config', data),
  writeDefaultScript: () => ipcRenderer.invoke('write-default-script'),
  fetchPatchNotes: () => ipcRenderer.invoke('game:fetch-patch-notes'),
  // Installation directory selection
  selectInstallDirectory: () => ipcRenderer.invoke('select-install-directory'),
  setInstallDirectory: (dirPath: string | null) => ipcRenderer.invoke('set-install-directory', dirPath),
  // Launcher self-update API
  launcherUpdate: {
    checkForUpdates: () => ipcRenderer.invoke('launcher:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('launcher:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('launcher:installUpdate'),
    onUpdateEvent: (handler: (event: IpcRendererEvent, payload: any) => void) => {
      const subscription = (event: IpcRendererEvent, payload: any) => handler(event, payload);
      ipcRenderer.on('launcher:update-event', subscription);
      return () => ipcRenderer.removeListener('launcher:update-event', subscription);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
