import React, { useState, useEffect, useRef } from 'react';
import log from '../logger';
// eslint-disable-next-line import/no-named-as-default
import Select from '../components/Select';

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
    screenshotResolution?: boolean;
    screenshotPath?: string;
  };
  pivot?: {
    overlayEnabled?: boolean;
    overlayOrder?: string[];
  };
}

type CategoryId = 'ffxi' | 'pivot' | 'troubleshooting';
type SubTabId = 'general' | 'graphics' | 'other';

const CATEGORY_DEFS: Record<
  CategoryId,
  { label: string; subTabs: { id: SubTabId; label: string }[] }
> = {
  ffxi: {
    label: 'FINAL FANTASY XI',
    subTabs: [
      { id: 'general', label: 'GENERAL' },
      { id: 'graphics', label: 'GRAPHICS' },
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

/**
 * Reusable Tooltip component with proper positioning
 * Uses dynamic positioning to prevent issues with scrolling
 * Accounts for CSS zoom for Wine/Linux compatibility
 */
function Tooltip({
  content,
  iconStyle,
}: {
  content: string;
  // eslint-disable-next-line react/require-default-props
  iconStyle?: React.CSSProperties;
}) {
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
  const iconRef = React.useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (tooltipRef.current && iconRef.current) {
      const iconRect = iconRef.current.getBoundingClientRect();
      // Account for CSS zoom - get current zoom level from body
      const zoomStr = document.body.style.zoom || '100%';
      const zoom = parseFloat(zoomStr) / 100 || 1;
      // Adjust coordinates for zoom (Wine/Linux compatibility)
      tooltipRef.current.style.left = `${iconRect.left / zoom}px`;
      tooltipRef.current.style.top = `${(iconRect.bottom + 8) / zoom}px`;
    }
  };

  return (
    <span className="tooltip-wrapper" onMouseEnter={handleMouseEnter}>
      <span className="tooltip-icon" ref={iconRef} style={iconStyle}>
        ?
      </span>
      <span className="tooltip-content" ref={tooltipRef}>
        {content}
      </span>
    </span>
  );
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
      // Account for CSS zoom - get current zoom level from body
      const zoomStr = document.body.style.zoom || '100%';
      const zoom = parseFloat(zoomStr) / 100 || 1;
      // Adjust coordinates for zoom (Wine/Linux compatibility)
      tooltipRef.current.style.left = `${iconRect.left / zoom}px`;
      tooltipRef.current.style.top = `${(iconRect.bottom + 8) / zoom}px`;
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

// Convert slider value (0-100) to normalized range (-1 to 1)
function brightnessToRange(brightness: number): number {
  return Math.max(
    MIN_BRIGHTNESS_RANGE,
    Math.min(
      MAX_BRIGHTNESS_RANGE,
      (brightness - BRIGHTNESS_CENTER) / BRIGHTNESS_SCALE,
    ),
  );
}

// Convert normalized range (-1 to 1) back to slider value (0-100)
function rangeToBrightness(normalizedValue: number): number {
  return Math.round(normalizedValue * BRIGHTNESS_SCALE + BRIGHTNESS_CENTER);
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

  // Determine button text and action based on current state
  const getButtonConfig = () => {
    if (isChecking || updateStatus === 'checking') {
      return {
        text: 'Checking...',
        action: handleCheckForUpdates,
        disabled: true,
        style: {},
      };
    }
    if (updateStatus === 'available') {
      return {
        text: isDownloading ? 'Downloading...' : 'Download Update',
        action: handleDownloadUpdate,
        disabled: isDownloading,
        style: { background: 'var(--accent-dark)' },
      };
    }
    if (updateStatus === 'downloading') {
      return {
        text: `Downloading...`,
        action: handleDownloadUpdate,
        disabled: true,
        style: { background: 'var(--accent-dark)' },
      };
    }
    if (updateStatus === 'downloaded') {
      return {
        text: 'Install Update & Restart',
        action: handleInstallUpdate,
        disabled: false,
        style: { background: 'var(--success)' },
      };
    }
    // Default: idle, up-to-date, or error - show check for updates
    return {
      text: 'Check For Updates',
      action: handleCheckForUpdates,
      disabled: false,
      style: {},
    };
  };

  const buttonConfig = getButtonConfig();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
            Launcher Update
          </span>
        </div>
        <span
          style={{
            fontSize: '13px',
            color: 'var(--ink-soft)',
            lineHeight: '1.4',
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
        </span>
      </div>
      <button
        type="button"
        className="btn"
        onClick={buttonConfig.action}
        disabled={buttonConfig.disabled}
        style={{ minWidth: '200px', flexShrink: 0, ...buttonConfig.style }}
      >
        {buttonConfig.text}
      </button>
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
  // Convert normalized value (-1 to 1) back to slider value (0-100)
  // Default to 50 (which is 0 normalized) if undefined
  const getNormalizedBrightness = () => {
    const storedValue = settings.ffxi?.brightness;
    if (storedValue === undefined || storedValue === null) {
      return 50; // Default: 0 normalized = 50 on slider
    }
    // If the value is in normalized range (-1 to 1), convert to slider value
    if (storedValue >= -1 && storedValue <= 1) {
      return rangeToBrightness(storedValue);
    }
    // If already in slider range (0-100), use as-is (for backwards compatibility)
    return storedValue;
  };

  const [brightness, setBrightness] = useState(getNormalizedBrightness);
  const [isDragging, setIsDragging] = useState(false);

  // Sync local brightness state when settings change (e.g., when navigating back to this tab)
  useEffect(() => {
    setBrightness(getNormalizedBrightness());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ffxi?.brightness]);

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
            <Select
              id="window-mode"
              value={settings.ffxi?.windowMode ?? 1}
              onChange={(value) =>
                updateSetting('ffxi.windowMode', Number(value))
              }
              options={[
                { value: 0, label: 'Fullscreen' },
                { value: 1, label: 'Windowed' },
                { value: 2, label: 'Windowed (Borderless)' },
              ]}
            />
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
            <Select
              id="tex-comp"
              value={settings.ffxi?.textureCompression ?? 2}
              onChange={(value) =>
                updateSetting('ffxi.textureCompression', Number(value))
              }
              options={[
                { value: 0, label: 'High' },
                { value: 1, label: 'Low' },
                { value: 2, label: 'Uncompressed' },
              ]}
            />
          </Field>
        </Row>
        <Row>
          <Field
            label="Map Compression"
            htmlFor="map-comp"
            tooltip="Sets the level of quality for the game's map textures."
          >
            <Select
              id="map-comp"
              value={settings.ffxi?.mapCompression ?? 1}
              onChange={(value) =>
                updateSetting('ffxi.mapCompression', Number(value))
              }
              options={[
                { value: 0, label: 'Low' },
                { value: 1, label: 'High' },
              ]}
            />
          </Field>
        </Row>
        <Row>
          <Field
            label="Font Compression"
            htmlFor="font-comp"
            tooltip="Controls the quality of in-game text rendering. 99% of the time, you will want to set this to high."
          >
            <Select
              id="font-comp"
              value={settings.ffxi?.fontCompression ?? 2}
              onChange={(value) =>
                updateSetting('ffxi.fontCompression', Number(value))
              }
              options={[
                { value: 0, label: 'Low' },
                { value: 1, label: 'Medium' },
                { value: 2, label: 'High' },
              ]}
            />
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
            <Select
              id="env-animations"
              value={settings.ffxi?.envAnimations ?? 2}
              onChange={(value) =>
                updateSetting('ffxi.envAnimations', Number(value))
              }
              options={[
                { value: 0, label: 'Off' },
                { value: 1, label: 'Normal' },
                { value: 2, label: 'Smooth' },
              ]}
            />
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
            <Select
              id="mip-mapping"
              value={settings.ffxi?.mipMapping ?? 6}
              onChange={(value) =>
                updateSetting('ffxi.mipMapping', Number(value))
              }
              options={[
                { value: 0, label: 'Off' },
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
                { value: 5, label: '5' },
                { value: 6, label: 'High' },
              ]}
            />
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
  // Helper to get default screenshot path
  const getDefaultScreenshotPath = () => {
    return 'C:\\Program Files (x86)\\Square Enix\\FINAL FANTASY XI\\screenshots';
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

      <Card title="Screenshots">
        <Row>
          <Field
            label="Screenshots in Screen Resolution"
            htmlFor="screenshot-resolution"
            tooltip="When enabled, screenshots will be taken at your screen resolution."
          >
            <div
              className="toggle"
              aria-label="Screenshots in Screen Resolution"
            >
              <input
                id="screenshot-resolution"
                type="checkbox"
                checked={settings.ffxi?.screenshotResolution ?? false}
                onChange={(e) =>
                  updateSetting('ffxi.screenshotResolution', e.target.checked)
                }
              />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field
            label="Screenshot Directory"
            htmlFor="screenshot-path"
            tooltip="Choose where to save your screenshots. The default location is the game/screenshots folder."
          >
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <input
                id="screenshot-path"
                type="text"
                className="input"
                placeholder="Screenshot directory path"
                value={
                  settings.ffxi?.screenshotPath ?? getDefaultScreenshotPath()
                }
                onChange={(e) =>
                  updateSetting('ffxi.screenshotPath', e.target.value)
                }
                aria-label="Screenshot directory path"
                style={{ flex: 1 }}
                readOnly
              />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  try {
                    const result =
                      await window.electron.selectScreenshotDirectory();
                    if (result.success && result.path) {
                      updateSetting('ffxi.screenshotPath', result.path);
                    }
                  } catch {
                    // eslint-disable-next-line no-alert
                    alert('Failed to open directory picker');
                  }
                }}
                style={{ minWidth: 'auto', padding: '8px 16px' }}
              >
                Browse
              </button>
            </div>
          </Field>
        </Row>
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
  const [installDir, setInstallDir] = useState<string>('');
  const [isUninstalling, setIsUninstalling] = useState(false);
  const uninstallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uninstallElapsed, setUninstallElapsed] = useState(0);

  const [pivotOverlays, setPivotOverlays] = useState<string[]>(['Eventide']);
  const pivotDragIndexRef = useRef<number | null>(null);
  const [pivotDraggingIndex, setPivotDraggingIndex] = useState<number | null>(
    null,
  );
  const pivotDragGhostRef = useRef<HTMLDivElement | null>(null);

  const cleanupPivotDragGhost = () => {
    if (pivotDragGhostRef.current) {
      try {
        document.body.removeChild(pivotDragGhostRef.current);
      } catch {
        // ignore
      }
      pivotDragGhostRef.current = null;
    }
  };

  // Get installDir on mount
  useEffect(() => {
    async function fetchPaths() {
      // Get installDir from IPC
      if (window.electron?.invoke) {
        try {
          const res = await window.electron.invoke('eventide:get-paths');
          if (res && res.success && res.data && res.data.gameRoot) {
            setInstallDir(res.data.gameRoot);
          }
        } catch (err) {
          log.error('Error fetching paths:', err);
        }
      }
    }
    fetchPaths();
  }, []);

  const handleShowToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // Load settings on mount
  // We read from BOTH the launcher config AND the INI file.
  // The INI file represents the actual game settings, so its values take priority.
  // This ensures a fresh launcher install shows the actual configured game settings.
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (!window.electron?.readSettings) {
          setError('Electron preload API not available.');
          return;
        }

        // Read launcher config (for non-INI settings like credentials, etc.)
        const configResult = await window.electron.readSettings();
        const launcherConfig = configResult.success
          ? configResult.data || {}
          : {};

        // Read settings directly from the INI file (actual game configuration)
        // This is the source of truth for game settings
        let iniSettings: Record<string, any> = {};
        if (window.electron?.readIniSettings) {
          try {
            const iniResult = await window.electron.readIniSettings();
            if (iniResult.success && iniResult.data) {
              iniSettings = iniResult.data;
              log.info(
                '[Settings] Loaded settings from INI file:',
                iniSettings,
              );
            }
          } catch (iniErr) {
            log.warn(
              '[Settings] Could not read INI settings, using launcher config only:',
              iniErr,
            );
          }
        }

        // Merge: start with launcher config, then overlay INI settings
        // INI settings take priority as they represent actual game configuration
        const merged: Settings = { ...launcherConfig };

        // Merge ffxi settings - INI takes priority over launcher config
        const mergedFfxi = {
          ...(launcherConfig.ffxi || {}),
          ...(iniSettings.ffxi || {}),
        };

        // Apply defaults only for values that don't exist in either source
        if (typeof mergedFfxi.bgWidth === 'undefined')
          mergedFfxi.bgWidth = 2880;
        if (typeof mergedFfxi.bgHeight === 'undefined')
          mergedFfxi.bgHeight = 1620;

        merged.ffxi = mergedFfxi;
        setSettings(merged);
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

  const reorderPivotOverlays = (fromIndex: number, toIndex: number) => {
    // Eventide is pinned at index 0
    if (fromIndex <= 0 || toIndex <= 0) return;
    if (fromIndex === toIndex) return;
    setPivotOverlays((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const pinned = [
        'Eventide',
        ...next.filter((x) => x.toLowerCase() !== 'eventide'),
      ];
      updateSetting('pivot.overlayOrder', pinned);
      return pinned;
    });
  };

  // Load Pivot overlays list from the filesystem via main process
  useEffect(() => {
    let cancelled = false;

    if (category !== 'pivot') {
      return () => {
        cancelled = true;
      };
    }

    const norm = (s: string) => (s || '').trim();
    const uniq = (arr: string[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      arr.forEach((item) => {
        const n = norm(item);
        if (n) {
          const k = n.toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            out.push(n);
          }
        }
      });
      return out;
    };
    const ensureEventideFirst = (arr: string[]) => {
      const cleaned = arr.map(norm).filter(Boolean);
      const rest = cleaned.filter((x) => x.toLowerCase() !== 'eventide');
      return ['Eventide', ...rest];
    };

    const load = async () => {
      try {
        if (!window.electron?.invoke) return;
        const res = await window.electron.invoke('pivot:list-overlays');
        const available = Array.isArray(res?.data)
          ? res.data.filter((x: any) => typeof x === 'string')
          : [];

        const availableOrder = ensureEventideFirst(uniq(available));
        const availableSet = new Set(
          availableOrder.map((x) => x.toLowerCase()),
        );

        const saved = settings?.pivot?.overlayOrder;
        const desired = Array.isArray(saved)
          ? saved.filter((x: any) => typeof x === 'string')
          : [];

        const filteredDesired = desired
          .map(norm)
          .filter(Boolean)
          .filter((x) => availableSet.has(x.toLowerCase()));

        const merged = ensureEventideFirst(uniq(filteredDesired));
        const used = new Set(merged.map((x) => x.toLowerCase()));
        availableOrder.forEach((name) => {
          const key = name.toLowerCase();
          if (key !== 'eventide' && !used.has(key)) {
            merged.push(name);
          }
        });

        if (!cancelled) {
          setPivotOverlays(merged);
        }
      } catch (e) {
        log.warn('[SettingsPage] Failed to load Pivot overlays:', e);
        if (!cancelled) setPivotOverlays(['Eventide']);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

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
        {category === 'ffxi' && subTab === 'other' && (
          <FFXIOtherPanel settings={settings} updateSetting={updateSetting} />
        )}

        {category === 'pivot' && (
          <Card title="Overlays">
            <Row>
              <div style={{ width: '100%' }}>
                <div
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink, #004D40)',
                    lineHeight: 1.4,
                    marginBottom: '10px',
                  }}
                >
                  Click & Drag overlays to set priority. Top is applied first,
                  bottom is applied last.
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                  aria-label="Pivot overlays"
                >
                  {pivotOverlays.map((name, idx) => {
                    const isPinned = idx === 0;
                    const display = isPinned ? `${name} (required)` : name;

                    let opacity = 1;
                    if (isPinned) {
                      opacity = 0.9;
                    } else if (pivotDraggingIndex === idx) {
                      opacity = 0.55;
                    }

                    return (
                      <div
                        key={name}
                        draggable={!isPinned}
                        onDragStart={(e) => {
                          if (isPinned) return;
                          pivotDragIndexRef.current = idx;
                          setPivotDraggingIndex(idx);

                          cleanupPivotDragGhost();
                          // Make the drag preview (ghost) less opaque
                          try {
                            const source = e.currentTarget as HTMLDivElement;
                            const ghost = source.cloneNode(
                              true,
                            ) as HTMLDivElement;
                            const rect = source.getBoundingClientRect();
                            ghost.style.opacity = '5';
                            ghost.style.position = 'absolute';
                            ghost.style.top = '-1000px';
                            ghost.style.left = '-1000px';
                            ghost.style.pointerEvents = 'none';
                            ghost.style.width = `${rect.width}px`;
                            document.body.appendChild(ghost);
                            pivotDragGhostRef.current = ghost;

                            if (e.dataTransfer) {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setDragImage(ghost, 20, 20);
                            }
                          } catch {
                            // If cloning or setDragImage fails, fall back to default behavior
                          }
                        }}
                        onDragOver={(e) => {
                          if (isPinned) return;
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = pivotDragIndexRef.current;
                          pivotDragIndexRef.current = null;
                          setPivotDraggingIndex(null);
                          cleanupPivotDragGhost();
                          if (typeof from !== 'number') return;
                          reorderPivotOverlays(from, idx);
                        }}
                        onDragEnd={() => {
                          pivotDragIndexRef.current = null;
                          setPivotDraggingIndex(null);
                          cleanupPivotDragGhost();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          border:
                            '1px solid var(--success-border, var(--border-color))',
                          borderRadius: '10px',
                          background: 'var(--bg-3, var(--panel))',
                          color: 'var(--ink, #111827)',
                          opacity,
                          cursor: isPinned ? 'default' : 'grab',
                          userSelect: 'none',
                        }}
                        aria-label={
                          isPinned
                            ? `Pivot overlay ${name} required`
                            : `Pivot overlay ${name}`
                        }
                      >
                        <div
                          style={{ display: 'flex', flexDirection: 'column' }}
                        >
                          <span style={{ fontWeight: 600 }}>{display}</span>
                        </div>

                        <span
                          aria-hidden
                          style={{
                            fontSize: '12px',
                            color: 'var(--ink-soft, #6b7280)',
                          }}
                        >
                          {isPinned ? 'Pinned' : 'Drag'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Row>
          </Card>
        )}

        {category === 'troubleshooting' && (
          <Card title={undefined}>
            {/* Launcher Updates Section */}
            <LauncherUpdatesCard handleShowToast={handleShowToast} />

            {/* Quick Access Buttons - stacked on the right */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-soft, #e5e7eb)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                    Quick Access
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink-soft)',
                    lineHeight: '1.4',
                  }}
                >
                  Open configuration files and logs for troubleshooting.
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  flexShrink: 0,
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
                  style={{ minWidth: '200px' }}
                >
                  Open Config Folder
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
                  style={{ minWidth: '200px' }}
                >
                  Open Log File
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    try {
                      const result =
                        await window.electron.invoke('open-game-folder');
                      if (!result.success) {
                        handleShowToast(
                          result.error || 'Failed to open game folder',
                        );
                      }
                    } catch {
                      handleShowToast('Failed to open game folder');
                    }
                  }}
                  style={{ minWidth: '200px' }}
                >
                  Open Game Files
                </button>
              </div>
            </div>

            {/* Advanced Troubleshooting Section */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-soft, #e5e7eb)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Reapply Patches */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      Reapply Patches
                    </span>
                    <Tooltip content="Reset the game version to 1.0.0 and redownload all patches. Use this if game files are corrupted or updates have failed." />
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--ink-soft)',
                      lineHeight: '1.4',
                    }}
                  >
                    Reset version to 1.0.0 and reapply all patches on next
                    launch.
                  </span>
                </div>
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
                  style={{ minWidth: '100px', flexShrink: 0 }}
                >
                  Reapply
                </button>
              </div>

              {/* Force Start Game */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-soft, #e5e7eb)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      Force Start Game
                    </span>
                    <Tooltip content="Bypass launcher checks and attempt to start the game immediately. Use this if the Play button is disabled incorrectly." />
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--ink-soft)',
                      lineHeight: '1.4',
                    }}
                  >
                    Attempt to launch the game regardless of the current play
                    button state.
                  </span>
                </div>
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
                  style={{ minWidth: '100px', flexShrink: 0 }}
                >
                  Launch
                </button>
              </div>

              {/* Uninstall Section */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-soft, #e5e7eb)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: '#dc2626' }}>
                      Uninstall
                    </span>
                    <Tooltip content="This will permanently delete all game files, downloads, and launcher data. This action cannot be undone." />
                  </div>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--ink-soft)',
                      lineHeight: '1.4',
                    }}
                  >
                    {isUninstalling
                      ? `Uninstalling... (${Math.floor(uninstallElapsed / 60)
                          .toString()
                          .padStart(
                            2,
                            '0',
                          )}:${(uninstallElapsed % 60).toString().padStart(2, '0')} elapsed)`
                      : 'Remove all game files, downloads, and launcher configuration.'}
                  </span>
                </div>
                <button
                  type="button"
                  id="uninstall-game"
                  className="btn"
                  disabled={isUninstalling}
                  onClick={async () => {
                    // eslint-disable-next-line no-alert
                    const confirmed = window.confirm(
                      'Are you sure you want to uninstall?\n\n' +
                        'This will permanently delete:\n' +
                        '• All game files\n' +
                        '• Downloaded content\n' +
                        '• Launcher configuration\n\n' +
                        'This action cannot be undone.',
                    );
                    if (!confirmed) return;

                    // Start uninstall with progress indicator
                    setIsUninstalling(true);
                    setUninstallElapsed(0);
                    uninstallTimerRef.current = setInterval(() => {
                      setUninstallElapsed((prev) => prev + 1);
                    }, 1000);

                    try {
                      const result =
                        await window.electron.invoke('uninstall-game');

                      // Stop timer
                      if (uninstallTimerRef.current) {
                        clearInterval(uninstallTimerRef.current);
                        uninstallTimerRef.current = null;
                      }
                      setIsUninstalling(false);

                      if (result.success) {
                        handleShowToast(
                          'Uninstall complete. The launcher will now close.',
                        );
                        setTimeout(() => {
                          window.electron?.windowControls?.close?.();
                        }, 2000);
                      } else {
                        handleShowToast(
                          `Failed to uninstall: ${result.error || 'Unknown error'}`,
                        );
                      }
                    } catch (err) {
                      // Stop timer on error
                      if (uninstallTimerRef.current) {
                        clearInterval(uninstallTimerRef.current);
                        uninstallTimerRef.current = null;
                      }
                      setIsUninstalling(false);
                      handleShowToast(
                        `Error during uninstall: ${err instanceof Error ? err.message : 'Unknown error'}`,
                      );
                    }
                  }}
                  style={{
                    minWidth: '100px',
                    flexShrink: 0,
                    background: isUninstalling ? '#9ca3af' : '#dc2626',
                    borderColor: isUninstalling ? '#9ca3af' : '#dc2626',
                    color: 'white',
                    cursor: isUninstalling ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isUninstalling ? 'Uninstalling...' : 'Uninstall'}
                </button>
              </div>
            </div>
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
