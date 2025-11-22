import React, { useState, useEffect } from 'react';

interface Settings {
  ffxi?: {
    windowMode?: number;
    windowWidth?: number;
    windowHeight?: number;
    menuWidth?: number;
    menuHeight?: number;
    brightness?: number;
    playOpeningMovie?: boolean;
    bgWidth?: number;
    bgHeight?: number;
    maintainAspectRatio?: boolean;
    textureCompression?: number;
    mapCompression?: number;
    fontCompression?: number;
    envAnimations?: number;
    mipMapping?: number;
    bumpMapping?: boolean;
    aspectRatio?: boolean;
    savePath?: string;
    enableSounds?: boolean;
    bgSounds?: boolean;
    numSounds?: number;
    simplifiedCCG?: boolean;
    hardwareMouse?: boolean;
    graphicsStabilization?: boolean;
  };
  ashita?: {
    fps?: string;
    bootFile?: string;
    gameModule?: string;
    script?: string;
    args?: string;
    langPlayOnline?: string;
    langAshita?: string;
    logLevel?: string;
    crashDumps?: boolean;
    threadCount?: number;
    resOffsets?: boolean;
    resPointers?: boolean;
    resResources?: boolean;
    startX?: number;
    startY?: number;
    gamepadAllowBg?: boolean;
    gamepadDisableEnum?: boolean;
    kbBlockInput?: boolean;
    kbBlockBinds?: boolean;
    kbSilentBinds?: boolean;
    kbWinKey?: boolean;
    mouseBlockInput?: boolean;
    mouseUnhook?: boolean;
    addonsSilent?: boolean;
    aliasesSilent?: boolean;
    pluginsSilent?: boolean;
    d3dBBFormat?: number;
    d3dBBCount?: number;
    d3dMultiSample?: number;
    d3dSwapEffect?: number;
    d3dAutoDepth?: number;
    d3dDepthFormat?: number;
    d3dFlags?: number;
    d3dRefresh?: number;
    d3dPresentInterval?: number;
    d3dFPUPreserve?: number;
    additionalSettings?: string;
  };
  pivot?: {
    overlayEnabled?: boolean;
  };
  launcher?: {
    closeOnRun?: boolean;
  };
}

type CategoryId = 'ffxi' | 'ashita' | 'pivot' | 'launcher';
type SubTabId =
  | 'general'
  | 'graphics'
  | 'features'
  | 'other'
  | 'script'
  | 'initialization'
  | 'overlays'
  | 'paths'
  | 'logs';

const CATEGORY_DEFS: Record<
  CategoryId,
  { label: string; subTabs: { id: SubTabId; label: string }[] }
> = {
  ffxi: {
    label: 'FINAL FANTASY XI',
    subTabs: [
      { id: 'general', label: 'GENERAL' },
      { id: 'graphics', label: 'GRAPHICS' },
      { id: 'features', label: 'FEATURES' },
      { id: 'other', label: 'OTHER' },
    ],
  },
  ashita: {
    label: 'ASHITA',
    subTabs: [{ id: 'script', label: 'SCRIPT' }],
  },
  pivot: {
    label: 'PIVOT',
    subTabs: [],
  },
  launcher: {
    label: 'LAUNCHER',
    subTabs: [],
  },
};

// component functions and helpers are defined above to satisfy lint rules.

/* UI panels (static placeholders; real hooks/file I/O can be wired later) */

function Card({
  title,
  children,
}: {
  // eslint-disable-next-line react/require-default-props
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-card">
      {title && title.trim().length > 0 ? (
        <h3 className="settings-card-title">{title}</h3>
      ) : null}
      <div className="settings-card-body">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="settings-row">{children}</div>;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="settings-field" htmlFor={htmlFor}>
      <span className="settings-field-label">{label}</span>
      {children}
    </label>
  );
}

const MIN_BRIGHTNESS_RANGE = -1;
const MAX_BRIGHTNESS_RANGE = 1;
const BRIGHTNESS_CENTER = 50;
const BRIGHTNESS_SCALE = 50;
const TOOLTIP_PRECISION = 10;

function brightnessToRange(brightness: number): number {
  return Math.max(
    MIN_BRIGHTNESS_RANGE,
    Math.min(
      MAX_BRIGHTNESS_RANGE,
      (brightness - BRIGHTNESS_CENTER) / BRIGHTNESS_SCALE,
    ),
  );
}

