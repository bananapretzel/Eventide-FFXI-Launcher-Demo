/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { app, shell } from 'electron';
import fs from 'fs-extra';
import log from 'electron-log';
import chalk from 'chalk';
import { exec } from 'child_process';

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robustly removes a directory or file, handling EBUSY/EPERM errors on Windows.
 * Uses retries with exponential backoff for locked files.
 * @param targetPath - Path to delete
 * @param options - Options for deletion behavior
 * @returns Object indicating success and any files that couldn't be deleted
 */
export async function robustRemove(
  targetPath: string,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    continueOnError?: boolean;
  } = {}
): Promise<{ success: boolean; skippedPaths: string[]; error?: string }> {
  const { maxRetries = 3, retryDelayMs = 500, continueOnError = true } = options;
  const skippedPaths: string[] = [];

  if (!fs.existsSync(targetPath)) {
    return { success: true, skippedPaths: [] };
  }

  /**
   * Try to delete a single file or empty directory with retries
   */
  async function tryDelete(itemPath: string, isDirectory: boolean): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (isDirectory) {
          fs.rmdirSync(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
        return true;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        const isRetryableError = error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'ENOTEMPTY';

        if (isRetryableError && attempt < maxRetries) {
          // Wait with exponential backoff before retrying
          const delay = retryDelayMs * Math.pow(2, attempt);
          log.warn(chalk.yellow(`[robustRemove] ${error.code} on "${itemPath}", retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`));
          await sleep(delay);
        } else if (isRetryableError && continueOnError) {
          // Max retries reached, but continue with other files
          log.warn(chalk.yellow(`[robustRemove] Could not delete "${itemPath}" after ${maxRetries} retries: ${error.code}`));
          skippedPaths.push(itemPath);
          return false;
        } else {
          throw err;
        }
      }
    }
    return false;
  }

  /**
   * Recursively delete directory contents, bottom-up
   */
  async function deleteRecursive(dirPath: string): Promise<void> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // First, process all children
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await deleteRecursive(fullPath);
      } else {
        await tryDelete(fullPath, false);
      }
    }

    // Then try to delete the directory itself (only if empty)
    const remaining = fs.readdirSync(dirPath);
    if (remaining.length === 0) {
      await tryDelete(dirPath, true);
    } else {
      // Directory not empty (some files were skipped)
      skippedPaths.push(dirPath);
    }
  }

  try {
    const stat = fs.statSync(targetPath);

    if (stat.isDirectory()) {
      await deleteRecursive(targetPath);
    } else {
      await tryDelete(targetPath, false);
    }

    const success = skippedPaths.length === 0;
    if (!success) {
      log.warn(chalk.yellow(`[robustRemove] Completed with ${skippedPaths.length} skipped items`));
    }

    return { success, skippedPaths };
  } catch (err) {
    const error = err as Error;
    log.error(chalk.red(`[robustRemove] Error deleting "${targetPath}":`), error);
    return {
      success: false,
      skippedPaths,
      error: error.message,
    };
  }
}

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

/**
 * Removes the desktop shortcut to the launcher (Windows only)
 * Called during uninstallation
 */
