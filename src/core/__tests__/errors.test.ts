// Error categorization tests
// Mock electron-log with explicit mock implementation
import {
  categorizeError,
  formatErrorForUser,
  isRetryable,
  ErrorCategory,
  ErrorSeverity,
} from '../errors';

jest.mock('electron-log', () => {
  const mockFn = jest.fn();
  const mockLogger = {
    info: mockFn,
    warn: mockFn,
    error: mockFn,
    debug: mockFn,
    verbose: mockFn,
    silly: mockFn,
    log: mockFn,
    transports: {
      file: {
        level: 'debug',
        resolvePathFn: null,
        format: '',
        getFile: () => ({ path: '/mock' }),
      },
      console: { level: 'debug', format: '' },
      ipc: { level: 'debug' },
      remote: { level: 'debug' },
    },
    functions: { log: mockFn, info: mockFn, warn: mockFn, error: mockFn },
    catchErrors: mockFn,
    initialize: mockFn,
    scope: jest.fn().mockReturnThis(),
  };
  return {
    default: mockLogger,
    __esModule: true,
    ...mockLogger,
  };
});

describe('Error Categorization System', () => {
  describe('categorizeError', () => {
    it('should categorize network errors as NETWORK/RETRYABLE', () => {
      const errors = [
        new Error('ENOTFOUND example.com'),
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('ECONNRESET'),
        new Error('network error occurred'),
        new Error('HTTP 500 error'),
        new Error('fetch failed'),
      ];

      errors.forEach((error) => {
        const result = categorizeError(error);
        expect(result.category).toBe(ErrorCategory.NETWORK);
        expect(result.severity).toBe(ErrorSeverity.RETRYABLE);
        expect(result.userMessage).toContain('connect');
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should categorize verification errors as VERIFICATION/RETRYABLE', () => {
      const errors = [
        new Error('Size mismatch detected'),
        new Error('SHA256 mismatch'),
        new Error('checksum validation failed'),
        new Error('verification failed'),
      ];

      errors.forEach((error) => {
        const result = categorizeError(error);
        expect(result.category).toBe(ErrorCategory.VERIFICATION);
        expect(result.severity).toBe(ErrorSeverity.RETRYABLE);
        expect(result.userMessage).toContain('corrupted');
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should categorize permission errors as FILESYSTEM/FATAL', () => {
      const errors = [
        new Error('EACCES: permission denied'),
        new Error('EPERM: operation not permitted'),
        new Error('permission denied'),
      ];

      errors.forEach((error) => {
        const result = categorizeError(error);
        expect(result.category).toBe(ErrorCategory.FILESYSTEM);
        expect(result.severity).toBe(ErrorSeverity.FATAL);
        expect(result.userMessage).toContain('Permission');
        expect(result.suggestions).toContain(
          'Run the launcher as Administrator',
        );
      });
    });

    it('should categorize disk space errors as FILESYSTEM/FATAL', () => {
      const errors = [
        new Error('ENOSPC: no space left on device'),
        new Error('disk full'),
      ];

      errors.forEach((error) => {
        const result = categorizeError(error);
        expect(result.category).toBe(ErrorCategory.FILESYSTEM);
        expect(result.severity).toBe(ErrorSeverity.FATAL);
        expect(result.userMessage).toContain('disk space');
      });
    });

    it('should categorize config errors as CONFIGURATION', () => {
      const errors = [
        new Error('Invalid configuration'),
        new Error('config missing'),
        new Error('settings error'),
      ];

      errors.forEach((error) => {
        const result = categorizeError(error);
        expect(result.category).toBe(ErrorCategory.CONFIGURATION);
      });
    });

    it('should categorize unknown errors as UNKNOWN', () => {
      const error = new Error('Something completely unexpected happened');
      const result = categorizeError(error);
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should preserve original error', () => {
      const originalError = new Error('Test error');
      const result = categorizeError(originalError);
      expect(result.originalError).toBe(originalError);
    });
  });

  describe('formatErrorForUser', () => {
    it('should format categorized error with all details', () => {
      const error = new Error('ENOTFOUND github.com');
      const categorized = categorizeError(error);
      const formatted = formatErrorForUser(categorized);

      expect(formatted).toContain('Unable to connect');
      expect(formatted).toContain('Check your internet connection');
      expect(formatted).toContain('Try again');
    });

    it('should include suggestions in formatted output', () => {
      const error = new Error('EACCES: permission denied');
      const categorized = categorizeError(error);
      const formatted = formatErrorForUser(categorized);

      expect(formatted).toContain('Run the launcher as Administrator');
      expect(formatted).toContain('Check folder permissions');
    });

    it('should handle string errors', () => {
      const categorized = categorizeError('Simple error string');
      const formatted = formatErrorForUser(categorized);
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      const networkError = new Error('ETIMEDOUT');
      const verificationError = new Error('SHA256 mismatch');

      expect(isRetryable(networkError)).toBe(true);
      expect(isRetryable(verificationError)).toBe(true);
    });

    it('should return false for fatal errors', () => {
      const permissionError = new Error('EACCES');
      const diskError = new Error('ENOSPC');

      expect(isRetryable(permissionError)).toBe(false);
      expect(isRetryable(diskError)).toBe(false);
    });

    it('should default to false for unknown errors', () => {
      const unknownError = new Error('Unknown problem');
      expect(isRetryable(unknownError)).toBe(false);
    });
  });
});
