import React, { useState } from 'react';

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
    subTabs: [
      { id: 'script', label: 'SCRIPT' },
      { id: 'initialization', label: 'INITIALIZATION' },
    ],
  },
  pivot: {
    label: 'PIVOT',
    subTabs: [{ id: 'overlays', label: 'OVERLAYS' }],
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
      (brightness - BRIGHTNESS_CENTER) / BRIGHTNESS_SCALE
    )
  );
}

function FFXIGeneralPanel() {
  const [brightness, setBrightness] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  // (Bucket value no longer needed; tooltip shows rounded -1..1)

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
              defaultValue="borderless"
              className="select"
            >
              <option value="windowed">Windowed</option>
              <option value="fullscreen">Fullscreen</option>
              <option value="borderless">Borderless Window</option>
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
                defaultValue={1920}
              />
              <input
                id="win-height"
                type="number"
                className="input"
                placeholder="Height"
                defaultValue={1080}
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
                defaultValue={1366}
              />
              <input
                id="menu-height"
                type="number"
                className="input"
                placeholder="Height"
                defaultValue={768}
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
              onChange={(e) => setBrightness(Number(e.target.value))}
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
                {(Math.round(brightnessToRange(brightness) * TOOLTIP_PRECISION) / TOOLTIP_PRECISION).toFixed(1)}
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
              <input id="play-opening" type="checkbox" defaultChecked={false} />
              <span aria-hidden />
            </div>
          </label>
        </div>
      </Card>
    </>
  );
}

function FFXIGraphicsPanel() {
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
                defaultValue={3840}
              />
              <input
                id="bg-height"
                type="number"
                className="input"
                placeholder="Height"
                defaultValue={2160}
              />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Maintain Aspect Ratio" htmlFor="maintain-ar">
            <div className="toggle" aria-label="Maintain Aspect Ratio">
              <input id="maintain-ar" type="checkbox" defaultChecked />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
      </Card>

      <Card title="Graphics">
        <Row>
          <Field label="Graphics Quality" htmlFor="gfx-quality">
            <select id="gfx-quality" defaultValue="high" className="select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="VSync" htmlFor="vsync">
            <div className="toggle" aria-label="VSync">
              <input id="vsync" type="checkbox" defaultChecked />
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
              defaultValue="uncompressed"
              className="select"
            >
              <option value="uncompressed">Uncompressed</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Map Compression" htmlFor="map-comp">
            <select
              id="map-comp"
              defaultValue="uncompressed"
              className="select"
            >
              <option value="uncompressed">Uncompressed</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Font Compression" htmlFor="font-comp">
            <select
              id="font-comp"
              defaultValue="high-quality"
              className="select"
            >
              <option value="high-quality">High Quality</option>
              <option value="compressed">Compressed</option>
              <option value="uncompressed">Uncompressed</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Mip Mapping" htmlFor="mip-mapping">
            <select
              id="mip-mapping"
              defaultValue="best-quality"
              className="select"
            >
              <option value="best-quality">Best Quality</option>
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </Field>
        </Row>
      </Card>
    </>
  );
}

function FFXIFeaturesPanel() {
  return (
    <Card title="Location to store settings and screenshots">
      <Row>
        <input
          id="ffxi-save-path"
          type="text"
          className="input"
          defaultValue={
            'C:\\Program Files (x86)\\Square Enix\\FINAL FANTASY XI'
          }
          aria-label="Location to store settings and screenshots"
        />
      </Row>
    </Card>
  );
}

function FFXIOtherPanel() {
  const [numSounds, setNumSounds] = useState(16);
  const openGamepad = () => {
    // TODO: wire to IPC when ready
    // eslint-disable-next-line no-alert
    alert('Open Gamepad Config (not wired)');
  };
  return (
    <>
      <Card title="Gamepad">
        <Row>
          <button type="button" className="btn" onClick={openGamepad}>
            OPEN GAMEPAD CONFIG
          </button>
        </Row>
      </Card>

      <Card title="Sounds">
        <Row>
          <Field label="Enable Sounds" htmlFor="enable-sounds">
            <div className="toggle" aria-label="Enable Sounds">
              <input id="enable-sounds" type="checkbox" defaultChecked />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Play Sounds in Background" htmlFor="bg-sounds">
            <div className="toggle" aria-label="Play Sounds in Background">
              <input id="bg-sounds" type="checkbox" defaultChecked />
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
                onChange={(e) => setNumSounds(Number(e.target.value))}
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
              <input id="simplified-ccg" type="checkbox" />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Hardware Mouse" htmlFor="hardware-mouse">
            <div className="toggle" aria-label="Hardware Mouse">
              <input id="hardware-mouse" type="checkbox" defaultChecked />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="Graphics Stabilization" htmlFor="graphics-stab">
            <div className="toggle" aria-label="Graphics Stabilization">
              <input id="graphics-stab" type="checkbox" />
              <span aria-hidden />
            </div>
          </Field>
        </Row>
      </Card>
    </>
  );
}

function AshitaScriptPanel() {
  return (
    <Card title="Commands">
      <Row>
        <Field label="FPS" htmlFor="ashita-fps">
          <select id="ashita-fps" defaultValue="60" className="select">
            <option value="30">30 FPS</option>
            <option value="60">60 FPS</option>
            <option value="120">Uncapped (not recommended)</option>
          </select>
        </Field>
      </Row>
      <Row>
        <button type="button" className="btn btn-icon" aria-label="Edit script">
          ✏️
        </button>
        <span className="hint">Manually Edit Script</span>
      </Row>
    </Card>
  );
}

export default function SettingsPage() {
  const [category, setCategory] = useState<CategoryId>('ffxi');
  const [subTab, setSubTab] = useState<SubTabId>('general');

  // Keep subTab valid when category changes
  React.useEffect(() => {
    const subs = CATEGORY_DEFS[category]?.subTabs || [];
    if (subs.length > 0) {
      setSubTab(subs[0].id);
    }
  }, [category]);

  return (
    <div className="settings-page">
      {/* Top category tabs */}
      <nav className="settings-tabs" aria-label="Settings categories">
        {(Object.keys(CATEGORY_DEFS) as CategoryId[]).map((id) => (
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
      {CATEGORY_DEFS[category].subTabs.length > 0 && (
        <div
          className="settings-subtabs"
          role="tablist"
          aria-label="Subcategories"
        >
          {CATEGORY_DEFS[category].subTabs.map((st) => (
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
        {category === 'ffxi' && subTab === 'general' && <FFXIGeneralPanel />}
        {category === 'ffxi' && subTab === 'graphics' && <FFXIGraphicsPanel />}
        {category === 'ffxi' && subTab === 'features' && <FFXIFeaturesPanel />}
        {category === 'ffxi' && subTab === 'other' && <FFXIOtherPanel />}

        {category === 'ashita' && subTab === 'script' && <AshitaScriptPanel />}
        {category === 'ashita' && subTab === 'initialization' && (
          <Card title="Initialization">
            <p>Configure startup options here. (Placeholder)</p>
          </Card>
        )}

        {category === 'pivot' && subTab === 'overlays' && (
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
          <>
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
                    <input id="close-on-run" type="checkbox" defaultChecked />
                    <span aria-hidden />
                  </div>
                </Field>
              </Row>
            </Card>
            <Card title="Paths and Logs">
              <div className="settings-row centered">
                <button type="button" className="btn">
                  OPEN LAUNCHER CONFIGURATION FOLDER
                </button>
                <button type="button" className="btn btn-secondary">
                  OPEN LOG FILE
                </button>
              </div>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}
