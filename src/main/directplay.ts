/**
 * DirectPlay utility for Windows
 *
 * DirectPlay is a legacy Windows feature required for older games like FFXI.
 * This module provides functions to check if DirectPlay is enabled and prompt
 * the user to enable it using Windows' built-in feature installation dialog.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { dialog } from 'electron';
import chalk from 'chalk';
import log from './logger';

const execAsync = promisify(exec);

let hasPromptedThisSession = false;

/**
 * Check if DirectPlay is enabled on Windows using DISM
 * @returns Promise<boolean> - true if DirectPlay is enabled, false otherwise
 */
export async function isDirectPlayEnabled(): Promise<boolean> {
  // Only relevant on Windows
  if (process.platform !== 'win32') {
    log.info(chalk.cyan('[DirectPlay] Not on Windows, skipping check'));
    return true;
  }

  try {
    // Use DISM to query the DirectPlay feature state
    const { stdout } = await execAsync(
      'dism /online /get-featureinfo /featurename:DirectPlay',
      { windowsHide: true },
    );

    // Check if the feature is enabled
    const isEnabled =
      stdout.toLowerCase().includes('state : enabled') ||
      stdout.toLowerCase().includes('state: enabled');

    log.info(
      chalk.cyan(
        `[DirectPlay] Feature state check: ${isEnabled ? 'Enabled' : 'Disabled'}`,
      ),
    );
    return isEnabled;
  } catch (err) {
    // If DISM fails, try alternative method using registry
    log.warn(
      chalk.yellow('[DirectPlay] DISM check failed, trying registry check'),
      err,
    );
    return checkDirectPlayRegistry();
  }
}

/**
 * Alternative check using registry (fallback if DISM fails)
 */
async function checkDirectPlayRegistry(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\DirectPlay" /s',
      { windowsHide: true },
    );
    // If the query succeeds and has content, DirectPlay components exist
    const hasContent = stdout.trim().length > 50;
    log.info(
      chalk.cyan(
        `[DirectPlay] Registry check: ${hasContent ? 'Found' : 'Not found'}`,
      ),
    );
    return hasContent;
  } catch {
    // Registry key doesn't exist or error - assume not installed
    log.info(chalk.cyan('[DirectPlay] Registry check: Not found'));
    return false;
  }
}

/**
 * Prompt the user to enable DirectPlay using Windows Optional Features dialog
 * This triggers the same UI that other launchers use
 * @returns Promise<'enabled' | 'skipped' | 'error'> - Result of the operation
 */
export async function promptEnableDirectPlay(): Promise<
  'enabled' | 'skipped' | 'error'
