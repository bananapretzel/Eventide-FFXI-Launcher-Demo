/**
 * INI Settings Mapping Configuration
 * Maps settings.json paths to INI file sections and keys
 */

export interface IniMapping {
  section: string;
  keys: string | string[];
  transform?: (v: any) => any;
  /** Reverse transform: convert INI string value back to settings value */
  reverseTransform?: (v: string) => any;
  /** Type hint for reverse transformation */
  type?: 'number' | 'boolean' | 'string';
}

export const iniMappings: Record<string, IniMapping> = {
  'ffxi.mipMapping': { section: 'ffxi.registry', keys: '0000', transform: (v) => String(v), type: 'number' },
  'ffxi.windowWidth': { section: 'ffxi.registry', keys: '0001', transform: (v) => String(v), type: 'number' },
  'ffxi.windowHeight': { section: 'ffxi.registry', keys: '0002', transform: (v) => String(v), type: 'number' },
  'ffxi.bgWidth': { section: 'ffxi.registry', keys: '0003', transform: (v) => String(v), type: 'number' },
  'ffxi.bgHeight': { section: 'ffxi.registry', keys: '0004', transform: (v) => String(v), type: 'number' },
  'ffxi.enableSounds': { section: 'ffxi.registry', keys: '0007', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.envAnimations': { section: 'ffxi.registry', keys: '0011', transform: (v) => String(v), type: 'number' },
  'ffxi.bumpMapping': { section: 'ffxi.registry', keys: '0017', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.textureCompression': { section: 'ffxi.registry', keys: '0018', transform: (v) => String(v), type: 'number' },
  'ffxi.mapCompression': { section: 'ffxi.registry', keys: '0019', transform: (v) => String(v), type: 'number' },
  'ffxi.hardwareMouse': { section: 'ffxi.registry', keys: '0021', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.playOpeningMovie': { section: 'ffxi.registry', keys: '0022', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.simplifiedCCG': { section: 'ffxi.registry', keys: '0023', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.numSounds': { section: 'ffxi.registry', keys: '0029', transform: (v) => String(v), type: 'number' },
  'ffxi.windowMode': { section: 'ffxi.registry', keys: '0034', transform: (v) => String(v), type: 'number' },
  'ffxi.bgSounds': { section: 'ffxi.registry', keys: '0035', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.fontCompression': { section: 'ffxi.registry', keys: '0036', transform: (v) => String(v), type: 'number' },
  'ffxi.menuWidth': { section: 'ffxi.registry', keys: '0037', transform: (v) => String(v), type: 'number' },
  'ffxi.menuHeight': { section: 'ffxi.registry', keys: '0038', transform: (v) => String(v), type: 'number' },
  'ffxi.graphicsStabilization': { section: 'ffxi.registry', keys: '0040', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.screenshotPath': { section: 'ffxi.registry', keys: '0042', transform: (v) => String(v), type: 'string' },
  'ffxi.screenshotResolution': { section: 'ffxi.registry', keys: '0043', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
  'ffxi.aspectRatio': { section: 'ffxi.registry', keys: '0044', transform: (v) => (v ? '1' : '0'), type: 'boolean' },
};

export function setIniValue(config: any, sectionPath: string, key: string, value: any): void {
  const parts = sectionPath.split('.');
  let node: any = config;
  for (const p of parts) {
    if (!node[p]) node[p] = {};
    node = node[p];
  }
  node[key] = value;
}

export function applySettingsToIni(settings: Record<string, any>, config: any): void {
  for (const [settingPath, mapInfo] of Object.entries(iniMappings)) {
    const keys = settingPath.split('.');
    let value: any = settings;
    for (const k of keys) {
      if (value && Object.prototype.hasOwnProperty.call(value, k)) {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }
    if (typeof value !== 'undefined') {
      const transformed = mapInfo.transform ? mapInfo.transform(value) : value;
      if (Array.isArray(mapInfo.keys)) {
        for (const key of mapInfo.keys) {
          setIniValue(config, mapInfo.section, key, transformed);
        }
      } else {
        setIniValue(config, mapInfo.section, mapInfo.keys, transformed);
      }
    }
  }
}

/**
 * Extract settings from INI config by reversing the mappings.
 * This reads the current INI values and converts them back to the settings format.
 */
export function extractSettingsFromIni(iniConfig: any): Record<string, any> {
  const settings: Record<string, any> = {};

  for (const [settingPath, mapInfo] of Object.entries(iniMappings)) {
    // Get the INI value
    const sectionParts = mapInfo.section.split('.');
    let node: any = iniConfig;
    for (const p of sectionParts) {
      if (node && Object.prototype.hasOwnProperty.call(node, p)) {
        node = node[p];
      } else {
        node = undefined;
        break;
      }
    }

    if (node === undefined) continue;

    // Get the key value (use first key if array)
    const iniKey = Array.isArray(mapInfo.keys) ? mapInfo.keys[0] : mapInfo.keys;
    const rawValue = node[iniKey];

    if (rawValue === undefined) continue;

    // Convert the INI string value back to the appropriate type
    let convertedValue: any;
    if (mapInfo.reverseTransform) {
      convertedValue = mapInfo.reverseTransform(String(rawValue));
    } else if (mapInfo.type === 'boolean') {
      convertedValue = rawValue === '1' || rawValue === 1 || rawValue === true;
    } else if (mapInfo.type === 'number') {
      convertedValue = Number(rawValue);
      if (Number.isNaN(convertedValue)) continue; // Skip invalid numbers
    } else {
      convertedValue = String(rawValue);
    }

    // Set the value in the settings object using the path
    const pathParts = settingPath.split('.');
    let target: any = settings;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const part = pathParts[i];
      if (!target[part]) {
        target[part] = {};
      }
      target = target[part];
    }
    target[pathParts[pathParts.length - 1]] = convertedValue;
  }

  return settings;
}
