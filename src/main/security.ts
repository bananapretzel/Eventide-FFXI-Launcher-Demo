import log from 'electron-log';
import chalk from 'chalk';

/**
 * Validates that a URL is safe for external opening
 * Prevents command injection by blocking dangerous protocols
 */
export function isUrlSafeForExternal(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const allowedProtocols = ['https:', 'http:'];
    if (!allowedProtocols.includes(url.protocol)) {
      log.warn(chalk.yellow(`[Security] Blocked unsafe protocol: ${url.protocol} for URL: ${urlString}`));
      return false;
    }
    return true;
  } catch (err) {
    log.error(chalk.red('[Security] Invalid URL format:'), urlString, err);
    return false;
  }
}

/**
 * Sanitizes user input to remove potentially problematic characters
 * Removes control characters and null bytes
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const sanitized = input.trim().replace(/[\x00-\x1F\x7F]/g, '');
  return sanitized;
}
