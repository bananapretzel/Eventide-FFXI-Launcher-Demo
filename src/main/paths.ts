import { app } from "electron";
import path from "path";
import fs from "fs";

/**
 * Returns all important Eventide launcher paths centralized under userData/Eventide.
 *
 * Layout:
 *   <userData>/Eventide/
 *     Downloads/   -> where we store downloaded zip archives (base client + patches)
 *     Game/        -> where the unpacked FFXI client lives
 *     logs/        -> launcher logs
 *     config.json  -> launcher config
 *     storage.json -> generic persistent state
 */
export function getEventidePaths() {
  const root = app.getPath("userData");
  // Game client should be stored in %APPDATA%/Eventide Launcherv2/Game
  const gameRoot = path.join(root, "Eventide", "Game");
  // Patch and base game zip files should be stored in %APPDATA%/Eventide Launcherv2/Eventide/Downloads
  const dlRoot   = path.join(root, "Eventide", "Downloads");
  const logsRoot = path.join(root, "logs");
  const config   = path.join(root, "config.json");
  const storage  = path.join(root, "storage.json");
  return { userData: root, root, gameRoot, dlRoot, logsRoot, config, storage };
}

/**
 * Ensures all required Eventide directories exist.
 * Creates: root, Game, Downloads, logs
 */
export function ensureDirs() {
  const paths = getEventidePaths();
  [paths.root, paths.gameRoot, paths.dlRoot, paths.logsRoot].forEach((dir) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Failed to create directory: ${dir}`, e);
    }
  });
}

