/**
 * Format bytes into human-readable string
 * @param n Number of bytes
 * @param precision Optional decimal places (default: auto-determine based on size)
 * @returns Formatted string like "1.5 GB" or "256 KB"
 */
export function formatBytes(n?: number, precision?: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  // If precision is specified, use it; otherwise use 2 decimals for GB+ and 1 for smaller
  const decimals = precision !== undefined ? precision : (idx >= 3 ? 2 : (val >= 10 || idx === 0 ? 0 : 1));
  return `${val.toFixed(decimals)} ${units[idx]}`;
}

/**
 * Format bytes per second into human-readable speed string
 * @param bytesPerSecond Speed in bytes per second
 * @returns Formatted string like "1.5 MB/s" or "256 KB/s"
 */
export function formatSpeed(bytesPerSecond?: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

/**
 * Format time as countdown (remaining time)
 * @param remainingSeconds Remaining time in seconds
 * @returns Formatted string like "05:23" or "1:23:45" for hours
 */
export function formatTimeRemaining(remainingSeconds: number): string {
  if (!remainingSeconds || remainingSeconds <= 0 || !isFinite(remainingSeconds)) return '--:--';

  const hours = Math.floor(remainingSeconds / 3600);
  const mins = Math.floor((remainingSeconds % 3600) / 60);
  const secs = Math.floor(remainingSeconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a percentage value
 * @param value Current value
 * @param total Total value
 * @returns Percentage string like "45%"
 */
export function formatPercent(value: number, total: number): string {
  if (!total || total <= 0) return '0%';
  const percent = Math.round((value / total) * 100);
  return `${Math.min(100, Math.max(0, percent))}%`;
}
