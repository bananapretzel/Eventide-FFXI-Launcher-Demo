/**
 * Format bytes into human-readable string
 * @param n Number of bytes
 * @returns Formatted string like "1.5 GB" or "256 KB"
 */
export function formatBytes(n?: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
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
