import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import log from 'electron-log';
import chalk from 'chalk';

export async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  log.info(chalk.cyan(`[verifySha256] Verifying file: ${filePath}`));
  log.info(chalk.cyan(`[verifySha256] Expected hash: ${expected}`));

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => {
      const actual = hash.digest('hex');
      const match = actual === expected;
      if (match) {
        log.info(chalk.green(`[verifySha256] ✓ Checksum verified`));
      } else {
        log.error(chalk.red(`[verifySha256] ✗ Checksum mismatch!`));
        log.error(chalk.red(`[verifySha256] Expected: ${expected}`));
        log.error(chalk.red(`[verifySha256] Actual:   ${actual}`));
      }
      resolve(match);
    });
    stream.on('error', (err) => {
      log.error(chalk.red('[verifySha256] Error reading file:'), err);
      reject(err);
    });
  });
}
