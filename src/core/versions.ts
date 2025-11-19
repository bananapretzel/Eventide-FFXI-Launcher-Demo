import { readJson, writeJson, fileExists } from './fs';
import { join } from 'path';



export async function getClientVersion(installDir: string): Promise<string | null> {
  const path = join(installDir, 'storage.json');
  try {
    // eslint-disable-next-line no-console
    console.log('[getClientVersion] Reading:', path);
    const data = await readJson<any>(path);
    // eslint-disable-next-line no-console
    console.log('[getClientVersion] Parsed data:', data);
    return data?.GAME_UPDATER?.currentVersion || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[getClientVersion] Failed to read or parse:', path, err);
    return null;
  }
}


// Optionally update setClientVersion to update storage.json if needed

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
