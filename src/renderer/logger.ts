import log from 'electron-log/renderer';

// Determine if running in production mode
// In renderer, we check if devTools and other dev features are available
const isProduction = process.env.NODE_ENV === 'production';

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

// Configure electron-log for the renderer process
if (log.transports.file) {
  log.transports.file.level = isProduction ? 'warn' : 'debug';
}
if (log.transports.console) {
  log.transports.console.level = isProduction ? 'error' : 'debug';
  // Format log messages
  log.transports.console.format = isProduction
    ? '[{level}] {text}'
    : '[{h}:{i}:{s}.{ms}] [{level}] {text}';
}

// Create a sanitized logger wrapper
const sanitizedLogger = {
  debug: createSanitizedLogFn(log.debug.bind(log), 'debug'),
  info: createSanitizedLogFn(log.info.bind(log), 'info'),
  warn: createSanitizedLogFn(log.warn.bind(log), 'warn'),
  error: createSanitizedLogFn(log.error.bind(log), 'error'),
  // Expose the original log for cases where raw logging is needed
  _raw: log,
  // Pass through other electron-log properties for compatibility
  transports: log.transports,
  functions: log.functions,
};

// Export logger with sanitization
export default sanitizedLogger;

