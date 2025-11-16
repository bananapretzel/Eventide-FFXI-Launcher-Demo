export type LauncherState = 'missing' | 'outdated' | 'latest' | 'downloading' | 'updating' | 'playing' | 'error';

export interface StateContext {
  clientVersion: string | null;
  latestVersion: string;
  error?: string;
}

export function getLauncherState(ctx: StateContext): LauncherState {
  if (ctx.error) return 'error';
  if (!ctx.clientVersion) return 'missing';
  if (ctx.clientVersion !== ctx.latestVersion) return 'outdated';
  return 'latest';
}

export function getButtonLabel(state: LauncherState): string {
  switch (state) {
    case 'missing': return 'Download';
    case 'outdated': return 'Update';
    case 'latest': return 'Play';
    case 'downloading': return 'Downloading...';
    case 'updating': return 'Updating...';
    case 'playing': return 'Launching...';
    case 'error': return 'Error';
  }
}
