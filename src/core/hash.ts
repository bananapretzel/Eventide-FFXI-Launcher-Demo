import { createReadStream } from 'fs';
import { createHash } from 'crypto';

export async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex') === expected));
    stream.on('error', reject);
  });
}
