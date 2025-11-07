// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'window:minimize' | 'window:close';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
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
  updateIniCredentials: (username: string, password: string) =>
    ipcRenderer.invoke('update-ini-auth-and-run', username, password),
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
