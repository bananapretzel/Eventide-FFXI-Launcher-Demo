import { readJson, writeJson, fileExists } from './fs';
import { join } from 'path';

const VERSION_FILE = 'game-version.json';

export async function getClientVersion(installDir: string): Promise<string | null> {
  const path = join(installDir, VERSION_FILE);
  try {
    // eslint-disable-next-line no-console
    console.log('[getClientVersion] Reading:', path);
    const data = await readJson<{ version: string }>(path);
    // eslint-disable-next-line no-console
    console.log('[getClientVersion] Parsed data:', data);
    return data?.version || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[getClientVersion] Failed to read or parse:', path, err);
    return null;
  }
}

export async function setClientVersion(installDir: string, version: string): Promise<void> {
  const path = join(installDir, VERSION_FILE);
  await writeJson(path, { version });
}

export function compareVersions(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
