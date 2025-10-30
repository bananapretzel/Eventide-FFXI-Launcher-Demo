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
    subTabs: [
      { id: 'general', label: 'GENERAL' },
      { id: 'paths', label: 'PATHS AND LOGS' },
    ],
  },
};

// component functions and helpers are defined above to satisfy lint rules.

/* UI panels (static placeholders; real hooks/file I/O can be wired later) */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-card">
      <h3 className="settings-card-title">{title}</h3>
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

function FFXIGeneralPanel() {
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
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="slider"
            aria-label="Brightness"
          />
        </Row>
        <Row>
          <label className="switch-label" htmlFor="play-opening">
            Play opening movie on startup
            <input id="play-opening" type="checkbox" defaultChecked={false} />
            <span className="switch" aria-hidden />
          </label>
        </Row>
      </Card>
    </>
  );
}

function FFXIGraphicsPanel() {
  return (
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
        <label htmlFor="vsync" className="switch-label">
          VSync
          <input id="vsync" type="checkbox" defaultChecked />
          <span className="switch" aria-hidden />
        </label>
      </Row>
    </Card>
  );
}

function FFXIFeaturesPanel() {
  return (
    <Card title="Features">
      <Row>
        <label htmlFor="hq-textures" className="switch-label">
          High quality textures
          <input id="hq-textures" type="checkbox" defaultChecked />
          <span className="switch" aria-hidden />
        </label>
      </Row>
      <Row>
        <label htmlFor="show-fps" className="switch-label">
          Show FPS counter
          <input id="show-fps" type="checkbox" />
          <span className="switch" aria-hidden />
        </label>
      </Row>
    </Card>
  );
}

function FFXIOtherPanel() {
  return (
    <Card title="Other">
      <p>Miscellaneous options can go here. (Placeholder)</p>
    </Card>
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
            <option value="120">120 FPS</option>
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
    setSubTab(CATEGORY_DEFS[category].subTabs[0].id);
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

      {/* Sub-tabs for the selected category */}
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
              <label htmlFor="pivot-overlay" className="switch-label">
                Eventide
                <input id="pivot-overlay" type="checkbox" defaultChecked />
                <span className="switch" aria-hidden />
              </label>
            </Row>
          </Card>
        )}

        {category === 'launcher' && subTab === 'general' && (
          <Card title="General">
            <Row>
              <label htmlFor="close-on-run" className="switch-label">
                Close Launcher on Game Run
                <input id="close-on-run" type="checkbox" defaultChecked />
                <span className="switch" aria-hidden />
              </label>
            </Row>
          </Card>
        )}

        {category === 'launcher' && subTab === 'paths' && (
          <Card title="Paths and Logs">
            <Row>
              <button type="button" className="btn">
                OPEN LAUNCHER CONFIGURATION FOLDER
              </button>
              <button type="button" className="btn btn-secondary">
                OPEN LOG FILE
              </button>
            </Row>
          </Card>
        )}
      </section>
    </div>
  );
}
