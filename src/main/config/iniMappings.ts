/**
 * INI Settings Mapping Configuration
 * Maps settings.json paths to INI file sections and keys
 */

export interface IniMapping {
  section: string;
  keys: string | string[];
  transform?: (v: any) => any;
}

export const iniMappings: Record<string, IniMapping> = {
  'ffxi.mipMapping': { section: 'ffxi.registry', keys: '0000', transform: (v) => String(v) },
  'ffxi.windowWidth': { section: 'ffxi.registry', keys: '0001', transform: (v) => String(v) },
  'ffxi.windowHeight': { section: 'ffxi.registry', keys: '0002', transform: (v) => String(v) },
  'ffxi.bgWidth': { section: 'ffxi.registry', keys: '0003', transform: (v) => String(v) },
  'ffxi.bgHeight': { section: 'ffxi.registry', keys: '0004', transform: (v) => String(v) },
  'ffxi.enableSounds': { section: 'ffxi.registry', keys: '0007', transform: (v) => (v ? '1' : '0') },
  'ffxi.envAnimations': { section: 'ffxi.registry', keys: '0011', transform: (v) => String(v) },
  'ffxi.bumpMapping': { section: 'ffxi.registry', keys: '0017', transform: (v) => (v ? '1' : '0') },
  'ffxi.textureCompression': { section: 'ffxi.registry', keys: '0018', transform: (v) => String(v) },
  'ffxi.mapCompression': { section: 'ffxi.registry', keys: '0019', transform: (v) => String(v) },
  'ffxi.hardwareMouse': { section: 'ffxi.registry', keys: '0021', transform: (v) => (v ? '1' : '0') },
  'ffxi.playOpeningMovie': { section: 'ffxi.registry', keys: '0022', transform: (v) => (v ? '1' : '0') },
  'ffxi.simplifiedCCG': { section: 'ffxi.registry', keys: '0023', transform: (v) => (v ? '1' : '0') },
  'ffxi.numSounds': { section: 'ffxi.registry', keys: '0029', transform: (v) => String(v) },
  'ffxi.windowMode': { section: 'ffxi.registry', keys: '0034', transform: (v) => String(v) },
  'ffxi.bgSounds': { section: 'ffxi.registry', keys: '0035', transform: (v) => (v ? '1' : '0') },
  'ffxi.fontCompression': { section: 'ffxi.registry', keys: '0036', transform: (v) => String(v) },
  'ffxi.menuWidth': { section: 'ffxi.registry', keys: '0037', transform: (v) => String(v) },
  'ffxi.menuHeight': { section: 'ffxi.registry', keys: '0038', transform: (v) => String(v) },
  'ffxi.graphicsStabilization': { section: 'ffxi.registry', keys: '0040', transform: (v) => (v ? '1' : '0') },
  'ffxi.savePath': { section: 'ffxi.registry', keys: '0042', transform: (v) => String(v) },
  'ffxi.aspectRatio': { section: 'ffxi.registry', keys: '0044', transform: (v) => (v ? '1' : '0') },
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
