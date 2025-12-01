import path from 'path';
import { app } from 'electron';

// Re-export shared constants for convenience
export { RELEASE_JSON_URL } from '../core/constants';

/**
 * Centralized configuration and constants for the main process.
 */
export const IS_PROD = process.env.NODE_ENV === 'production';
export const IS_DEV = !IS_PROD;

export function getResourcePath(relPath: string): string {
  return IS_PROD
    ? path.join(process.resourcesPath, relPath)
    : path.join(__dirname, '../../', relPath);
}

export function getGameInstallDir(): string {
  if (IS_PROD) {
    return path.dirname(path.join(process.resourcesPath, 'ashita-cli.exe'));
  }
  return path.join(__dirname, '../../Eventide-test');
}

export function getExePath(): string {
  return IS_PROD
    ? path.join(process.resourcesPath, 'ashita-cli.exe')
    : path.join(getGameInstallDir(), 'ashita-cli.exe');
}
