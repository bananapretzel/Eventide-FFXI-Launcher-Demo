import { fetchJson } from './net';

export interface ReleaseJson {
  minimumLauncherVersion: string;
  game: {
    baseVersion: string;
    fullUrl: string;
    sha256: string;
    sizeBytes: number;
  };
  patchManifestUrl: string;
  patchNotesUrl: string;
}

export interface PatchManifest {
  latestVersion: string;
  patches: Array<{
    from: string;
    to: string;
    fullUrl: string;
    sha256: string;
    sizeBytes?: number;
  }>;
}

export interface PatchNote {
  name: string;
  timestamp: string;
  message: string;
}

export async function getReleaseJson(url: string): Promise<ReleaseJson> {
  const data = await fetchJson<ReleaseJson>(url);
  // Validate structure here if needed
  return data;
}

export async function getPatchManifest(url: string): Promise<PatchManifest> {
  return fetchJson<PatchManifest>(url);
}

export async function getPatchNotes(url: string): Promise<PatchNote[]> {
  return fetchJson<PatchNote[]>(url);
}