> {
  if (process.platform !== 'win32') {
    return 'skipped';
  }

  try {
    // Show explanation dialog first
    const response = await dialog.showMessageBox({
      type: 'info',
      title: 'DirectPlay Required',
      message: 'Final Fantasy XI requires DirectPlay to run properly.',
      detail:
        'DirectPlay is a Windows feature that needs to be enabled. ' +
        'Would you like to enable it now?\n\n' +
        'This will open the Windows Features dialog. ' +
        'You may need administrator privileges.',
      buttons: ['Enable DirectPlay', 'Skip (Not Recommended)', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });

    if (response.response === 2) {
      // User cancelled
      log.info(chalk.cyan('[DirectPlay] User cancelled DirectPlay prompt'));
      return 'skipped';
    }

    if (response.response === 1) {
      // User chose to skip
      log.info(
        chalk.yellow('[DirectPlay] User skipped DirectPlay installation'),
      );
      return 'skipped';
    }

    // User wants to enable DirectPlay
    log.info(
      chalk.cyan('[DirectPlay] User accepted, launching Windows Features...'),
    );

    // Method 1: Try using OptionalFeatures.exe which opens the Windows Features dialog
    // This is what most game launchers use and shows the friendly Windows UI
    try {
      // Start the optional features dialog
      // The /FeatureName parameter pre-selects DirectPlay
      exec('OptionalFeatures.exe', { windowsHide: false });

      // Show follow-up dialog explaining what to do
      await dialog.showMessageBox({
        type: 'info',
        title: 'Enable DirectPlay',
        message: 'Windows Features dialog has been opened.',
        detail:
          'Please find and check "Legacy Components" → "DirectPlay" in the list, ' +
          'then click OK to install.\n\n' +
          'After installation completes, you may need to restart your computer ' +
          'for the changes to take effect.',
        buttons: ['OK'],
      });

      return 'enabled';
    } catch (optionalFeaturesErr) {
      log.warn(
        chalk.yellow('[DirectPlay] OptionalFeatures.exe failed'),
        optionalFeaturesErr,
      );
    }

    // Method 2: Try using DISM to enable it directly (requires elevation)
    try {
      log.info(chalk.cyan('[DirectPlay] Trying DISM to enable DirectPlay...'));

      // This command needs to run elevated, so we'll use PowerShell with elevation
      const dismCommand =
        'Start-Process -FilePath "dism.exe" -ArgumentList "/online /enable-feature /featurename:DirectPlay /norestart" -Verb RunAs -Wait';
      await execAsync(`powershell -Command "${dismCommand}"`, {
        windowsHide: false,
      });

      // Verify it was enabled
      const enabled = await isDirectPlayEnabled();
      if (enabled) {
        log.info(chalk.green('[DirectPlay] Successfully enabled via DISM'));
        await dialog.showMessageBox({
          type: 'info',
          title: 'DirectPlay Enabled',
          message: 'DirectPlay has been successfully enabled!',
          detail:
            'You may need to restart your computer for the changes to take full effect.',
          buttons: ['OK'],
        });
        return 'enabled';
      }
    } catch (dismErr) {
      log.warn(chalk.yellow('[DirectPlay] DISM elevation failed'), dismErr);
    }

    // Method 3: Fall back to control panel applet
    try {
      log.info(chalk.cyan('[DirectPlay] Falling back to control panel...'));
      exec('control appwiz.cpl,,2', { windowsHide: false });

      await dialog.showMessageBox({
        type: 'info',
        title: 'Enable DirectPlay',
        message: 'Programs and Features has been opened.',
        detail:
          'Click "Turn Windows features on or off" in the left panel, ' +
          'then find and check "Legacy Components" → "DirectPlay" in the list.',
        buttons: ['OK'],
      });

      return 'enabled';
    } catch (cpErr) {
      log.error(chalk.red('[DirectPlay] All methods failed'), cpErr);
      return 'error';
    }
  } catch (err) {
    log.error(chalk.red('[DirectPlay] Error during DirectPlay prompt'), err);

    await dialog.showMessageBox({
      type: 'error',
      title: 'DirectPlay Error',
      message: 'Could not enable DirectPlay automatically.',
      detail:
        'Please enable DirectPlay manually:\n\n' +
        '1. Open Windows Settings\n' +
        '2. Go to Apps → Optional Features\n' +
        '3. Click "More Windows features"\n' +
        '4. Find and check "Legacy Components" → "DirectPlay"\n' +
        '5. Click OK and restart your computer',
      buttons: ['OK'],
    });

    return 'error';
  }
}

/**
 * Check DirectPlay and prompt user if not enabled
 * This is the main function to call during extraction
 * @param skipIfAlreadyPrompted - Whether to skip if user was already prompted
 * @returns Promise<boolean> - true if DirectPlay is ready or user was informed
 */
export async function ensureDirectPlay(
  skipIfAlreadyPrompted: boolean = false,
): Promise<boolean> {
  if (process.platform !== 'win32') {
    log.info(chalk.cyan('[DirectPlay] Not on Windows, skipping'));
    return true;
  }

  if (skipIfAlreadyPrompted && hasPromptedThisSession) {
    log.info(
      chalk.cyan('[DirectPlay] Already prompted this session; skipping prompt'),
    );
    return true;
  }

  log.info(chalk.cyan('[DirectPlay] Checking if DirectPlay is enabled...'));

  const isEnabled = await isDirectPlayEnabled();

  if (isEnabled) {
    log.info(chalk.green('[DirectPlay] DirectPlay is already enabled'));
    return true;
  }

  log.info(
    chalk.yellow('[DirectPlay] DirectPlay is not enabled, prompting user...'),
  );

  hasPromptedThisSession = true;

  const result = await promptEnableDirectPlay();

  // Return true even if skipped - we informed the user
  return result !== 'error';
}
