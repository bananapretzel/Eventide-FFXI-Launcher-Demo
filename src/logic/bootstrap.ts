import { getReleaseJson, getPatchManifest } from '../core/manifest';
import { getClientVersion } from '../core/versions';

export async function bootstrap(
  releaseUrl: string,
  installDir: string
): Promise<{
  release: Awaited<ReturnType<typeof getReleaseJson>>;
  patchManifest: Awaited<ReturnType<typeof getPatchManifest>>;
  clientVersion: string | null;
}> {
  const release = await getReleaseJson(releaseUrl);
  const patchManifest = await getPatchManifest(release.patchManifestUrl);
  const projectRoot = require('path').resolve(__dirname, '../../');
  const clientVersion = await getClientVersion(projectRoot);
  return { release, patchManifest, clientVersion };
}
