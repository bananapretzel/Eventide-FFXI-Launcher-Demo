export type LauncherState = 'missing' | 'outdated' | 'latest' | 'downloading' | 'updating' | 'playing' | 'error';


export interface StateContext {
  clientVersion: string | null;
  latestVersion: string;
  baseGameDownloaded: boolean;
  baseGameExtracted: boolean;
  error?: string;
}

export function getLauncherState(ctx: StateContext): LauncherState {
  if (ctx.error) return 'error';
  if (!ctx.baseGameDownloaded) return 'missing';
  if (ctx.clientVersion === ctx.latestVersion) return 'latest';
  if (ctx.baseGameExtracted && ctx.clientVersion !== ctx.latestVersion) return 'outdated';
  return 'missing';
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
