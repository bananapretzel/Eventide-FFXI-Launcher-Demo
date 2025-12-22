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
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  } = {},
): Promise<{ success: boolean; skippedPaths: string[]; error?: string }> {
  const {
    maxRetries = 3,
    retryDelayMs = 500,
    continueOnError = true,
  } = options;
  const skippedPaths: string[] = [];

  if (!fs.existsSync(targetPath)) {
    return { success: true, skippedPaths: [] };
  }

  /**
   * Try to delete a single file or empty directory with retries
   */
  async function tryDelete(
    itemPath: string,
    isDirectory: boolean,
  ): Promise<boolean> {
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
        const isRetryableError =
          error.code === 'EBUSY' ||
          error.code === 'EPERM' ||
          error.code === 'ENOTEMPTY';

        if (isRetryableError && attempt < maxRetries) {
          // Wait with exponential backoff before retrying
          const delay = retryDelayMs * 2 ** attempt;
          log.warn(
            chalk.yellow(
              `[robustRemove] ${error.code} on "${itemPath}", retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
            ),
          );
          await sleep(delay);
        } else if (isRetryableError && continueOnError) {
          // Max retries reached, but continue with other files
          log.warn(
            chalk.yellow(
              `[robustRemove] Could not delete "${itemPath}" after ${maxRetries} retries: ${error.code}`,
            ),
          );
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
      log.warn(
        chalk.yellow(
          `[robustRemove] Completed with ${skippedPaths.length} skipped items`,
        ),
      );
    }

    return { success, skippedPaths };
  } catch (err) {
    const error = err as Error;
    log.error(
      chalk.red(`[robustRemove] Error deleting "${targetPath}":`),
      error,
    );
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
 * Gets the Linux home directory when running under Wine.
 * Under Wine, process.env.HOME may be undefined, so we need fallbacks.
 * @returns The Linux home directory path, or null if it cannot be determined
 */
function getLinuxHome(): string | null {
  // Try standard HOME first
  if (process.env.HOME) {
    return process.env.HOME;
  }

  // Under Wine, try to derive from WINEPREFIX
  // WINEPREFIX is usually something like /home/user/.wine or /home/user/Games/wine-prefix
  if (process.env.WINEPREFIX) {
    const match = process.env.WINEPREFIX.match(/^\/home\/([^/]+)/);
    if (match) {
      return `/home/${match[1]}`;
    }
  }

  // Try USER environment variable
  if (process.env.USER) {
    return `/home/${process.env.USER}`;
  }

  // Try LOGNAME environment variable
  if (process.env.LOGNAME) {
    return `/home/${process.env.LOGNAME}`;
  }

  return null;
}

/**
 * Gets the Wine prefix directory.
 * @returns The Wine prefix path, or null if not running under Wine or cannot be determined
 */
function getWinePrefix(): string | null {
  if (process.env.WINEPREFIX) {
    return process.env.WINEPREFIX;
  }

  const home = getLinuxHome();
  if (home) {
    return `${home}/.wine`;
  }

  return null;
}

/**
 * Converts a Windows path to a Unix path for use with native Linux commands
 * Wine paths like Z:\home\user\... map to /home/user/...
 * @returns The Unix path, or null if conversion fails (e.g., HOME is undefined)
 */
function windowsToUnixPath(winPath: string): string | null {
  // Handle Wine Z: drive mapping (root filesystem)
  if (winPath.match(/^[Zz]:\\/)) {
    return winPath.substring(2).replace(/\\/g, '/');
  }

  // Handle other drive letters (C:, D:, etc.) - these map to ~/.wine/dosdevices/c: etc.
  const driveMatch = winPath.match(/^([A-Za-z]):\\/);
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase();
    const winePrefix = getWinePrefix();

    if (!winePrefix) {
      log.warn(
        chalk.yellow(
          '[windowsToUnixPath] Cannot determine Wine prefix - HOME and WINEPREFIX are both undefined',
        ),
      );
      return null;
    }

    const relativePath = winPath.substring(3).replace(/\\/g, '/');
    return `${winePrefix}/dosdevices/${driveLetter}:/${relativePath}`;
  }

  // For UNC paths or other formats, just convert backslashes
  return winPath.replace(/\\/g, '/');
}

/**
 * Opens a file or folder path cross-platform, handling Wine/Linux correctly
 * On native Windows: uses shell.openPath
 * On Wine/Linux: tries Wine explorer first (most reliable), then falls back to shell.openPath
 *
 * Note: Under Wine, exec() runs in the Wine/Windows environment, NOT native Linux.
 * Commands like /bin/sh or xdg-open will NOT work because they're interpreted
 * by the Windows command processor. We use Wine-compatible methods instead.
 */
export async function openPathCrossPlatform(
  targetPath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (isRunningUnderWine()) {
      const unixPath = windowsToUnixPath(targetPath);
      log.info(
        chalk.cyan(
          `[openPathCrossPlatform] Running under Wine, path: ${targetPath}`,
        ),
      );
      if (unixPath) {
        log.info(
          chalk.cyan(
            `[openPathCrossPlatform] Converted to Unix path: ${unixPath}`,
          ),
        );
      }

      // Method 1: Use Wine's explorer.exe with the Windows path (most reliable)
      // This opens Wine's built-in file explorer which works consistently
      return new Promise((resolve) => {
        const tryWineExplorer = () => {
          log.info(
            chalk.cyan('[openPathCrossPlatform] Trying Wine explorer...'),
          );
          exec(`explorer.exe "${targetPath}"`, (error) => {
            if (error) {
              log.warn(
                chalk.yellow('[openPathCrossPlatform] Wine explorer failed:'),
                error.message,
              );
              tryWineBrowse();
            } else {
              log.info(
                chalk.green(
                  '[openPathCrossPlatform] Successfully opened with Wine explorer',
                ),
              );
              resolve({ success: true });
            }
          });
        };

        // Method 2: Try winebrowser which is designed to open URLs/files with host apps
        const tryWineBrowse = () => {
          log.info(chalk.cyan('[openPathCrossPlatform] Trying winebrowser...'));
          // winebrowser can sometimes delegate to the host system's file manager
          exec(`winebrowser "${targetPath}"`, (error) => {
            if (error) {
              log.warn(
                chalk.yellow('[openPathCrossPlatform] winebrowser failed:'),
                error.message,
              );
              tryShellOpen();
            } else {
              log.info(
                chalk.green(
                  '[openPathCrossPlatform] Successfully opened with winebrowser',
                ),
              );
              resolve({ success: true });
            }
          });
        };

        // Method 3: Fallback to Electron's shell.openPath
        const tryShellOpen = () => {
          log.info(
            chalk.cyan(
              '[openPathCrossPlatform] Trying Electron shell.openPath fallback...',
            ),
          );
          shell
            .openPath(targetPath)
            .then((result) => {
              if (result) {
                log.error(
                  chalk.red(
                    '[openPathCrossPlatform] All methods failed. Last error:',
                  ),
                  result,
                );
                const errorMsg = unixPath
                  ? `Failed to open folder. Please navigate manually to: ${unixPath}`
                  : `Failed to open folder. Please navigate manually to: ${targetPath}`;
                resolve({
                  success: false,
                  error: errorMsg,
                });
                return undefined;
              }

              log.info(
                chalk.green(
                  '[openPathCrossPlatform] Successfully opened with shell.openPath',
                ),
              );
              resolve({ success: true });
              return undefined;
            })
            .catch((error) => {
              log.error(
                chalk.red(
                  '[openPathCrossPlatform] shell.openPath threw error:',
                ),
                error,
              );
              resolve({
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to open path',
              });
            });
        };

        // Start the chain of attempts
        tryWineExplorer();
      });
    }
    // Native Windows - use shell.openPath
    const result = await shell.openPath(targetPath);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
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
export async function createDesktopShortcut(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Only create shortcuts on native Windows, not under Wine
    if (isRunningUnderWine()) {
      log.info(
        chalk.cyan(
          '[createDesktopShortcut] Running under Wine - skipping shortcut creation',
        ),
      );
      log.info(
        chalk.cyan(
          '[createDesktopShortcut] Users should create shortcuts manually via their Linux desktop environment',
        ),
      );
      return { success: true };
    }

    // Windows shortcut (.lnk)
    const desktopPath = path.join(app.getPath('home'), 'Desktop');

    // Ensure desktop directory exists
    if (!fs.existsSync(desktopPath)) {
      log.info(
        chalk.yellow('[createDesktopShortcut] Desktop folder not found at:'),
        desktopPath,
      );
      return { success: true }; // Not an error, just no desktop folder
    }

    const shortcutPath = path.join(desktopPath, 'Eventide Launcher.lnk');

    // Check if shortcut already exists
    if (fs.existsSync(shortcutPath)) {
      log.info(
        chalk.cyan('[createDesktopShortcut] Shortcut already exists at:'),
        shortcutPath,
      );
      return { success: true };
    }

    // Also check for the alternative name that NSIS might create
    const altShortcutPath = path.join(
      desktopPath,
      'Eventide-FFXI-Launcher.lnk',
    );
    if (fs.existsSync(altShortcutPath)) {
      log.info(
        chalk.cyan('[createDesktopShortcut] NSIS shortcut already exists at:'),
        altShortcutPath,
      );
      return { success: true };
    }

    // Get the path to the launcher executable
    const exePath = app.getPath('exe');

    // Find icon path - check resources folder first, then app directory
    let iconPath = '';
    const possibleIconPaths = [
      path.join(path.dirname(exePath), 'resources', 'assets', 'icon.ico'),
      path.join(path.dirname(exePath), 'resources', 'icon.ico'),
      path.join(path.dirname(exePath), '..', 'resources', 'assets', 'icon.ico'),
      exePath, // Fallback to exe itself which may have embedded icon
    ];

    for (const candidate of possibleIconPaths) {
      if (fs.existsSync(candidate)) {
        iconPath = candidate;
        break;
      }
    }

    // Create the shortcut using Electron's shell.writeShortcutLink
    const success = shell.writeShortcutLink(shortcutPath, {
      target: exePath,
      description: 'Eventide FFXI Launcher',
      cwd: path.dirname(exePath),
      icon: iconPath || exePath,
      iconIndex: 0,
    });

    if (success) {
      log.info(
        chalk.green(
          '[createDesktopShortcut] ✓ Desktop shortcut created successfully at:',
        ),
        shortcutPath,
      );
      return { success: true };
    }
    log.warn(
      chalk.yellow('[createDesktopShortcut] Failed to create desktop shortcut'),
    );
    return {
      success: false,
      error: 'Failed to create shortcut (unknown reason)',
    };
  } catch (err) {
    log.error(
      chalk.red('[createDesktopShortcut] Error creating desktop shortcut:'),
      err,
    );
    return {
      success: false,
      error: `Failed to create desktop shortcut: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Removes the desktop shortcut to the launcher (Windows only)
 * Called during uninstallation
 */
export async function removeDesktopShortcut(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Only remove shortcuts on native Windows, not under Wine
    if (isRunningUnderWine()) {
      log.info(
        chalk.cyan(
          '[removeDesktopShortcut] Running under Wine - skipping shortcut removal',
        ),
      );
      return { success: true };
    }

    const desktopPath = path.join(app.getPath('home'), 'Desktop');

    // Check if desktop folder exists
    if (!fs.existsSync(desktopPath)) {
      log.info(
        chalk.yellow('[removeDesktopShortcut] Desktop folder not found'),
      );
      return { success: true };
    }

    // Remove the main shortcut name
    const shortcutPath = path.join(desktopPath, 'Eventide Launcher.lnk');
    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
      log.info(
        chalk.green('[removeDesktopShortcut] ✓ Removed desktop shortcut:'),
        shortcutPath,
      );
    }

    // Also remove the alternative name that NSIS might create
    const altShortcutPath = path.join(
      desktopPath,
      'Eventide-FFXI-Launcher.lnk',
    );
    if (fs.existsSync(altShortcutPath)) {
      fs.unlinkSync(altShortcutPath);
      log.info(
        chalk.green('[removeDesktopShortcut] ✓ Removed NSIS desktop shortcut:'),
        altShortcutPath,
      );
    }

    // Also check for EventideXI.lnk (electron-builder default)
    const builderShortcutPath = path.join(desktopPath, 'EventideXI.lnk');
    if (fs.existsSync(builderShortcutPath)) {
      fs.unlinkSync(builderShortcutPath);
      log.info(
        chalk.green(
          '[removeDesktopShortcut] ✓ Removed builder desktop shortcut:',
        ),
        builderShortcutPath,
      );
    }

    return { success: true };
  } catch (err) {
    log.error(
      chalk.red('[removeDesktopShortcut] Error removing desktop shortcut:'),
      err,
    );
    return {
      success: false,
      error: `Failed to remove desktop shortcut: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Removes the Linux .desktop file for Wine/Linux users
 * Called during uninstallation
 *
 * Uses Node.js fs operations which work under Wine via the Z: drive mapping.
 */
export async function removeLinuxDesktopFile(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isRunningUnderWine()) {
    log.info(
      chalk.cyan('[removeLinuxDesktopFile] Not running under Wine - skipping'),
    );
    return { success: true };
  }

  try {
    const home = getLinuxHome();
    if (!home) {
      log.warn(
        chalk.yellow(
          '[removeLinuxDesktopFile] Cannot determine Linux home directory - skipping',
        ),
      );
      return { success: true };
    }

    const desktopFilePath = `${home}/.local/share/applications/eventidexi.desktop`;
    // Convert to Wine Z: drive path for fs operations
    const desktopFilePathWine = `Z:${desktopFilePath.replace(/\//g, '\\')}`;

    try {
      await fs.promises.access(desktopFilePathWine);
      await fs.promises.unlink(desktopFilePathWine);
      log.info(
        chalk.green('[removeLinuxDesktopFile] ✓ Removed Linux .desktop file:'),
        desktopFilePath,
      );
      return { success: true };
    } catch (accessError: unknown) {
      const err = accessError as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        log.info(
          chalk.cyan(
            '[removeLinuxDesktopFile] No .desktop file found to remove',
          ),
        );
        return { success: true };
      }
      throw accessError;
    }
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
 *
 * IMPORTANT: Under Wine, exec() runs in the Wine/Windows context, so shell commands
 * like /bin/sh, mkdir -p, etc. will NOT work. We use Node.js fs operations instead,
 * which work correctly because they operate on the Wine filesystem mapping.
 */
export async function createLinuxDesktopFile(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isRunningUnderWine()) {
    log.info(
      chalk.cyan('[createLinuxDesktopFile] Not running under Wine - skipping'),
    );
    return { success: true };
  }

  try {
    const winePrefix = getWinePrefix();
    const home = getLinuxHome();

    // Validate that we can determine the necessary paths
    if (!home) {
      log.warn(
        chalk.yellow(
          '[createLinuxDesktopFile] Cannot determine Linux home directory - skipping .desktop file creation',
        ),
      );
      log.warn(
        chalk.yellow(
          '[createLinuxDesktopFile] Set WINEPREFIX or HOME environment variable to enable this feature',
        ),
      );
      return {
        success: false,
        error:
          'Cannot determine Linux home directory. Please set WINEPREFIX environment variable.',
      };
    }

    if (!winePrefix) {
      log.warn(
        chalk.yellow(
          '[createLinuxDesktopFile] Cannot determine Wine prefix - skipping .desktop file creation',
        ),
      );
      return {
        success: false,
        error:
          'Cannot determine Wine prefix. Please set WINEPREFIX environment variable.',
      };
    }

    log.info(
      chalk.cyan(
        `[createLinuxDesktopFile] Using home: ${home}, winePrefix: ${winePrefix}`,
      ),
    );

    // Get the Windows path to the executable
    const exePathWindows = app.getPath('exe');

    // Convert Windows path to Unix path for the working directory
    const exePathUnix = windowsToUnixPath(exePathWindows);
    const exeDirUnix = exePathUnix ? path.posix.dirname(exePathUnix) : null;

    // Determine the desktop file path (Unix path)
    const desktopDir = `${home}/.local/share/applications`;
    const desktopFilePath = `${desktopDir}/eventidexi.desktop`;

    // Convert Unix path to Wine Z: drive path for file operations
    // Wine maps / to Z:\, so /home/user becomes Z:\home\user
    const desktopDirWine = `Z:${desktopDir.replace(/\//g, '\\\\')}`;
    const desktopFilePathWine = `Z:${desktopFilePath.replace(/\//g, '\\\\')}`;

    log.info(
      chalk.cyan(
        `[createLinuxDesktopFile] Desktop dir (Wine path): ${desktopDirWine}`,
      ),
    );
    log.info(
      chalk.cyan(
        `[createLinuxDesktopFile] Desktop file (Wine path): ${desktopFilePathWine}`,
      ),
    );

    // Check if it already exists using Wine path
    try {
      await fs.promises.access(desktopFilePathWine);
      log.info(
        chalk.cyan('[createLinuxDesktopFile] Desktop file already exists at:'),
        desktopFilePath,
      );
      return { success: true };
    } catch {
      // File doesn't exist, continue creating it
    }

    // Try to find an icon - look for common icon locations
    let iconPath = 'application-x-executable'; // Default fallback

    if (exeDirUnix) {
      const possibleIconPaths = [
        `${exeDirUnix}/resources/icon.png`,
        `${exeDirUnix}/resources/app/assets/icon.png`,
        `${exeDirUnix}/../resources/icon.png`,
        `${winePrefix}/drive_c/users/${process.env.USER || process.env.LOGNAME || 'user'}/AppData/Local/Programs/eventidexi/resources/icon.png`,
      ];

      for (const iconCandidate of possibleIconPaths) {
        try {
          // Convert to Wine path for access check
          const iconWinePath = `Z:${iconCandidate.replace(/\//g, '\\\\')}`;
          await fs.promises.access(iconWinePath);
          iconPath = iconCandidate; // Use Unix path in .desktop file
          log.info(
            chalk.cyan(`[createLinuxDesktopFile] Found icon at: ${iconPath}`),
          );
          break;
        } catch {
          // Icon not found at this path, try next
        }
      }
    }

    // Create the .desktop file content
    const desktopFileContent = `[Desktop Entry]
Name=EventideXI
Comment=A launcher for the private FFXI private server called Eventide.
Exec=env "WINEPREFIX=${winePrefix}" wine "${exePathWindows.replace(/\\/g, '\\\\')}"
Type=Application
StartupNotify=true
Path=${exeDirUnix || winePrefix}
Icon=${iconPath}
StartupWMClass=eventidexi.exe
Categories=Game;
`;

    // Create the applications directory if it doesn't exist using Node.js fs
    // This works under Wine because Wine maps Z: to the Linux filesystem
    try {
      await fs.promises.mkdir(desktopDirWine, { recursive: true });
      log.info(
        chalk.cyan(`[createLinuxDesktopFile] Created directory: ${desktopDir}`),
      );
    } catch (mkdirError: unknown) {
      // Directory might already exist, which is fine
      const err = mkdirError as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        log.warn(
          chalk.yellow(
            `[createLinuxDesktopFile] Could not create directory: ${err.message}`,
          ),
        );
      }
    }

    // Write the .desktop file using Node.js fs
    try {
      await fs.promises.writeFile(desktopFilePathWine, desktopFileContent, {
        mode: 0o755,
      });
      log.info(
        chalk.green(
          '[createLinuxDesktopFile] ✓ Linux .desktop file created at:',
        ),
        desktopFilePath,
      );
      return { success: true };
    } catch (writeError: unknown) {
      const err = writeError as Error;
      log.error(
        chalk.red('[createLinuxDesktopFile] Failed to write .desktop file:'),
        err.message,
      );
      return {
        success: false,
        error: `Failed to create .desktop file: ${err.message}`,
      };
    }
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
 *
 * Uses Node.js fs operations which work under Wine via the Z: drive mapping.
 */
export async function removeWineDesktopFile(): Promise<void> {
  if (!isRunningUnderWine()) {
    return;
  }

  try {
    const home = getLinuxHome();
    if (!home) {
      log.warn(
        chalk.yellow(
          '[removeWineDesktopFile] Cannot determine Linux home directory - skipping',
        ),
      );
      return;
    }

    // Wine typically creates .desktop files in these locations with various naming patterns
    const possiblePaths = [
      `${home}/.local/share/applications/wine/Programs/EventideXI.desktop`,
      `${home}/.local/share/applications/wine-Programs-EventideXI.desktop`,
      `${home}/Desktop/EventideXI.desktop`,
    ];

    for (const desktopPath of possiblePaths) {
      try {
        // Convert to Wine Z: drive path for fs operations
        const desktopPathWine = `Z:${desktopPath.replace(/\//g, '\\')}`;
        await fs.promises.access(desktopPathWine);
        await fs.promises.unlink(desktopPathWine);
        log.info(
          chalk.green(
            '[removeWineDesktopFile] Removed broken Wine .desktop file:',
          ),
          desktopPath,
        );
      } catch {
        // File doesn't exist or can't be removed, ignore
      }
    }
  } catch (err) {
    log.warn(
      chalk.yellow(
        '[removeWineDesktopFile] Error cleaning up Wine .desktop files:',
      ),
      err,
    );
  }
}
