import { promises as fs } from 'fs';
import { getEventidePaths } from '../main/paths';

export interface GameUpdaterState {
  currentVersion: string;
  latestVersion: string;
  baseGame: {
    downloaded: boolean;
    extracted: boolean;
  };
  updater: {
    downloaded: string;
    extracted: string;
  };
}

export interface StorageJson {
  paths: {
    installPath: string;
    downloadPath: string;
  };
  GAME_UPDATER: GameUpdaterState;
}

const getStoragePath = () => getEventidePaths().storage;

export async function readStorage(): Promise<StorageJson | null> {
  const storagePath = getStoragePath();
  try {
    const data = await fs.readFile(storagePath, 'utf-8');
    return JSON.parse(data) as StorageJson;
  } catch {
    return null;
  }
}

export async function writeStorage(data: StorageJson): Promise<void> {
  const storagePath = getStoragePath();
  await fs.writeFile(storagePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function updateStorage(updater: (data: StorageJson) => void): Promise<void> {
  const data = (await readStorage()) || {
    paths: { installPath: '', downloadPath: '' },
    GAME_UPDATER: {
      currentVersion: "0.0.0",
      latestVersion: "0.0.0",
      baseGame: { downloaded: false, extracted: false },
      updater: { downloaded: "", extracted: "" },
    },
  };
  updater(data);
  await writeStorage(data);
}
