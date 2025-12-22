import log from 'electron-log';
import chalk from 'chalk';

/**
 * Validates that a URL is safe for external opening
 * Prevents command injection by blocking dangerous protocols
 */
export function isUrlSafeForExternal(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    const hostname = url.hostname.toLowerCase();
    const isDevelopment = process.env.NODE_ENV === 'development';

    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';

    // Only allow http in development, and only to localhost.
    if (url.protocol === 'http:') {
      if (isDevelopment && isLocalhost) {
        return true;
      }
      log.warn(
        chalk.yellow(`[Security] Blocked non-local http URL: ${urlString}`),
      );
      return false;
    }

    // Default: only allow https in production.
    if (url.protocol !== 'https:') {
      log.warn(
        chalk.yellow(
          `[Security] Blocked unsafe protocol: ${url.protocol} for URL: ${urlString}`,
        ),
      );
      return false;
    }

    // Restrict external opens to known/trusted hosts.
    // This prevents arbitrary links from being launched via the app.
    const allowedHostSuffixes = [
      'eventide-xi.com',
      'discord.gg',
      'github.com',
      'githubusercontent.com',
      'raw.githubusercontent.com',
      'ashitaxi.com',
    ];

    const isAllowedHost = allowedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

    if (!isAllowedHost) {
      log.warn(
        chalk.yellow(
          `[Security] Blocked external URL to non-allowlisted host: ${hostname} (${urlString})`,
        ),
      );
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
  const trimmed = input.trim();
  let out = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    // Strip C0 control chars and DEL.
    if (code < 0x20 || code === 0x7f) {
      continue;
    }
    out += trimmed[i];
  }
  return out;
}
