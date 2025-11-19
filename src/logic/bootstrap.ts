import { getReleaseJson, getPatchManifest } from '../core/manifest';
import { getClientVersion } from '../core/versions';
import log from 'electron-log';
import chalk from 'chalk';

export async function bootstrap(
  releaseUrl: string,
  installDir: string
): Promise<{
  release: Awaited<ReturnType<typeof getReleaseJson>>;
  patchManifest: Awaited<ReturnType<typeof getPatchManifest>>;
  clientVersion: string | null;
}> {
  log.info(chalk.cyan('[bootstrap] Starting launcher bootstrap...'));
  log.info(chalk.cyan(`[bootstrap] Release URL: ${releaseUrl}`));

  const release = await getReleaseJson(releaseUrl);
  log.info(chalk.green(`[bootstrap] Fetched release info: latest=${release.latestVersion}`));

  const patchManifest = await getPatchManifest(release.patchManifestUrl);
  log.info(chalk.green(`[bootstrap] Fetched patch manifest: ${patchManifest.patches?.length || 0} patches available`));

  // Get version from AppData storage.json (installDir is ignored by getClientVersion)
  const clientVersion = await getClientVersion(installDir);
  log.info(chalk.cyan(`[bootstrap] Current client version: ${clientVersion || 'not installed'}`));

  return { release, patchManifest, clientVersion };
}