function FFXIGeneralPanel({
  settings,
  updateSetting,
}: {
  settings: Settings;
  updateSetting: (path: string, value: any) => void;
}) {
  const [brightness, setBrightness] = useState(settings.ffxi?.brightness ?? 50);
  const [isDragging, setIsDragging] = useState(false);

  // Show tooltip only while dragging; ensure we stop on mouseup/touchend anywhere
  React.useEffect(() => {
    const stopDrag = () => setIsDragging(false);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
    };
  }, []);

  return (
    <>
      <Card title="Screen Settings">
        <Row>
          <Field label="Window Mode" htmlFor="window-mode">
            <select
              id="window-mode"
              value={settings.ffxi?.windowMode ?? 1}
              onChange={(e) =>
                updateSetting('ffxi.windowMode', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Fullscreen</option>
              <option value={1}>Windowed</option>
              <option value={2}>Windowed (Borderless)</option>
              <option value={3}>Fullscreen (Windowed)</option>
            </select>
          </Field>
        </Row>

        <Row>
          <Field label="Window Resolution" htmlFor="win-width">
            <div className="res-grid">
              <input
                id="win-width"
                type="number"
                className="input"
                placeholder="Width"
                value={settings.ffxi?.windowWidth ?? 1920}
                onChange={(e) =>
                  updateSetting('ffxi.windowWidth', Number(e.target.value))
                }
              />
              <input
                id="win-height"
                type="number"
                className="input"
                placeholder="Height"
                value={settings.ffxi?.windowHeight ?? 1080}
                onChange={(e) =>
                  updateSetting('ffxi.windowHeight', Number(e.target.value))
                }
              />
            </div>
          </Field>
        </Row>

        <Row>
          <Field label="Menu Resolution" htmlFor="menu-width">
            <div className="res-grid">
              <input
                id="menu-width"
                type="number"
                className="input"
                placeholder="Width"
                value={settings.ffxi?.menuWidth ?? 1366}
                onChange={(e) =>
                  updateSetting('ffxi.menuWidth', Number(e.target.value))
                }
              />
              <input
                id="menu-height"
                type="number"
                className="input"
                placeholder="Height"
                value={settings.ffxi?.menuHeight ?? 768}
                onChange={(e) =>
                  updateSetting('ffxi.menuHeight', Number(e.target.value))
                }
              />
            </div>
          </Field>
        </Row>
      </Card>

      <Card title="Brightness">
        <Row>
          <div className="slider-wrap">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={brightness}
              onChange={(e) => {
                const val = Number(e.target.value);
                setBrightness(val);
                // Convert slider value (0-100) to -1 to 1 in 0.1 increments
                const normalized = Math.round(((val - 50) / 50) * 10) / 10;
                updateSetting('ffxi.brightness', normalized);
              }}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              className="slider"
              aria-label="Brightness"
            />
            {isDragging && (
              <span
                className="slider-tooltip"
                style={{ left: `${brightness}%` }}
                aria-hidden="true"
              >
                {(
                  Math.round(
                    brightnessToRange(brightness) * TOOLTIP_PRECISION,
                  ) / TOOLTIP_PRECISION
                ).toFixed(1)}
              </span>
            )}
          </div>
        </Row>
        <Row>
          <div className="slider-labels" aria-hidden="true">
            <span>Dark</span>
            <span>Default</span>
            <span>Bright</span>
          </div>
        </Row>
      </Card>

      <Card title={undefined}>
        <div className="settings-row centered">
          <label className="switch-label" htmlFor="play-opening">
            Play opening movie on startup
            <div className="toggle" aria-label="Play opening movie on startup">
              <input
                id="play-opening"
                type="checkbox"
                checked={settings.ffxi?.playOpeningMovie ?? false}
                onChange={(e) =>
                  updateSetting('ffxi.playOpeningMovie', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </label>
        </div>
      </Card>
    </>
  );
}

function FFXIGraphicsPanel({
  settings,
  updateSetting,
}: {
  settings: Settings;
  updateSetting: (path: string, value: any) => void;
}) {
  return (
    <>
      <Card title="Screen Settings">
        <Row>
          <Field label="Background Resolution" htmlFor="bg-width">
            <div className="res-grid">
              <input
                id="bg-width"
                type="number"
                className="input"
                placeholder="Width"
                value={settings.ffxi?.bgWidth ?? 2880}
                onChange={(e) =>
                  updateSetting('ffxi.bgWidth', Number(e.target.value))
                }
              />
              <input
                id="bg-height"
                type="number"
                className="input"
                placeholder="Height"
                value={settings.ffxi?.bgHeight ?? 1620}
                onChange={(e) =>
                  updateSetting('ffxi.bgHeight', Number(e.target.value))
                }
              />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Maintain Aspect Ratio" htmlFor="maintain-ar">
            <div className="toggle" aria-label="Maintain Aspect Ratio">
              <input
                id="maintain-ar"
                type="checkbox"
                checked={settings.ffxi?.aspectRatio ?? true}
                onChange={(e) =>
                  updateSetting('ffxi.aspectRatio', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
      </Card>

      <Card title="Quality">
        <Row>
          <Field label="Texture Compression" htmlFor="tex-comp">
            <select
              id="tex-comp"
              value={settings.ffxi?.textureCompression ?? 2}
              onChange={(e) =>
                updateSetting('ffxi.textureCompression', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>High</option>
              <option value={1}>Low</option>
              <option value={2}>Uncompressed</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Map Compression" htmlFor="map-comp">
            <select
              id="map-comp"
              value={settings.ffxi?.mapCompression ?? 1}
              onChange={(e) =>
                updateSetting('ffxi.mapCompression', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Compressed</option>
              <option value={1}>Uncompressed</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Font Compression" htmlFor="font-comp">
            <select
              id="font-comp"
              value={settings.ffxi?.fontCompression ?? 2}
              onChange={(e) =>
                updateSetting('ffxi.fontCompression', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Compressed</option>
              <option value={1}>Uncompressed</option>
              <option value={2}>High Quality</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Environment Animations" htmlFor="env-animations">
            <select
              id="env-animations"
              value={settings.ffxi?.envAnimations ?? 2}
              onChange={(e) =>
                updateSetting('ffxi.envAnimations', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Off</option>
              <option value={1}>Normal</option>
              <option value={2}>Smooth</option>
            </select>
          </Field>
        </Row>
      </Card>

      <Card title="Mapping and Effects">
        <Row>
          <Field label="Mip Mapping" htmlFor="mip-mapping">
            <select
              id="mip-mapping"
              value={settings.ffxi?.mipMapping ?? 6}
              onChange={(e) =>
                updateSetting('ffxi.mipMapping', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Off</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Bump Mapping" htmlFor="bump-mapping">
            <div className="toggle" aria-label="Bump Mapping">
              <input
                id="bump-mapping"
                type="checkbox"
                checked={settings.ffxi?.bumpMapping ?? true}
                onChange={(e) =>
                  updateSetting('ffxi.bumpMapping', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
      </Card>
    </>
  );
}

function getDefaultFFXISavePath(platform: string) {
  if (platform === 'win32') {
    return 'C:\\Program Files (x86)\\Square Enix\\FINAL FANTASY XI';
  }
  if (platform === 'linux') {
    // Example Linux default, adjust as needed
    return '~/PlayOnLinux/FINAL FANTASY XI';
  }
  if (platform === 'darwin') {
    return '/Applications/FINAL FANTASY XI';
  }
  return '';
}

function FFXIFeaturesPanel({
  settings,
  updateSetting,
  platform,
}: {
  settings: Settings;
  updateSetting: (path: string, value: any) => void;
  platform: string;
}) {
  return (
    <Card title="Location to store settings and screenshots">
      <Row>
        <input
          id="ffxi-save-path"
          type="text"
          className="input ffxi-save-path"
          value={settings.ffxi?.savePath ?? getDefaultFFXISavePath(platform)}
          onChange={(e) => updateSetting('ffxi.savePath', e.target.value)}
          aria-label="Location to store settings and screenshots"
        />
      </Row>
    </Card>
  );
}

function FFXIOtherPanel({
  settings,
  updateSetting,
}: {
  settings: Settings;
  updateSetting: (path: string, value: any) => void;
}) {
  const [numSounds, setNumSounds] = useState(settings.ffxi?.numSounds ?? 20);
  const openGamepad = async () => {
    try {
      const result = await window.electron.invoke('open-gamepad-config');
      if (!result.success) {
        // eslint-disable-next-line no-alert
        alert(result.error || 'Failed to open gamepad config');
      }
    } catch {
      // eslint-disable-next-line no-alert
      alert('Failed to open gamepad config');
    }
  };
  return (
    <>
      <Card title="Gamepad">
        <div className="settings-row centered">
          <button type="button" className="btn" onClick={openGamepad}>
            OPEN GAMEPAD CONFIG
          </button>
        </div>
      </Card>

      <Card title="Sounds">
        <Row>
          <Field label="Enable Sounds" htmlFor="enable-sounds">
            <div className="toggle" aria-label="Enable Sounds">
              <input
                id="enable-sounds"
                type="checkbox"
                checked={settings.ffxi?.enableSounds ?? true}
                onChange={(e) =>
                  updateSetting('ffxi.enableSounds', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Play Sounds in Background" htmlFor="bg-sounds">
            <div className="toggle" aria-label="Play Sounds in Background">
              <input
                id="bg-sounds"
                type="checkbox"
                checked={settings.ffxi?.bgSounds ?? true}
                onChange={(e) =>
                  updateSetting('ffxi.bgSounds', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Number Simultaneous Sounds" htmlFor="num-sounds">
            <div style={{ width: '100%' }}>
              <input
                id="num-sounds"
                type="range"
                min={12}
                max={20}
                step={1}
                value={numSounds}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setNumSounds(val);
                  updateSetting('ffxi.numSounds', val);
                }}
                className="slider"
                aria-label="Number of simultaneous sounds"
                aria-valuenow={numSounds}
                aria-valuemin={12}
                aria-valuemax={20}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--ink-soft)',
                }}
                aria-hidden="true"
              >
                <span>12</span>
                <span>20</span>
              </div>
            </div>
          </Field>
        </Row>
      </Card>

      <Card title="Legacy Settings">
        <Row>
          <Field
            label="Simplified Character Creation Graphics"
            htmlFor="simplified-ccg"
          >
            <div
              className="toggle"
              aria-label="Simplified Character Creation Graphics"
            >
              <input
                id="simplified-ccg"
                type="checkbox"
                checked={settings.ffxi?.simplifiedCCG ?? false}
                onChange={(e) =>
                  updateSetting('ffxi.simplifiedCCG', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Hardware Mouse" htmlFor="hardware-mouse">
            <div className="toggle" aria-label="Hardware Mouse">
              <input
                id="hardware-mouse"
                type="checkbox"
                checked={settings.ffxi?.hardwareMouse ?? true}
                onChange={(e) =>
                  updateSetting('ffxi.hardwareMouse', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Graphics Stabilization" htmlFor="graphics-stab">
            <div className="toggle" aria-label="Graphics Stabilization">
              <input
                id="graphics-stab"
                type="checkbox"
                checked={settings.ffxi?.graphicsStabilization ?? false}
                onChange={(e) =>
                  updateSetting('ffxi.graphicsStabilization', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
      </Card>
    </>
  );
}

function AshitaScriptPanel({
  settings,
  updateSetting,
}: {
  settings: Settings;
  updateSetting: (path: string, value: any) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [additionalSettings, setAdditionalSettings] = useState(
    settings.ashita?.additionalSettings ?? '',
  );

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleCloseDialog();
    }
  };

  const handleSave = () => {
    updateSetting('ashita.additionalSettings', additionalSettings);
    setIsDialogOpen(false);
  };

  return (
    <>
      <Card title="Commands">
        <Row>
          <Field label="FPS" htmlFor="ashita-fps">
            <select
              id="ashita-fps"
              value={settings.ashita?.fps ?? '30'}
              onChange={(e) => updateSetting('ashita.fps', e.target.value)}
              className="select"
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="uncapped">Uncapped (not recommended)</option>
            </select>
          </Field>
        </Row>
        <Row>
          <span className="hint">Manually Edit Script</span>
          <button
            type="button"
            id="edit-script-btn"
            className="btn btn-icon"
            aria-label="Edit script"
            onClick={handleOpenDialog}
          >
            ✏️
          </button>
        </Row>
      </Card>

      {isDialogOpen && (
        <div
          className="modal-overlay"
          onClick={handleOverlayClick}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCloseDialog();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
        >
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">
                Edit Additional Settings
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={handleCloseDialog}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <label htmlFor="additional-settings" className="modal-label">
                Additional Script Commands:
                <textarea
                  id="additional-settings"
                  className="modal-textarea"
                  rows={10}
                  value={additionalSettings}
                  onChange={(e) => setAdditionalSettings(e.target.value)}
                  placeholder="Enter additional Ashita script commands here..."
                />
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const [category, setCategory] = useState<CategoryId>('ffxi');
  const [subTab, setSubTab] = useState<SubTabId>('general');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('win32');
  const [installDir, setInstallDir] = useState<string>('');
  // Get platform and installDir on mount
  useEffect(() => {
    async function fetchPlatformAndPaths() {
      if (window.electron?.getPlatform) {
        const result = await window.electron.getPlatform();
        if (typeof result === 'string') {
          setPlatform(result);
        } else if (result && typeof result.platform === 'string') {
          setPlatform(result.platform);
        }
      }
      // Get installDir from IPC
      if (window.electron?.invoke) {
        try {
          const res = await window.electron.invoke('eventide:get-paths');
          if (res && res.success && res.data && res.data.gameRoot) {
            setInstallDir(res.data.gameRoot);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error fetching paths:', err);
        }
      }
    }
    fetchPlatformAndPaths();
  }, []);

  const handleShowToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (!window.electron?.readSettings) {
          setError('Electron preload API not available.');
          return;
        }
        const result = await window.electron.readSettings();
        if (result.success && result.data) {
          // Ensure bgWidth and bgHeight always have defaults
          const loaded = { ...result.data };
          loaded.ffxi = loaded.ffxi || {};
          if (typeof loaded.ffxi.bgWidth === 'undefined')
            loaded.ffxi.bgWidth = 3840;
          if (typeof loaded.ffxi.bgHeight === 'undefined')
            loaded.ffxi.bgHeight = 2160;
          setSettings(loaded);
        }
      } catch {
        handleShowToast('Error loading settings');
      }
    };
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save settings to file, ensuring password is never compounded
  const saveSettings = async (newSettings: Settings) => {
    try {
      // Deep clone to avoid mutating state
      const safeSettings: Settings = JSON.parse(JSON.stringify(newSettings));

      // Always remove password field before saving to disk
      if (safeSettings && typeof safeSettings === 'object') {
        if ('password' in safeSettings) {
          delete (safeSettings as any).password;
        }
        if (
          safeSettings.ffxi &&
          typeof safeSettings.ffxi === 'object' &&
          'password' in safeSettings.ffxi
        ) {
          delete (safeSettings.ffxi as any).password;
        }
      }

      // Safe check: try to serialize settings before writing
      let json: string;
      try {
        json = JSON.stringify(safeSettings);
      } catch {
        handleShowToast('Settings not serializable!');
        return;
      }
      if (json.length > 1000000) {
        // 1MB limit for sanity
        handleShowToast('Settings too large!');
        return;
      }
      // Optionally, show a toast or log to a UI element if needed
      if (!window.electron?.writeSettings) {
        setError('Electron preload API not available.');
        return;
      }
      const result = await window.electron.writeSettings(safeSettings);
      if (result.success) {
        setSettings(safeSettings);
        handleShowToast('Settings saved');
      } else {
        handleShowToast('Error saving settings');
      }
    } catch {
      handleShowToast('Error saving settings');
    }
  };

  // Update a specific setting
  const updateSetting = (path: string, value: any) => {
    const newSettings = { ...settings };
    const keys = path.split('.');
    let current: any = newSettings;

    for (let i = 0; i < keys.length - 1; i += 1) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    saveSettings(newSettings);
  };

  // Keep subTab valid when category changes
  React.useEffect(() => {
    const subs = CATEGORY_DEFS[category]?.subTabs || [];
    if (subs.length > 0) {
      setSubTab(subs[0].id);
    }
  }, [category]);

  // Render error if present (after all hooks)
  if (error) {
    return (
      <div className="settings-error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* Top category tabs */}
      <nav className="settings-tabs" aria-label="Settings categories">
        {(Object.keys(CATEGORY_DEFS || {}) as CategoryId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`settings-tab ${category === id ? 'is-active' : ''}`}
            onClick={() => setCategory(id)}
          >
            {CATEGORY_DEFS[id].label}
          </button>
        ))}
      </nav>

      {/* Sub-tabs for the selected category (if any) */}
      {CATEGORY_DEFS[category]?.subTabs?.length > 0 && (
        <div
          className="settings-subtabs"
          role="tablist"
          aria-label="Subcategories"
        >
          {(CATEGORY_DEFS[category]?.subTabs || []).map((st) => (
            <button
              key={st.id}
              type="button"
              className={`subtab ${subTab === st.id ? 'is-active' : ''}`}
              onClick={() => setSubTab(st.id)}
              role="tab"
              aria-selected={subTab === st.id}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}

      {/* Panel content */}
      <section className="settings-panel" aria-live="polite">
        {category === 'ffxi' && subTab === 'general' && (
          <FFXIGeneralPanel settings={settings} updateSetting={updateSetting} />
        )}
        {category === 'ffxi' && subTab === 'graphics' && (
          <FFXIGraphicsPanel
            settings={settings}
            updateSetting={updateSetting}
          />
        )}
        {category === 'ffxi' && subTab === 'features' && (
          <FFXIFeaturesPanel
            settings={settings}
            updateSetting={updateSetting}
            platform={platform}
          />
        )}
        {category === 'ffxi' && subTab === 'other' && (
          <FFXIOtherPanel settings={settings} updateSetting={updateSetting} />
        )}

        {category === 'ashita' && subTab === 'script' && (
          <AshitaScriptPanel
            settings={settings}
            updateSetting={updateSetting}
          />
        )}

        {/* Ashita initialization section removed */}
        {false && category === 'ashita' && (
          <>
            <Card title="Boot">
              <Row>
                <Field label="File" htmlFor="boot-file">
                  <input
                    id="boot-file"
                    type="text"
                    className="input"
                    defaultValue={(() => {
                      if (platform === 'win32') {
                        return '.\\bootloader\\xiloader.exe';
                      }
                      if (platform === 'linux') {
                        return './bootloader/xiloader';
                      }
                      if (platform === 'darwin') {
                        return './bootloader/xiloader';
                      }
                      return '';
                    })()}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Game Module" htmlFor="game-module">
                  <input
                    id="game-module"
                    type="text"
                    className="input"
                    defaultValue={(() => {
                      if (platform === 'win32') return 'ffximain.dll';
                      if (platform === 'linux') return 'ffximain.so';
                      if (platform === 'darwin') return 'ffximain.dylib';
                      return '';
                    })()}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Script" htmlFor="boot-script">
                  <input
                    id="boot-script"
                    type="text"
                    className="input"
                    defaultValue="default.txt"
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Args" htmlFor="boot-args">
                  <input
                    id="boot-args"
                    type="text"
                    className="input"
                    defaultValue=""
                  />
                </Field>
              </Row>
            </Card>

            <Card title="Language">
              <Row>
                <Field label="PlayOnline" htmlFor="lang-playonline">
                  <select
                    id="lang-playonline"
                    defaultValue="English"
                    className="select"
                  >
                    <option value="English">English</option>
                    <option value="Japanese">Japanese</option>
                  </select>
                </Field>
              </Row>
              <Row>
                <Field label="Ashita" htmlFor="lang-ashita">
                  <select
                    id="lang-ashita"
                    defaultValue="English"
                    className="select"
                  >
                    <option value="English">English</option>
                    <option value="Japanese">Japanese</option>
                  </select>
                </Field>
              </Row>
            </Card>

            <Card title="Logging">
              <Row>
                <Field label="Level" htmlFor="log-level">
                  <select
                    id="log-level"
                    defaultValue="Debug"
                    className="select"
                  >
                    <option value="Debug">Debug</option>
                    <option value="Info">Info</option>
                    <option value="Warn">Warn</option>
                    <option value="Error">Error</option>
                    <option value="Critical">Critical</option>
                  </select>
                </Field>
              </Row>
              <Row>
                <Field label="Crash Dumps" htmlFor="crash-dumps">
                  <div className="toggle" aria-label="Crash Dumps">
                    <input id="crash-dumps" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
            </Card>

            <Card title="Task Pool">
              <Row>
                <Field label="Thread Count" htmlFor="thread-count">
                  <input
                    id="thread-count"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
            </Card>

            <Card title="Resources - Use Overrides">
              <Row>
                <Field label="Offsets" htmlFor="res-offsets">
                  <div className="toggle" aria-label="Offsets">
                    <input id="res-offsets" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Pointers" htmlFor="res-pointers">
                  <div className="toggle" aria-label="Pointers">
                    <input id="res-pointers" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Resources" htmlFor="res-resources">
                  <div className="toggle" aria-label="Resources">
                    <input id="res-resources" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
            </Card>

            <Card title="Start Position">
              <Row>
                <Field label="X" htmlFor="start-x">
                  <input
                    id="start-x"
                    type="number"
                    className="input"
                    defaultValue={0}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Y" htmlFor="start-y">
                  <input
                    id="start-y"
                    type="number"
                    className="input"
                    defaultValue={0}
                  />
                </Field>
              </Row>
            </Card>

            <Card title="Input">
              <Row>
                <Field
                  label="Gamepad Allow Background"
                  htmlFor="gamepad-allow-bg"
                >
                  <div className="toggle" aria-label="Gamepad Allow Background">
                    <input id="gamepad-allow-bg" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field
                  label="Gamepad Disable Enumeration"
                  htmlFor="gamepad-disable-enum"
                >
                  <div
                    className="toggle"
                    aria-label="Gamepad Disable Enumeration"
                  >
                    <input id="gamepad-disable-enum" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Keyboard Block Input" htmlFor="kb-block-input">
                  <div className="toggle" aria-label="Keyboard Block Input">
                    <input id="kb-block-input" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field
                  label="Keyboard Block Binds During Input"
                  htmlFor="kb-block-binds"
                >
                  <div
                    className="toggle"
                    aria-label="Keyboard Block Binds During Input"
                  >
                    <input id="kb-block-binds" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Keyboard Silent Binds" htmlFor="kb-silent-binds">
                  <div className="toggle" aria-label="Keyboard Silent Binds">
                    <input id="kb-silent-binds" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field
                  label="Keyboard Windows Key Enabled"
                  htmlFor="kb-win-key"
                >
                  <div
                    className="toggle"
                    aria-label="Keyboard Windows Key Enabled"
                  >
                    <input id="kb-win-key" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Mouse Block Input" htmlFor="mouse-block-input">
                  <div className="toggle" aria-label="Mouse Block Input">
                    <input id="mouse-block-input" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Mouse Unhook" htmlFor="mouse-unhook">
                  <div className="toggle" aria-label="Mouse Unhook">
                    <input id="mouse-unhook" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
            </Card>

            <Card title="Miscellaneous">
              <Row>
                <Field label="Addons Silent" htmlFor="addons-silent">
                  <div className="toggle" aria-label="Addons Silent">
                    <input id="addons-silent" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Aliases Silent" htmlFor="aliases-silent">
                  <div className="toggle" aria-label="Aliases Silent">
                    <input id="aliases-silent" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
              <Row>
                <Field label="Plugins Silent" htmlFor="plugins-silent">
                  <div className="toggle" aria-label="Plugins Silent">
                    <input id="plugins-silent" type="checkbox" />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
            </Card>

            <Card title="FFXI Direct3d8 - Present Params">
              <Row>
                <Field label="Back Buffer Format" htmlFor="d3d-bb-format">
                  <input
                    id="d3d-bb-format"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Back Buffer Count" htmlFor="d3d-bb-count">
                  <input
                    id="d3d-bb-count"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Multi Sample Type" htmlFor="d3d-multi-sample">
                  <input
                    id="d3d-multi-sample"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Swap Effect" htmlFor="d3d-swap-effect">
                  <input
                    id="d3d-swap-effect"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  label="Enable Auto Depth Stencil"
                  htmlFor="d3d-auto-depth"
                >
                  <input
                    id="d3d-auto-depth"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  label="Auto Depth Stencil Format"
                  htmlFor="d3d-depth-format"
                >
                  <input
                    id="d3d-depth-format"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Flags" htmlFor="d3d-flags">
                  <input
                    id="d3d-flags"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  label="Fullscreen Refresh Rate (Hz)"
                  htmlFor="d3d-refresh"
                >
                  <input
                    id="d3d-refresh"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  label="Fullscreen Presentation Interval"
                  htmlFor="d3d-present-interval"
                >
                  <input
                    id="d3d-present-interval"
                    type="number"
                    className="input"
                    defaultValue={-1}
                  />
                </Field>
              </Row>
              <Row>
                <Field
                  label="Behavior Flags FPU Preserve"
                  htmlFor="d3d-fpu-preserve"
                >
                  <input
                    id="d3d-fpu-preserve"
                    type="number"
                    className="input"
                    defaultValue={0}
                  />
                </Field>
              </Row>
            </Card>
          </>
        )}

        {category === 'pivot' && (
          <Card title="Overlays">
            <Row>
              <Field label="Eventide" htmlFor="pivot-overlay">
                <div className="toggle" aria-label="Eventide overlay">
                  <input id="pivot-overlay" type="checkbox" defaultChecked />
                  <span aria-hidden />
                </div>
              </Field>
            </Row>
          </Card>
        )}

        {category === 'launcher' && (
          <div className="launcher-settings-grid">
            <div className="launcher-left">
              <Card title="General">
                <Row>
                  <Field
                    label="Close Launcher on Game Run"
                    htmlFor="close-on-run"
                  >
                    <div
                      className="toggle"
                      aria-label="Close Launcher on Game Run"
                    >
                      <input
                        id="close-on-run"
                        type="checkbox"
                        checked={settings.launcher?.closeOnRun ?? false}
                        onChange={(e) =>
                          updateSetting('launcher.closeOnRun', e.target.checked)
                        }
                      />
                      <span aria-hidden />
                    </div>
                  </Field>
                </Row>
              </Card>
              <Card title="Paths and Logs">
                <div
                  className="settings-row"
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        const result =
                          await window.electron.invoke('open-config-folder');
                        if (!result.success) {
                          handleShowToast('Failed to open folder');
                        }
                      } catch {
                        handleShowToast('Failed to open folder');
                      }
                    }}
                  >
                    OPEN LAUNCHER CONFIGURATION FOLDER
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        const result =
                          await window.electron.invoke('open-log-file');
                        if (!result.success) {
                          handleShowToast('Failed to open log file');
                        }
                      } catch {
                        handleShowToast('Failed to open log file');
                      }
                    }}
                  >
                    OPEN LOG FILE
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        const result =
                          await window.electron.invoke('reapply-patches');
                        if (result.success) {
                          handleShowToast(
                            'Version reset to 1.0.0. Please restart the launcher and return to the home page to reapply patches.',
                          );
                        } else {
                          handleShowToast(
                            `Failed to reset version: ${result.error || 'Unknown error'}`,
                          );
                        }
                      } catch {
                        handleShowToast('Failed to reset version');
                      }
                    }}
                  >
                    REAPPLY PATCHES
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#ef4444' }}
                    onClick={async () => {
                      // eslint-disable-next-line no-restricted-globals, no-alert
                      const confirmed = window.confirm(
                        'This will delete all downloaded files and reset the launcher. You will need to download the game again. Continue?',
                      );
                      if (!confirmed) {
                        return;
                      }
                      try {
                        const result =
                          await window.electron.invoke('clear-downloads');
                        if (result.success) {
                          handleShowToast(
                            'Downloads cleared successfully. Please return to the home page to start fresh.',
                          );
                        } else {
                          handleShowToast(
                            `Failed to clear downloads: ${result.error || 'Unknown error'}`,
                          );
                        }
                      } catch {
                        handleShowToast('Failed to clear downloads');
                      }
                    }}
                  >
                    CLEAR ALL DOWNLOADS
                  </button>
                </div>
              </Card>
            </div>
            <div className="launcher-right">
              <Card title="Troubleshooting">
                <div
                  className="settings-row"
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      color: 'var(--ink-soft)',
                      fontSize: '14px',
                    }}
                  >
                    Force start will attempt to launch the game regardless of
                    the current state of the play button.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        if (!window.electron?.launchGame) {
                          handleShowToast('Launch API not available');
                          return;
                        }
                        const result =
                          await window.electron.launchGame(installDir);
                        if (result && result.success) {
                          handleShowToast('Game launched successfully');
                        } else {
                          handleShowToast(
                            `Failed to launch game: ${result?.error || 'Unknown error'}`,
                          );
                        }
                      } catch (err) {
                        handleShowToast(
                          `Error launching game: ${err instanceof Error ? err.message : 'Unknown error'}`,
                        );
                      }
                    }}
                  >
                    FORCE START
                  </button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </section>

      {/* Toast notification */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '4px',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease-in',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
