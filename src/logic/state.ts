export type LauncherState =
  | 'NOT_INSTALLED'
  | 'DOWNLOADING'
  | 'DOWNLOAD_FAILED'
  | 'DOWNLOADED'
  | 'EXTRACTING'
  | 'EXTRACT_FAILED'
  | 'READY_TO_PLAY'
  | 'CHECKING_FOR_UPDATES'
  | 'PATCHING'
  | 'PATCH_FAILED';

export interface StateContext {
  clientVersion: string | null;
  latestVersion: string;
  baseGameDownloaded: boolean;
  baseGameExtracted: boolean;
  isDownloading?: boolean;
  isExtracting?: boolean;
  isPatching?: boolean;
  error?: string;
  patchError?: string;
}

export function getLauncherState(ctx: StateContext): LauncherState {
  if (ctx.isDownloading) return 'DOWNLOADING';
  if (ctx.isExtracting) return 'EXTRACTING';
  if (ctx.isPatching) return 'PATCHING';
  if (ctx.error) return 'DOWNLOAD_FAILED';
  if (ctx.patchError) return 'PATCH_FAILED';
  if (!ctx.baseGameDownloaded) return 'NOT_INSTALLED';
  if (!ctx.baseGameExtracted) return 'DOWNLOADED';
  if (ctx.clientVersion !== ctx.latestVersion) return 'CHECKING_FOR_UPDATES';
  return 'READY_TO_PLAY';
}

export function getButtonLabel(state: LauncherState): string {
  switch (state) {
    case 'NOT_INSTALLED':
      return 'Download';
    case 'DOWNLOADING':
      return 'Downloading...';
    case 'DOWNLOAD_FAILED':
      return 'Download Failed';
    case 'DOWNLOADED':
      return 'Extract';
    case 'EXTRACTING':
      return 'Extracting...';
    case 'EXTRACT_FAILED':
      return 'Extract Failed';
    case 'READY_TO_PLAY':
      return 'Play';
    case 'CHECKING_FOR_UPDATES':
      return 'Checking for Updates...';
    case 'PATCHING':
      return 'Patching...';
    case 'PATCH_FAILED':
      return 'Patch Failed';
    default:
      return '';
  }
}
