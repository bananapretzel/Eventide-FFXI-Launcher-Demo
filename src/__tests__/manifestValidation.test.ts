import Ajv, { JSONSchemaType } from 'ajv';

// Import the manifest schema from main.ts (copy here for test isolation)
const manifestSchema: JSONSchemaType<any> = {
  type: 'object',
  properties: {
    version: { type: 'string', nullable: true },
    baseVersion: { type: 'string', nullable: true },
    sha256: { type: 'string', nullable: true },
    fullUrl: { type: 'string', nullable: true },
    assetUrl: { type: 'string', nullable: true },
    requiredFiles: {
      type: 'array',
      items: { type: 'string' },
      nullable: true
    },
    patchManifestUrl: { type: 'string', nullable: true },
    patchNotesUrl: { type: 'string', nullable: true },
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

describe('Manifest Schema Validation', () => {
  it('accepts a valid manifest', () => {
    const manifest = {
      version: '1.0.0',
      sha256: 'abc123',
      fullUrl: 'https://example.com/game.zip',
      requiredFiles: ['ashita-cli.exe'],
      assets: [{ url: 'https://example.com/game.zip' }],
      game: { foo: 'bar' },
      patches: [{ from: '1.0.0', to: '1.0.1', url: 'https://example.com/patch.zip' }]
    };
    expect(validateManifest(manifest)).toBe(true);
    expect(validateManifest.errors).toBeNull();
  });

  it('accepts a manifest with only optional fields', () => {
    const manifest = {};
    expect(validateManifest(manifest)).toBe(true);
  });

  it('rejects a manifest with wrong type for requiredFiles', () => {
    const manifest = {
      requiredFiles: 'not-an-array',
    };
    expect(validateManifest(manifest)).toBe(false);
    expect(validateManifest.errors).toBeDefined();
  });

  it('rejects a manifest with wrong type for assets', () => {
    const manifest = {
      assets: 'not-an-array',
    };
    expect(validateManifest(manifest)).toBe(false);
    expect(validateManifest.errors).toBeDefined();
  });

  it('accepts a manifest with nullable fields set to null', () => {
    const manifest = {
      version: null,
      requiredFiles: null,
      assets: null,
      game: null,
      patches: null
    };
    expect(validateManifest(manifest)).toBe(true);
  });

  it('rejects a manifest with non-object game', () => {
    const manifest = {
      game: 'not-an-object',
    };
    expect(validateManifest(manifest)).toBe(false);
    expect(validateManifest.errors).toBeDefined();
  });
});
