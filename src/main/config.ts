import path from 'path';
import { app } from 'electron';

/**
 * Centralized configuration and constants for the main process.
 */
export const IS_PROD = process.env.NODE_ENV === 'production';
export const IS_DEV = !IS_PROD;

export const RELEASE_JSON_URL = 'https://pub-9064140a8f58435fb0d04461223da0f2.r2.dev/release.json';

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
