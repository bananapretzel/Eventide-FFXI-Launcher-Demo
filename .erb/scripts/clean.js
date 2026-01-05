import { rimrafSync } from 'rimraf';
import fs from 'fs';
import webpackPaths from '../configs/webpack.paths';

const foldersToRemove = [
  webpackPaths.distPath,
  webpackPaths.buildPath,
  webpackPaths.dllPath,
];

function sleepSync(ms) {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
}

function rimrafWithRetries(folder) {
  const attempts = 10;
  for (let i = 0; i < attempts; i += 1) {
    try {
      rimrafSync(folder, { maxRetries: 25, retryDelay: 200 });
      return;
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : undefined;
      if (code === 'EBUSY' || code === 'EPERM') {
        sleepSync(250);
      } else {
        throw err;
      }
    }
  }

  // One last attempt (lets rimraf surface its best error)
  rimrafSync(folder, { maxRetries: 25, retryDelay: 200 });
}

foldersToRemove.forEach((folder) => {
  if (!fs.existsSync(folder)) return;
  try {
    rimrafWithRetries(folder);
  } catch (err) {
    // If the build output is locked (common under OneDrive/AV on Windows),
    // allow the build to continue; electron-builder may still succeed.
    if (folder === webpackPaths.buildPath) {
      // eslint-disable-next-line no-console
      console.warn(
        '[clean] Warning: failed to remove build output (locked). Continuing...',
      );
      return;
    }
    throw err;
  }
});
