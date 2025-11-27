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
  pivot?: {
    overlayEnabled?: boolean;
  };
}

type CategoryId = 'ffxi' | 'pivot' | 'troubleshooting';
type SubTabId = 'general' | 'graphics' | 'features' | 'other';

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
  pivot: {
    label: 'PIVOT',
    subTabs: [],
  },
  troubleshooting: {
    label: 'TROUBLESHOOTING',
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
  tooltip = '',
  children,
}: {
  label: string;
  htmlFor: string;
  // eslint-disable-next-line react/require-default-props
  tooltip?: string;
  children: React.ReactNode;
}) {
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
  const iconRef = React.useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (tooltipRef.current && iconRef.current) {
      const iconRect = iconRef.current.getBoundingClientRect();
      tooltipRef.current.style.left = `${iconRect.left}px`;
      tooltipRef.current.style.top = `${iconRect.bottom + 8}px`;
    }
  };

  return (
    <label className="settings-field" htmlFor={htmlFor}>
      <span className="settings-field-label">
        <span className="settings-field-label-text">
          {label}
          {tooltip && (
            <span className="tooltip-wrapper" onMouseEnter={handleMouseEnter}>
              <span className="tooltip-icon" ref={iconRef}>
                ?
              </span>
              <span className="tooltip-content" ref={tooltipRef}>
                {tooltip
                  .split('\n')
                  .map((line, i) =>
                    i === 0 ? line : [<br key={`br-${line}`} />, line],
                  )}
              </span>
            </span>
          )}
        </span>
      </span>
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

function LauncherUpdatesCard({
  handleShowToast,
}: {
  handleShowToast: (msg: string) => void;
}) {
  const [updateStatus, setUpdateStatus] = useState<string>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    if (!window.electron?.launcherUpdate?.onUpdateEvent) {
      return () => {};
    }

    const cleanup = window.electron.launcherUpdate.onUpdateEvent(
      (_event, payload) => {
        switch (payload.status) {
          case 'checking':
            setUpdateStatus('checking');
            break;
          case 'update-available':
            setUpdateStatus('available');
            setUpdateInfo(payload.info);
            setIsChecking(false);
            break;
          case 'up-to-date':
            setUpdateStatus('up-to-date');
            setIsChecking(false);
            handleShowToast(payload.message || 'Launcher is up to date!');
            break;
          case 'downloading':
            setUpdateStatus('downloading');
            setDownloadProgress(payload.progress?.percent || 0);
            break;
          case 'downloaded':
            setUpdateStatus('downloaded');
            setIsDownloading(false);
            handleShowToast(
              payload.message ||
                'Update downloaded! Click "Install Update" to restart.',
            );
            break;
          case 'error':
            setUpdateStatus('error');
            setIsChecking(false);
            setIsDownloading(false);
            handleShowToast(
              payload.message || `Update error: ${payload.error}`,
            );
            break;
          default:
            break;
        }
      },
    );

    return cleanup;
  }, [handleShowToast]);

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setUpdateStatus('checking');
    try {
      const result = await window.electron.launcherUpdate.checkForUpdates();
      if (!result.success) {
        handleShowToast(`Failed to check for updates: ${result.error}`);
        setUpdateStatus('error');
        setIsChecking(false);
      }
    } catch (err) {
      handleShowToast(
        `Error checking for updates: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
      setUpdateStatus('error');
      setIsChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    try {
      const result = await window.electron.launcherUpdate.downloadUpdate();
      if (!result.success) {
        handleShowToast(`Failed to download update: ${result.error}`);
        setIsDownloading(false);
      }
    } catch (err) {
      handleShowToast(
        `Error downloading update: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
      setIsDownloading(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await window.electron.launcherUpdate.installUpdate();
    } catch (err) {
      handleShowToast(
        `Error installing update: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <p
          style={{
            margin: 0,
            color: 'var(--ink-soft)',
            fontSize: '14px',
            flex: 1,
          }}
        >
          {updateStatus === 'checking' && 'Checking for updates...'}
          {updateStatus === 'up-to-date' && 'Launcher is up to date.'}
          {updateStatus === 'available' && updateInfo && (
            <>New version available: {updateInfo.version}</>
          )}
          {updateStatus === 'downloading' && (
            <>Downloading update: {downloadProgress.toFixed(1)}%</>
          )}
          {updateStatus === 'downloaded' && 'Update ready to install!'}
          {updateStatus === 'error' && 'Error checking for updates.'}
          {updateStatus === 'idle' && 'Check for launcher updates.'}
        </p>
        <button
          type="button"
          className="btn"
          onClick={handleCheckForUpdates}
          disabled={
            isChecking || isDownloading || updateStatus === 'downloading'
          }
          style={{ minWidth: '180px', width: 'auto' }}
        >
          {isChecking ? 'CHECKING...' : 'CHECK FOR UPDATES'}
        </button>
      </div>
      {updateStatus === 'available' && (
        <button
          type="button"
          className="btn"
          onClick={handleDownloadUpdate}
          disabled={isDownloading}
          style={{
            background: '#3b82f6',
            width: 'fit-content',
            minWidth: '180px',
          }}
        >
          {isDownloading ? 'DOWNLOADING...' : 'DOWNLOAD UPDATE'}
        </button>
      )}
      {updateStatus === 'downloaded' && (
        <button
          type="button"
          className="btn"
          onClick={handleInstallUpdate}
          style={{
            background: '#10b981',
            width: 'fit-content',
            minWidth: '180px',
          }}
        >
          INSTALL UPDATE & RESTART
        </button>
      )}
    </div>
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
          <Field
            label="Window Mode"
            htmlFor="window-mode"
            tooltip="Choose how the game window is displayed: Fullscreen, Windowed, or Windowed Borderless."
          >
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
            </select>
          </Field>
        </Row>

        <Row>
          <Field
            label="Window Resolution"
            htmlFor="win-width"
            tooltip="Represents the physical number of pixels displayed on your screen. This setting is very delicate, and can only be set to a limited number of supported resolutions. It is important that both your video card and your monitor support the screen resolution, or the game will not work."
          >
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
          <Field
            label="Menu Resolution"
            htmlFor="menu-width"
            tooltip="Set the resolution for in-game menus and UI elements. Smaller = larger. Some examples:

            1280 x 720
            1366 x 768
            1600 x 900
            1920 x 1080
            2048 x 1152
            2560 x 1440"
          >
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
          <Field
            label="Background Resolution"
            htmlFor="bg-width"
            tooltip="The background resolution is the resolution at which the 3-D graphics in the game are rendered. Most PC games render the 3D environment at the same resolution the screen resolution is set at. However, Final Fantasy XI renders the 3-D environment at an independent resolution than that of the screen resolution. The background (3-D) graphics are rendered at this fixed resolution and then scaled to fit the screen resolution.&#10;&#10;Rule of thumb: set background resolution to your window resolution and for higher end PCs, set it to 1.5x - 2x your windows resolution for better quality."
          >
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
          <Field
            label="Maintain Aspect Ratio"
            htmlFor="maintain-ar"
            tooltip="When enabled, preserves the original aspect ratio of the game to prevent stretching or distortion."
          >
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
          <Field
            label="Texture Compression"
            htmlFor="tex-comp"
            tooltip="Texture Compression has three settings: High, Low, and Uncompressed. The only textures this setting actually affects are cloud and light flares. Honestly, whichever setting you choose, you will have a hard time telling the difference. The high setting compresses both flares and clouds, while the low setting uses compressed textures only for clouds."
          >
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
          <Field
            label="Map Compression"
            htmlFor="map-comp"
            tooltip="Sets the level of quality for the game's map textures."
          >
            <select
              id="map-comp"
              value={settings.ffxi?.mapCompression ?? 1}
              onChange={(e) =>
                updateSetting('ffxi.mapCompression', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Low</option>
              <option value={1}>High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field
            label="Font Compression"
            htmlFor="font-comp"
            tooltip="Controls the quality of in-game text rendering. 99% of the time, you will want to set this to high."
          >
            <select
              id="font-comp"
              value={settings.ffxi?.fontCompression ?? 2}
              onChange={(e) =>
                updateSetting('ffxi.fontCompression', Number(e.target.value))
              }
              className="select"
            >
              <option value={0}>Low</option>
              <option value={1}>Medium</option>
              <option value={2}>High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field
            label="Environment Animations"
            htmlFor="env-animations"
            tooltip="This determines the framerate at which objects in the environment move, and is defined in the registry value 0011. The possible settings are:

Off:
    No animation. The trees and bushes will not sway in the wind, torch flame will not flicker, etc.

Normal:
    The trees and bushes will sway but their motion will not be smooth. They will move a little, stop, move a little, stop, in very rapid succession, making the movement appear unnatural.

Smooth:
    The framerate will be increased so that the motion is more natural.

This setting will not have a huge impact on gameplay, and turning the setting down will not free up many system resources. For that reason, it is advised to leave this on 2 (smooth). "
          >
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
          <Field
            label="Mip Mapping"
            htmlFor="mip-mapping"
            tooltip="MIP Mapping is the process of reducing large textures into smaller ones to optimize their display at a distance. Higher values reduce shimmer and improve visual quality at a distance, while alleviating strain on the GPU at the cost of using more VRAM."
          >
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
          <Field
            label="Bump Mapping"
            htmlFor="bump-mapping"
            tooltip="Bump mapping is a process by which the textures of an object are given the appearance of 3-D depth. Normally, a texture is created with a preset light source in a preset position, so that no matter how you shine light on an object, the shadows and highlights of the texture will always be the same. Bump mapping assigns limited 3-D attributes to the texture, so that shadows and highlights can be generated with consideration for the various light sources in the environment."
          >
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
          <Field
            label="Enable Sounds"
            htmlFor="enable-sounds"
            tooltip="Master toggle for all in-game sound effects and audio. Disable to mute all game audio. Legend foretells of Tarutaru pondering for thousands of years why this option exists when you can just turn it off in-game..."
          >
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
          <Field
            label="Play Sounds in Background"
            htmlFor="bg-sounds"
            tooltip="Allows game audio to continue playing when the game window is not in focus or minimized."
          >
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
          <Field
            label="Maximum # of Sounds"
            htmlFor="num-sounds"
            tooltip="Maximum number of simultaneous sounds that can be played at once. PS2 limitation. Just set this to 20."
          >
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
            label="Hardware Mouse"
            htmlFor="hardware-mouse"
            tooltip="Uses hardware acceleration for mouse cursor rendering. Provides smoother cursor movement, but may cause issues on some systems. Recommended: ON."
          >
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
          <Field
            label="Graphics Stabilization"
            htmlFor="graphics-stab"
            tooltip="Enabling this option increases the likelihood of avoiding certain issues that arise with specific graphics cards. Keep this off initially, and if you experience GPU-style crashes, turn it on."
          >
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

        {category === 'pivot' && (
          <Card title="Overlays">
            <Row>
              <Field
                label="Eventide"
                htmlFor="pivot-overlay"
                tooltip="Applies Eventide's DATs to the game."
              >
                <div className="toggle" aria-label="Eventide overlay">
                  <input
                    id="pivot-overlay"
                    type="checkbox"
                    checked
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <span aria-hidden />
                </div>
              </Field>
            </Row>
          </Card>
        )}

        {category === 'troubleshooting' && (
          <Card title={undefined}>
            <LauncherUpdatesCard handleShowToast={handleShowToast} />

            <Row>
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
                style={{ width: 'fit-content', minWidth: '220px' }}
              >
                📂 Open Configuration Folder
              </button>
            </Row>
            <Row>
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
                style={{ width: 'fit-content', minWidth: '180px' }}
              >
                📄 Open Log File
              </button>
            </Row>

            <Row>
              <Field
                label="Reapply Patches"
                htmlFor="reapply-patches"
                tooltip="Reset the game version to 1.0.0 and redownload all patches. Use this if game files are corrupted or updates have failed."
              >
                <button
                  type="button"
                  id="reapply-patches"
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
                  style={{ width: 'fit-content', minWidth: '100px' }}
                >
                  Reapply
                </button>
              </Field>
            </Row>
            <Row>
              <span
                className="hint"
                style={{ fontSize: '13px', color: 'var(--ink-soft)' }}
              >
                Reset version to 1.0.0 and reapply all patches on next launch.
              </span>
            </Row>

            <Row>
              <Field
                label="Force Start Game"
                htmlFor="force-start"
                tooltip="Bypass launcher checks and attempt to start the game immediately. Use this if the Play button is disabled incorrectly."
              >
                <button
                  type="button"
                  id="force-start"
                  className="btn btn-primary"
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
                  style={{ width: 'fit-content', minWidth: '100px' }}
                >
                  Launch
                </button>
              </Field>
            </Row>
            <Row>
              <span
                className="hint"
                style={{ fontSize: '13px', color: 'var(--ink-soft)' }}
              >
                Attempt to launch the game regardless of the current play button
                state.
              </span>
            </Row>
          </Card>
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
