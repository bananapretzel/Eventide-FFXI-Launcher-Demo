/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { app, shell } from 'electron';
import fs from 'fs-extra';
import log from 'electron-log';
import chalk from 'chalk';

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

/**
 * Creates a desktop shortcut to the launcher
 * This fixes the "desktop shortcuts not being created" bug
 */
export async function createDesktopShortcut(): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform !== 'win32') {
      // Only Windows is supported for now
      log.info(chalk.yellow('[createDesktopShortcut] Not on Windows, skipping shortcut creation'));
      return { success: true };
    }

    const desktopPath = path.join(app.getPath('home'), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Eventide Launcher.lnk');

    // Check if shortcut already exists
    if (fs.existsSync(shortcutPath)) {
      log.info(chalk.cyan('[createDesktopShortcut] Shortcut already exists at:'), shortcutPath);
      return { success: true };
    }

    // Get the path to the launcher executable
    const exePath = app.getPath('exe');

    // Create the shortcut using Electron's shell.writeShortcutLink
    const success = shell.writeShortcutLink(shortcutPath, {
      target: exePath,
      description: 'Eventide FFXI Launcher',
      cwd: path.dirname(exePath),
    });

    if (success) {
      log.info(chalk.green('[createDesktopShortcut] ✓ Desktop shortcut created successfully at:'), shortcutPath);
      return { success: true };
    } else {
      log.warn(chalk.yellow('[createDesktopShortcut] Failed to create desktop shortcut'));
      return { success: false, error: 'Failed to create shortcut (unknown reason)' };
    }
  } catch (err) {
    log.error(chalk.red('[createDesktopShortcut] Error creating desktop shortcut:'), err);
    return {
      success: false,
      error: `Failed to create desktop shortcut: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