export async function removeDesktopShortcut(): Promise<{ success: boolean; error?: string }> {
  try {
    // Only remove shortcuts on native Windows, not under Wine
    if (isRunningUnderWine()) {
      log.info(chalk.cyan('[removeDesktopShortcut] Running under Wine - skipping shortcut removal'));
      return { success: true };
    }

    const desktopPath = path.join(app.getPath('home'), 'Desktop');

    // Check if desktop folder exists
    if (!fs.existsSync(desktopPath)) {
      log.info(chalk.yellow('[removeDesktopShortcut] Desktop folder not found'));
      return { success: true };
    }

    // Remove the main shortcut name
    const shortcutPath = path.join(desktopPath, 'Eventide Launcher.lnk');
    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
      log.info(chalk.green('[removeDesktopShortcut] ✓ Removed desktop shortcut:'), shortcutPath);
    }

    // Also remove the alternative name that NSIS might create
    const altShortcutPath = path.join(desktopPath, 'Eventide-FFXI-Launcher.lnk');
    if (fs.existsSync(altShortcutPath)) {
      fs.unlinkSync(altShortcutPath);
      log.info(chalk.green('[removeDesktopShortcut] ✓ Removed NSIS desktop shortcut:'), altShortcutPath);
    }

    // Also check for EventideXI.lnk (electron-builder default)
    const builderShortcutPath = path.join(desktopPath, 'EventideXI.lnk');
    if (fs.existsSync(builderShortcutPath)) {
      fs.unlinkSync(builderShortcutPath);
      log.info(chalk.green('[removeDesktopShortcut] ✓ Removed builder desktop shortcut:'), builderShortcutPath);
    }

    return { success: true };
  } catch (err) {
    log.error(chalk.red('[removeDesktopShortcut] Error removing desktop shortcut:'), err);
    return {
      success: false,
      error: `Failed to remove desktop shortcut: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Removes the Linux .desktop file for Wine/Linux users
 * Called during uninstallation
 */
export async function removeLinuxDesktopFile(): Promise<{ success: boolean; error?: string }> {
  if (!isRunningUnderWine()) {
    log.info(chalk.cyan('[removeLinuxDesktopFile] Not running under Wine - skipping'));
    return { success: true };
  }

  try {
    const home = process.env.HOME || '/home/user';
    const desktopFilePath = `${home}/.local/share/applications/eventidexi.desktop`;

    return new Promise((resolve) => {
      exec(`/bin/sh -c 'if [ -f "${desktopFilePath}" ]; then rm "${desktopFilePath}" && echo "Removed"; fi'`, (error, stdout) => {
        if (error) {
          log.error(chalk.red('[removeLinuxDesktopFile] Failed to remove .desktop file:'), error.message);
          resolve({
            success: false,
            error: `Failed to remove .desktop file: ${error.message}`,
          });
        } else if (stdout.includes('Removed')) {
          log.info(chalk.green('[removeLinuxDesktopFile] ✓ Removed Linux .desktop file:'), desktopFilePath);
          resolve({ success: true });
        } else {
          log.info(chalk.cyan('[removeLinuxDesktopFile] No .desktop file found to remove'));
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    log.error(chalk.red('[removeLinuxDesktopFile] Error:'), err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Creates a proper Linux .desktop file for Wine/Linux users
 * This should be called on first run when running under Wine
 */
export async function createLinuxDesktopFile(): Promise<{ success: boolean; error?: string }> {
  if (!isRunningUnderWine()) {
    log.info(chalk.cyan('[createLinuxDesktopFile] Not running under Wine - skipping'));
    return { success: true };
  }

  try {
    const winePrefix = process.env.WINEPREFIX || `${process.env.HOME}/.wine`;
    const home = process.env.HOME || '/home/user';

    // Get the Windows path to the executable
    const exePathWindows = app.getPath('exe');

    // Convert Windows path to Unix path for the Exec line
    const exePathUnix = windowsToUnixPath(exePathWindows);
    const exeDirUnix = path.dirname(exePathUnix).replace(/\\/g, '/');

    // Determine the desktop file path
    const desktopDir = `${home}/.local/share/applications`;
    const desktopFilePath = `${desktopDir}/eventidexi.desktop`;

    // Check if it already exists
    try {
      await fs.promises.access(desktopFilePath.replace(/\//g, path.sep));
      log.info(chalk.cyan('[createLinuxDesktopFile] Desktop file already exists at:'), desktopFilePath);
      return { success: true };
    } catch {
      // File doesn't exist, continue creating it
    }

    // Try to find an icon - look for common icon locations
    let iconPath = '';
    const possibleIconPaths = [
      `${exeDirUnix}/resources/icon.png`,
      `${exeDirUnix}/resources/app/assets/icon.png`,
      `${exeDirUnix}/../resources/icon.png`,
      `${winePrefix}/drive_c/users/${process.env.USER || 'user'}/AppData/Local/Programs/eventidexi/resources/icon.png`,
    ];

    for (const iconCandidate of possibleIconPaths) {
      try {
        const unixIconPath = iconCandidate.replace(/\\/g, '/');
        await fs.promises.access(unixIconPath);
        iconPath = unixIconPath;
        break;
      } catch {
        // Icon not found at this path, try next
      }
    }

    // If no icon found, try to extract from the exe or use a placeholder
    if (!iconPath) {
      iconPath = 'application-x-executable'; // Fallback to generic icon
    }

    // Create the .desktop file content
    const desktopFileContent = `[Desktop Entry]
Name=EventideXI
Comment=A launcher for the private FFXI private server called Eventide.
Exec=env "WINEPREFIX=${winePrefix}" wine "${exePathWindows.replace(/\\/g, '\\\\')}"
Type=Application
StartupNotify=true
Path=${exeDirUnix}
Icon=${iconPath}
StartupWMClass=eventidexi.exe
Categories=Game;
`;

    // Create the applications directory if it doesn't exist
    return new Promise((resolve) => {
      exec(`/bin/sh -c 'mkdir -p "${desktopDir}" && cat > "${desktopFilePath}" << "DESKTOP_EOF"
${desktopFileContent}
DESKTOP_EOF
chmod +x "${desktopFilePath}"'`, (error) => {
        if (error) {
          log.error(chalk.red('[createLinuxDesktopFile] Failed to create .desktop file:'), error.message);
          resolve({
            success: false,
            error: `Failed to create .desktop file: ${error.message}`,
          });
        } else {
          log.info(chalk.green('[createLinuxDesktopFile] ✓ Linux .desktop file created at:'), desktopFilePath);
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    log.error(chalk.red('[createLinuxDesktopFile] Error:'), err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Removes the broken Wine-generated .desktop file if it exists
 */
export async function removeWineDesktopFile(): Promise<void> {
  if (!isRunningUnderWine()) {
    return;
  }

  try {
    const home = process.env.HOME || '/home/user';

    // Wine typically creates .desktop files in these locations with various naming patterns
    const possiblePaths = [
      `${home}/.local/share/applications/wine/Programs/EventideXI.desktop`,
      `${home}/.local/share/applications/wine-Programs-EventideXI.desktop`,
      `${home}/Desktop/EventideXI.desktop`,
    ];

    for (const desktopPath of possiblePaths) {
      try {
        // Use native Linux shell to check and remove the file
        await new Promise<void>((resolve) => {
          exec(`/bin/sh -c 'if [ -f "${desktopPath}" ]; then rm "${desktopPath}" && echo "Removed"; fi'`, (error, stdout) => {
            if (!error && stdout.includes('Removed')) {
              log.info(chalk.green('[removeWineDesktopFile] Removed broken Wine .desktop file:'), desktopPath);
            }
            resolve();
          });
        });
      } catch {
        // Ignore errors for individual file removal attempts
      }
    }
  } catch (err) {
    log.warn(chalk.yellow('[removeWineDesktopFile] Error cleaning up Wine .desktop files:'), err);
  }
}
