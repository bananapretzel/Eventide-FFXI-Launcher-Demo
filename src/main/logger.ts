import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// Determine if running in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Maximum log file size (5MB) - electron-log will rotate automatically
const MAX_LOG_SIZE = 5 * 1024 * 1024;

/**
 * Sanitizes a log message to remove sensitive information:
 * - User names from file paths
 * - Environment variable values
 * - Credentials, tokens, passwords
 * - Email addresses
 */
function sanitizeLogMessage(message: unknown): unknown {
  if (message === null || message === undefined) {
    return message;
  }

  if (typeof message === 'string') {
    let sanitized = message;

    // Remove Windows user paths (C:\Users\USERNAME\...)
    sanitized = sanitized.replace(
      /([A-Za-z]:\\Users\\)[^\\]+/gi,
      '$1<user>'
    );

    // Remove Unix user paths (/home/username/... or /Users/username/...)
    sanitized = sanitized.replace(
      /(\/(?:home|Users)\/)[^/]+/gi,
      '$1<user>'
    );

    // Remove Wine prefix paths with usernames
    sanitized = sanitized.replace(
      /(\.wine\/drive_c\/users\/)[^/]+/gi,
      '$1<user>'
    );

    // Remove AppData paths with usernames
    sanitized = sanitized.replace(
      /(AppData\\(?:Local|Roaming)\\)/gi,
      'AppData\\<type>\\'
    );

    // Remove email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '<email>'
    );

    // Remove potential credentials/tokens (basic patterns)
    sanitized = sanitized.replace(
      /(password|passwd|pwd|token|secret|apikey|api_key|auth|credential)[=:]\s*["']?[^"'\s]+["']?/gi,
      '$1=<redacted>'
    );

    return sanitized;
  }

  if (typeof message === 'object') {
    if (message instanceof Error) {
      // Sanitize error messages but preserve error type
      const sanitizedError = new Error(sanitizeLogMessage(message.message) as string);
      sanitizedError.name = message.name;
      // Don't include stack traces in production
      if (!isProduction) {
        sanitizedError.stack = sanitizeLogMessage(message.stack) as string;
      }
      return sanitizedError;
    }

    if (Array.isArray(message)) {
      return message.map(sanitizeLogMessage);
    }

    // Sanitize object properties
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(message)) {
      // Skip sensitive keys entirely
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('apikey')
      ) {
        sanitizedObj[key] = '<redacted>';
      } else {
        sanitizedObj[key] = sanitizeLogMessage(value);
      }
    }
    return sanitizedObj;
  }

  return message;
}

/**
 * Creates a wrapped logger function that sanitizes messages
 */
function createSanitizedLogFn(
  originalFn: (...args: unknown[]) => void,
  level: 'debug' | 'info' | 'warn' | 'error'
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    // In production, skip debug logs entirely
    if (isProduction && level === 'debug') {
      return;
    }

    // Sanitize all arguments
    const sanitizedArgs = args.map(sanitizeLogMessage);
    originalFn(...sanitizedArgs);
  };
}

// Configure electron-log for the main process
if (isProduction) {
  // Production: only warn and error to file, errors to console
  log.transports.file.level = 'warn';
  log.transports.console.level = 'error';
} else {
  // Development: full debug logging
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';
}

// Set log file location and size limit
if (app) {
  const userDataPath = app.getPath('userData');
  log.transports.file.resolvePathFn = () => path.join(userDataPath, 'logs', 'main.log');
  log.transports.file.maxSize = MAX_LOG_SIZE;
}

// Format log messages (simpler format for production)
if (isProduction) {
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
  log.transports.console.format = '[{level}] {text}';
} else {
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
}

// Create a sanitized logger wrapper
const sanitizedLogger = {
  debug: createSanitizedLogFn(log.debug.bind(log), 'debug'),
  info: createSanitizedLogFn(log.info.bind(log), 'info'),
  warn: createSanitizedLogFn(log.warn.bind(log), 'warn'),
  error: createSanitizedLogFn(log.error.bind(log), 'error'),
  // Expose the original log for cases where raw logging is needed (testing, etc.)
  _raw: log,
  // Pass through other electron-log properties for compatibility
  transports: log.transports,
  functions: log.functions,
};

// Export the sanitized logger
export default sanitizedLogger;

