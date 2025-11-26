import { BrowserWindow } from 'electron';

/**
 * Type-safe global state for the main process
 */
export interface AppGlobals {
  mainWindow: BrowserWindow | null;
  isPatchingInProgress: boolean;
  __lastDownloadProgress?: { dl: number; total: number };
  __lastDownloadInfo?: any;
  __lastDownloadChecksum?: string;
}

const appGlobals: AppGlobals = {
  mainWindow: null,
  isPatchingInProgress: false,
};

export default appGlobals;

/**
 * Safely send message to renderer via mainWindow
 */
export function sendToRenderer(channel: string, payload: any): void {
  if (appGlobals.mainWindow?.webContents) {
    appGlobals.mainWindow.webContents.send(channel, payload);
  }
}
