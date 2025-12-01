/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { app, shell } from 'electron';
import fs from 'fs-extra';
import log from 'electron-log';
import chalk from 'chalk';
import { exec } from 'child_process';

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
 * Detects if running under Wine on Linux
 */
export function isRunningUnderWine(): boolean {
  return !!(
    process.env.WINEPREFIX ||
    process.env.WINELOADER ||
    process.env.WINEDEBUG !== undefined ||
    process.env.WINE_LARGE_ADDRESS_AWARE !== undefined
  );
}

/**
 * Converts a Windows path to a Unix path for use with native Linux commands
 * Wine paths like Z:\home\user\... map to /home/user/...
 */
function windowsToUnixPath(winPath: string): string {
  // Handle Wine Z: drive mapping (root filesystem)
  if (winPath.match(/^[Zz]:\\/)) {
    return winPath.substring(2).replace(/\\/g, '/');
  }
  // Handle other drive letters (C:, D:, etc.) - these map to ~/.wine/dosdevices/c: etc.
  const driveMatch = winPath.match(/^([A-Za-z]):\\/);
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase();
    const winePrefix = process.env.WINEPREFIX || `${process.env.HOME}/.wine`;
    const relativePath = winPath.substring(3).replace(/\\/g, '/');
    return `${winePrefix}/dosdevices/${driveLetter}:/${relativePath}`;
  }
  // For other drive letters, try to use winepath if available
  return winPath.replace(/\\/g, '/');
}

/**
 * Opens a file or folder path cross-platform, handling Wine/Linux correctly
 * On native Windows: uses shell.openPath
 * On Wine/Linux: uses multiple methods to open with the native Linux file manager
 */
export async function openPathCrossPlatform(targetPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (isRunningUnderWine()) {
      // Convert Windows path to Unix path
      const unixPath = windowsToUnixPath(targetPath);
      log.info(chalk.cyan(`[openPathCrossPlatform] Running under Wine, converting path: ${targetPath} -> ${unixPath}`));

      // Try multiple methods to open the folder on Linux
      return new Promise((resolve) => {
        // Method 1: Use /bin/sh to break out of Wine and run xdg-open natively
        // This spawns a native Linux shell process
        const tryNativeShell = () => {
          log.info(chalk.cyan('[openPathCrossPlatform] Trying native shell with xdg-open...'));
          exec(`/bin/sh -c 'xdg-open "${unixPath}"'`, { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } }, (error) => {
            if (error) {
              log.warn(chalk.yellow('[openPathCrossPlatform] Native shell xdg-open failed:'), error.message);
              tryWineStart();
            } else {
              log.info(chalk.green('[openPathCrossPlatform] Successfully opened with native xdg-open'));
              resolve({ success: true });
            }
          });
        };

        // Method 2: Use Wine's 'start' command with /unix flag
        const tryWineStart = () => {
          log.info(chalk.cyan('[openPathCrossPlatform] Trying Wine start /unix...'));
          exec(`start /unix "${unixPath}"`, (error) => {
            if (error) {
              log.warn(chalk.yellow('[openPathCrossPlatform] Wine start /unix failed:'), error.message);
              tryWineExplorer();
            } else {
              log.info(chalk.green('[openPathCrossPlatform] Successfully opened with Wine start /unix'));
              resolve({ success: true });
            }
          });
        };

        // Method 3: Use Wine's explorer with the Windows path
        const tryWineExplorer = () => {
          log.info(chalk.cyan('[openPathCrossPlatform] Trying Wine explorer...'));
          exec(`explorer "${targetPath}"`, (error) => {
            if (error) {
              log.warn(chalk.yellow('[openPathCrossPlatform] Wine explorer failed:'), error.message);
              tryShellOpen();
            } else {
              log.info(chalk.green('[openPathCrossPlatform] Successfully opened with Wine explorer'));
              resolve({ success: true });
            }
          });
        };

        // Method 4: Fallback to Electron's shell.openPath
        const tryShellOpen = () => {
          log.info(chalk.cyan('[openPathCrossPlatform] Trying Electron shell.openPath fallback...'));
          shell.openPath(targetPath).then((result) => {
            if (result) {
              log.error(chalk.red('[openPathCrossPlatform] All methods failed. Last error:'), result);
              resolve({
                success: false,
                error: `Failed to open folder. Please navigate manually to: ${unixPath}`,
              });
            } else {
              log.info(chalk.green('[openPathCrossPlatform] Successfully opened with shell.openPath'));
              resolve({ success: true });
            }
          });
        };

        // Start the chain of attempts
        tryNativeShell();
      });
    } else {
      // Native Windows - use shell.openPath
      const result = await shell.openPath(targetPath);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true };
    }
  } catch (err) {
    log.error(chalk.red('[openPathCrossPlatform] Error:'), err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Creates a desktop shortcut to the launcher (Windows only)
 * This fixes the "desktop shortcuts not being created" bug
 *
 * Note: When running under Wine on Linux, shortcut creation is skipped
 * to avoid duplicates and Wine compatibility issues. Users should create
 * shortcuts manually or use their desktop environment's tools.
 */
export async function createDesktopShortcut(): Promise<{ success: boolean; error?: string }> {
  try {
    // Only create shortcuts on native Windows, not under Wine
    if (isRunningUnderWine()) {
      log.info(chalk.cyan('[createDesktopShortcut] Running under Wine - skipping shortcut creation'));
      log.info(chalk.cyan('[createDesktopShortcut] Users should create shortcuts manually via their Linux desktop environment'));
      return { success: true };
    }

    // Windows shortcut (.lnk)
    const desktopPath = path.join(app.getPath('home'), 'Desktop');

    // Ensure desktop directory exists
    if (!fs.existsSync(desktopPath)) {
      log.info(chalk.yellow('[createDesktopShortcut] Desktop folder not found at:'), desktopPath);
      return { success: true }; // Not an error, just no desktop folder
    }

    const shortcutPath = path.join(desktopPath, 'Eventide Launcher.lnk');

    // Check if shortcut already exists
    if (fs.existsSync(shortcutPath)) {
      log.info(chalk.cyan('[createDesktopShortcut] Shortcut already exists at:'), shortcutPath);
      return { success: true };
    }

    // Also check for the alternative name that NSIS might create
    const altShortcutPath = path.join(desktopPath, 'Eventide-FFXI-Launcher.lnk');
    if (fs.existsSync(altShortcutPath)) {
      log.info(chalk.cyan('[createDesktopShortcut] NSIS shortcut already exists at:'), altShortcutPath);
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
