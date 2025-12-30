// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import log from 'electron-log/preload';

// Helpful runtime log to verify preload is loaded in the renderer process
try {
  log.info('[preload] loaded');
} catch {
  // Silently fail
}

export type Channels =
  | 'ipc-example'
  | 'window:minimize'
  | 'window:close'
  | 'download:progress'
  | 'game:status'
  | 'launcher:update-event';

const isDev = process.env.NODE_ENV !== 'production';

const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  // Platform / version
  'get-platform',
  'get-launcher-version',
  'get-update-status',

  // Bootstrap / install / update
  'launcher:bootstrap',
  'launcher:downloadGame',
  'launcher:applyPatches',
  'launcher:launchGame',
  'launcher:checkForUpdates',
  'launcher:downloadUpdate',
  'launcher:installUpdate',
  'launcher:get-update-status',

  // Game lifecycle helpers
  'game:check',
  'game:download',
  'game:extract',
  'game:update',
  'game:launch',
  'game:import-existing',
  'game:refresh-cache',
  'game:fetch-patch-notes',
  'game:pause-download',
  'game:resume-download',
  'game:cancel-download',
  'game:check-resumable',

  // Config / extensions / INI
  'read-ini-file',
  'read-ini-settings',
  'update-ini-auth-and-run',
  'read-extensions',
  'write-extensions',
  'read-settings',
  'write-settings',
  'read-config',
  'write-config',
  'write-default-script',
  'eventide:get-paths',
  'pivot:list-overlays',

  // File system / shell
  'select-install-directory',
  'set-install-directory',
  'select-screenshot-directory',
  'open-external-url',
  'open-config-folder',
  'open-log-file',
  'open-game-folder',
  'open-gamepad-config',
  'open-extension-folder',
  'reapply-patches',
  'uninstall-game',
  'clear-downloads',
]);

if (isDev) {
  ALLOWED_INVOKE_CHANNELS.add('debug:get-last-progress');
  ALLOWED_INVOKE_CHANNELS.add('debug:get-last-download-info');
  ALLOWED_INVOKE_CHANNELS.add('debug:get-last-checksum');
}

const ALLOWED_SEND_CHANNELS = new Set<string>([
  'ipc-example',
  'window:minimize',
  'window:close',
  'window:set-size',
]);

const ALLOWED_LISTEN_CHANNELS = new Set<string>([
  'ipc-example',
  'download:progress',
  'extract:progress',
  'game:status',
  'launcher:update-event',
]);

function assertAllowed(set: Set<string>, channel: string, kind: string): void {
  if (!set.has(channel)) {
    throw new Error(`Blocked IPC ${kind} channel: ${channel}`);
  }
}

const electronHandler = {
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),
  getUpdateStatus: (installDir?: string) =>
    ipcRenderer.invoke('get-update-status', installDir),
  // Launcher API for renderer
  bootstrap: (releaseUrl: string, installDir: string) =>
    ipcRenderer.invoke('launcher:bootstrap', releaseUrl, installDir),
  downloadGame: (
    fullUrl: string,
    sha256: string,
    installDir: string,
    baseVersion: string,
  ) =>
    ipcRenderer.invoke(
      'launcher:downloadGame',
      fullUrl,
      sha256,
      installDir,
      baseVersion,
    ),
  applyPatches: (
    patchManifest: any,
    clientVersion: string,
    installDir: string,
  ) =>
    ipcRenderer.invoke(
      'launcher:applyPatches',
      patchManifest,
      clientVersion,
      installDir,
    ),
  launchGame: (installDir: string) =>
    ipcRenderer.invoke('launcher:launchGame', installDir),
  // Resumable download controls
  pauseDownload: () => ipcRenderer.invoke('game:pause-download'),
  resumeDownload: () => ipcRenderer.invoke('game:resume-download'),
  cancelDownload: () => ipcRenderer.invoke('game:cancel-download'),
  checkResumableDownload: () => ipcRenderer.invoke('game:check-resumable'),
  ipcRenderer: {
    sendMessage(channel: string, ...args: unknown[]) {
      assertAllowed(ALLOWED_SEND_CHANNELS, channel, 'send');
      ipcRenderer.send(channel, ...args);
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      assertAllowed(ALLOWED_LISTEN_CHANNELS, channel, 'listen');
      const subscription = (event: IpcRendererEvent, ...args: unknown[]) =>
        func(event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      assertAllowed(ALLOWED_LISTEN_CHANNELS, channel, 'listen');
      ipcRenderer.once(channel, (event, ...args) => func(event, ...args));
    },
  },
  // generic invoke helper so renderer can use ipcRenderer.invoke via the preload
  invoke(channel: string, ...args: unknown[]) {
    assertAllowed(ALLOWED_INVOKE_CHANNELS, channel, 'invoke');
    return ipcRenderer.invoke(channel, ...args);
  },
  windowControls: {
    minimize() {
      ipcRenderer.send('window:minimize');
    },
    close() {
      ipcRenderer.send('window:close');
    },
    setSize(width: number, height: number) {
      ipcRenderer.send('window:set-size', width, height);
    },
  },
  readIniFile: () => ipcRenderer.invoke('read-ini-file'),
  /** Read settings from eventide.ini - returns actual game configuration values */
  readIniSettings: () => ipcRenderer.invoke('read-ini-settings'),
  updateIniCredentials: (
    username: string,
    password: string,
    installDir?: string,
  ) =>
    ipcRenderer.invoke(
      'update-ini-auth-and-run',
      username,
      password,
      installDir,
    ),
  readExtensions: () => ipcRenderer.invoke('read-extensions'),
  writeExtensions: (data: {
    addons: Record<string, boolean>;
    plugins: Record<string, boolean>;
  }) => ipcRenderer.invoke('write-extensions', data),
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
  setInstallDirectory: (dirPath: string | null) =>
    ipcRenderer.invoke('set-install-directory', dirPath),
  // Screenshot directory selection
  selectScreenshotDirectory: () =>
    ipcRenderer.invoke('select-screenshot-directory'),
  // Open external URL in default browser
  openExternal: (url: string) => ipcRenderer.invoke('open-external-url', url),
  // Launcher self-update API
  launcherUpdate: {
    checkForUpdates: () => ipcRenderer.invoke('launcher:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('launcher:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('launcher:installUpdate'),
    getStatus: () => ipcRenderer.invoke('launcher:get-update-status'),
    onUpdateEvent: (
      handler: (event: IpcRendererEvent, payload: any) => void,
    ) => {
      const subscription = (event: IpcRendererEvent, payload: any) =>
        handler(event, payload);
      ipcRenderer.on('launcher:update-event', subscription);
      return () =>
        ipcRenderer.removeListener('launcher:update-event', subscription);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
