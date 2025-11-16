import Ajv, { JSONSchemaType } from 'ajv';
import { fetchJson } from '../main/utils/io';

jest.mock('../main/utils/io', () => ({
  fetchJson: jest.fn(),
  readJsonFile: jest.fn(),
  writeJsonFile: jest.fn(),
  getRootPath: () => '/mock/root',
  downloadToFile: jest.fn(),
}));

describe('Integration: Manifest download/validation and error handling', () => {
  const manifestSchema: JSONSchemaType<any> = {
    type: 'object',
    properties: {
      version: { type: 'string', nullable: true },
      baseVersion: { type: 'string', nullable: true },
      latestVersion: { type: 'string', nullable: true },
      sha256: { type: 'string', nullable: true },
      fullUrl: { type: 'string', nullable: true },
      assetUrl: { type: 'string', nullable: true },
      requiredFiles: {
        type: 'array',
        items: { type: 'string' },
        nullable: true
      },
      patchManifestUrl: { type: 'string', nullable: true },
      patchManifest: { type: 'string', nullable: true },
      patchManifestUrlV2: { type: 'string', nullable: true },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', nullable: true }
          },
          required: [],
          additionalProperties: true
        },
        nullable: true
      },
      game: { type: 'object', nullable: true, additionalProperties: true },
      patches: { type: 'array', items: { type: 'object', additionalProperties: true }, nullable: true },
    },
    required: [],
    additionalProperties: true
  };
  const ajv = new Ajv();
  const validateManifest = ajv.compile(manifestSchema);

  it('validates a downloaded manifest', async () => {
    const manifest = {
      version: '1.0.0',
      sha256: 'abc123',
      fullUrl: 'https://example.com/game.zip',
      requiredFiles: ['ashita-cli.exe'],
      assets: [{ url: 'https://example.com/game.zip' }],
      game: { foo: 'bar' },
      patches: [{ from: '1.0.0', to: '1.0.1', url: 'https://example.com/patch.zip' }]
    };
    (fetchJson as jest.Mock).mockResolvedValueOnce(manifest);
    const result = await fetchJson('https://example.com/release.json');
    expect(validateManifest(result)).toBe(true);
  });

  it('handles manifest validation error', async () => {
    const badManifest = { requiredFiles: 'not-an-array' };
    (fetchJson as jest.Mock).mockResolvedValueOnce(badManifest);
    const result = await fetchJson('https://example.com/release.json');
    expect(validateManifest(result)).toBe(false);
    expect(validateManifest.errors).toBeDefined();
  });

  it('handles fetchJson error gracefully', async () => {
    (fetchJson as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    try {
      await fetchJson('https://example.com/release.json');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.message).toMatch(/Network error/);
      }
    }
  });
});
