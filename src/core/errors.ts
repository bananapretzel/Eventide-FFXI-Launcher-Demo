// Error categorization and user-friendly messaging
import log from 'electron-log';
import chalk from 'chalk';

export enum ErrorCategory {
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  VERIFICATION = 'verification',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  RETRYABLE = 'retryable',
  FATAL = 'fatal',
}

export interface CategorizedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  technicalMessage: string;
  userMessage: string;
  suggestions: string[];
  originalError?: Error;
}

/**
 * Categorize an error and provide user-friendly messaging
 */
export function categorizeError(error: any): CategorizedError {
  const errorMessage = String(error?.message || error);

  log.info(
    chalk.cyan(
      `[categorizeError] Analyzing error: ${errorMessage.substring(0, 100)}`,
    ),
  );

  // Network errors - retryable
  if (
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('network') ||
    errorMessage.includes('HTTP') ||
    errorMessage.includes('fetch')
  ) {
    return {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.RETRYABLE,
      technicalMessage: errorMessage,
      userMessage: 'Unable to connect to the update server.',
      suggestions: [
        'Check your internet connection',
        'Disable VPN or proxy if enabled',
        'Check firewall settings',
        'Try again in a few moments',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Size/verification errors - retryable
  if (
    errorMessage.includes('Size mismatch') ||
    errorMessage.includes('SHA256 mismatch') ||
    errorMessage.includes('checksum') ||
    errorMessage.includes('verification failed')
  ) {
    return {
      category: ErrorCategory.VERIFICATION,
      severity: ErrorSeverity.RETRYABLE,
      technicalMessage: errorMessage,
      userMessage: 'Downloaded file is corrupted or incomplete.',
      suggestions: [
        'The download may have been interrupted',
        'Try downloading again',
        'Check available disk space',
        'If problem persists, contact support',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Filesystem errors
  if (
    errorMessage.includes('EACCES') ||
    errorMessage.includes('EPERM') ||
    errorMessage.includes('permission')
  ) {
    return {
      category: ErrorCategory.FILESYSTEM,
      severity: ErrorSeverity.FATAL,
      technicalMessage: errorMessage,
      userMessage: 'Permission denied. Cannot write to game directory.',
      suggestions: [
        'Run the launcher as Administrator',
        'Check folder permissions',
        'Ensure antivirus is not blocking the launcher',
        'Try installing to a different location',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes('ENOSPC') ||
    errorMessage.includes('no space') ||
    errorMessage.includes('disk full')
  ) {
    return {
      category: ErrorCategory.FILESYSTEM,
      severity: ErrorSeverity.FATAL,
      technicalMessage: errorMessage,
      userMessage: 'Not enough disk space.',
      suggestions: [
        'Free up disk space on your drive',
        'Game requires at least 10GB of free space',
        'Try installing to a different drive',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  if (
    errorMessage.includes('ENOENT') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('does not exist')
  ) {
    return {
      category: ErrorCategory.FILESYSTEM,
      severity: ErrorSeverity.RETRYABLE,
      technicalMessage: errorMessage,
      userMessage: 'Required file or folder not found.',
      suggestions: [
        'Installation may be incomplete',
        'Try downloading again',
        'Check if antivirus quarantined files',
        'Verify installation path is correct',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Configuration errors
  if (
    errorMessage.includes('configuration') ||
    errorMessage.includes('config') ||
    errorMessage.includes('settings') ||
    errorMessage.includes('No client version found') ||
    errorMessage.includes('Cannot apply patches')
  ) {
    return {
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.FATAL,
      technicalMessage: errorMessage,
      userMessage: 'Game installation is missing or corrupted.',
      suggestions: [
        'Download the full game installation',
        'Do not download individual patches',
        'Contact support if you need help',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Extraction errors
  if (
    errorMessage.includes('extract') ||
    errorMessage.includes('unzip') ||
    errorMessage.includes('Extraction verification failed')
  ) {
    return {
      category: ErrorCategory.FILESYSTEM,
      severity: ErrorSeverity.RETRYABLE,
      technicalMessage: errorMessage,
      userMessage: 'Failed to extract game files.',
      suggestions: [
        'Downloaded archive may be corrupted',
        'Check available disk space',
        'Ensure antivirus is not blocking extraction',
        'Try downloading again',
      ],
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // Unknown errors
  return {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.FATAL,
    technicalMessage: errorMessage,
    userMessage: 'An unexpected error occurred.',
    suggestions: [
      'Try the operation again',
      'Restart the launcher',
      'Contact support if the problem persists',
      `Error details: ${errorMessage.substring(0, 100)}`,
    ],
    originalError: error instanceof Error ? error : undefined,
  };
}

/**
 * Format error for display to user
 */
export function formatErrorForUser(error: CategorizedError): string {
  let message = `**${error.userMessage}**\n\n`;

  if (error.suggestions.length > 0) {
    message += `**What you can try:**\n`;
    error.suggestions.forEach((suggestion) => {
      message += `• ${suggestion}\n`;
    });
  }

  return message.trim();
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: any): boolean {
  const categorized = categorizeError(error);
  return categorized.severity === ErrorSeverity.RETRYABLE;
}
