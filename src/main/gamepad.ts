/**
 * Gamepad Configuration Utility
 *
 * Reads FFXI gamepad/controller settings from Windows registry and applies them to the INI file.
 * Supports Windows 10/11 and Linux (via Wine registry).
 *
 * The gamepad settings are stored in:
 * Windows: HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\PlayOnlineUS\SquareEnix\FinalFantasyXI
 * Wine: ~/.wine/system.reg (or custom WINEPREFIX)
 *
 * Key values:
 * - padmode000: Controller mode configuration (REG_SZ)
 * - padsin000: Controller button mapping (REG_SZ)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import log from './logger';

const execAsync = promisify(exec);

/**
 * Registry path for FFXI gamepad settings
 */
const REGISTRY_PATH_WINDOWS =
  'HKLM\\SOFTWARE\\WOW6432Node\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI';
const REGISTRY_PATH_WINE =
  'Software\\\\WOW6432Node\\\\PlayOnlineUS\\\\SquareEnix\\\\FinalFantasyXI';

/**
 * Gamepad configuration values
 */
export interface GamepadConfig {
  padmode000: string | null;
  padsin000: string | null;
}

/**
 * Read gamepad settings from Windows registry using reg query
 * @returns Promise<GamepadConfig> - The gamepad configuration values
 */
async function readWindowsRegistry(): Promise<GamepadConfig> {
  const config: GamepadConfig = {
    padmode000: null,
    padsin000: null,
  };

  try {
    // Query padmode000
    try {
      const { stdout: padmodeOutput } = await execAsync(
        `reg query "${REGISTRY_PATH_WINDOWS}" /v padmode000`,
        { windowsHide: true },
      );
      const padmodeMatch = padmodeOutput.match(/padmode000\s+REG_SZ\s+(.+)/i);
      if (padmodeMatch) {
        config.padmode000 = padmodeMatch[1].trim();
        log.info(
          chalk.cyan('[Gamepad] Found padmode000 in registry:'),
          config.padmode000,
        );
      }
    } catch (_err) {
      log.info(
        chalk.yellow(
          '[Gamepad] padmode000 not found in registry, will use existing INI value',
        ),
      );
    }

    // Query padsin000
    try {
      const { stdout: padsinOutput } = await execAsync(
        `reg query "${REGISTRY_PATH_WINDOWS}" /v padsin000`,
        { windowsHide: true },
      );
      const padsinMatch = padsinOutput.match(/padsin000\s+REG_SZ\s+(.+)/i);
      if (padsinMatch) {
        config.padsin000 = padsinMatch[1].trim();
        log.info(
          chalk.cyan('[Gamepad] Found padsin000 in registry:'),
          config.padsin000,
        );
      }
    } catch (_err) {
      log.info(
        chalk.yellow(
          '[Gamepad] padsin000 not found in registry, will use existing INI value',
        ),
      );
    }
  } catch (error) {
    log.warn(chalk.yellow('[Gamepad] Failed to read Windows registry:'), error);
  }

  return config;
}

/**
 * Read gamepad settings from Wine registry file
 * Wine stores registry in plain text files that can be parsed
 * @param winePrefix - Optional custom Wine prefix path
 * @returns Promise<GamepadConfig> - The gamepad configuration values
 */
async function readWineRegistry(winePrefix?: string): Promise<GamepadConfig> {
  const config: GamepadConfig = {
    padmode000: null,
    padsin000: null,
  };

  // Determine Wine prefix path
  const prefix =
    winePrefix || process.env.WINEPREFIX || path.join(os.homedir(), '.wine');
  const systemRegPath = path.join(prefix, 'system.reg');

  try {
    if (!(await fs.pathExists(systemRegPath))) {
      log.info(
        chalk.yellow(
          `[Gamepad] Wine system.reg not found at: ${systemRegPath}`,
        ),
      );
      return config;
    }

    log.info(
      chalk.cyan(`[Gamepad] Reading Wine registry from: ${systemRegPath}`),
    );
    const regContent = await fs.readFile(systemRegPath, 'utf-8');

    // Find the FFXI registry section
    // Wine registry format uses backslash-escaped paths and lowercase
    const sectionRegex = new RegExp(
      `\\[${REGISTRY_PATH_WINE}\\]([\\s\\S]*?)(?=\\n\\[|$)`,
      'i',
    );
    const sectionMatch = regContent.match(sectionRegex);

    if (sectionMatch) {
      const [, sectionContent = ''] = sectionMatch;

      // Parse padmode000 - Wine format: "padmode000"="value"
      const padmodeMatch = sectionContent.match(
        /"padmode000"\s*=\s*"([^"]*)"/i,
      );
      if (padmodeMatch) {
        const [, padmodeValue = null] = padmodeMatch;
        config.padmode000 = padmodeValue;
        log.info(
          chalk.cyan('[Gamepad] Found padmode000 in Wine registry:'),
          config.padmode000,
        );
      }

      // Parse padsin000
      const padsinMatch = sectionContent.match(/"padsin000"\s*=\s*"([^"]*)"/i);
      if (padsinMatch) {
        const [, padsinValue = null] = padsinMatch;
        config.padsin000 = padsinValue;
        log.info(
          chalk.cyan('[Gamepad] Found padsin000 in Wine registry:'),
          config.padsin000,
        );
      }
    } else {
      log.info(
        chalk.yellow('[Gamepad] FFXI section not found in Wine registry'),
      );
    }
  } catch (error) {
    log.warn(chalk.yellow('[Gamepad] Failed to read Wine registry:'), error);
  }

  return config;
}

/**
 * Read gamepad configuration from the appropriate registry based on platform
 * @param winePrefix - Optional Wine prefix for Linux users
 * @returns Promise<GamepadConfig> - The gamepad configuration
 */
export async function readGamepadConfig(
  winePrefix?: string,
): Promise<GamepadConfig> {
  const { platform } = process;

  if (platform === 'win32') {
    log.info(
      chalk.cyan('[Gamepad] Reading gamepad config from Windows registry'),
    );
    return readWindowsRegistry();
  }
  if (platform === 'linux' || platform === 'darwin') {
    // macOS users might also use Wine/CrossOver
    log.info(chalk.cyan('[Gamepad] Reading gamepad config from Wine registry'));
    return readWineRegistry(winePrefix);
  }
  log.info(
    chalk.yellow(
      `[Gamepad] Unsupported platform: ${platform}, skipping gamepad config`,
    ),
  );
  return { padmode000: null, padsin000: null };
}

/**
 * Apply gamepad configuration to INI config object
 * Only updates values if they were found in the registry
 * @param config - The INI config object to modify
 * @param gamepadConfig - The gamepad configuration from registry
 */
export function applyGamepadConfigToIni(
  config: any,
  gamepadConfig: GamepadConfig,
): void {
  // Ensure the ffxi.registry section exists
  if (!config.ffxi) {
    config.ffxi = {};
  }
  if (!config.ffxi.registry) {
    config.ffxi.registry = {};
  }

  // Only update if we found values in the registry
  if (gamepadConfig.padmode000 !== null) {
    config.ffxi.registry.padmode000 = gamepadConfig.padmode000;
    log.info(chalk.cyan('[Gamepad] Applied padmode000 to INI config'));
  }

  if (gamepadConfig.padsin000 !== null) {
    config.ffxi.registry.padsin000 = gamepadConfig.padsin000;
    log.info(chalk.cyan('[Gamepad] Applied padsin000 to INI config'));
  }
}
