import React, { useMemo, useState } from 'react';

type ExtensionItem = {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
};

const sampleAddons: ExtensionItem[] = [
  {
    id: 'allmaps',
    name: 'allmaps',
    description:
      'See every map via /map without needing key items. Also works for viewing map waypoints.',
    author: 'atom0s',
    version: '1.0',
  },
  {
    id: 'aspect',
    name: 'aspect',
    description:
      'Forces the games aspect ratio to match the Windows resolution.',
    author: 'atom0s',
    version: '1.0',
  },
  {
    id: 'autobind',
    name: 'autobind',
    description: 'Automatically handles party invite related interactions.',
    author: 'atom0s & Thomy',
    version: '1.1',
  },
  {
    id: 'bluecheck',
    name: 'bluecheck',
    description:
      'Helper addon to assist with tracking learned BLU spells within an in-game UI.',
    author: 'atom0s',
    version: '1.1',
  },
  {
    id: 'blumon',
    name: 'blumon',
    description:
      'Monitors for learnt Blue Mage spells and announces them with color.',
    author: 'atom0s',
    version: '1.0',
  },
];

const samplePlugins: ExtensionItem[] = [
  {
    id: 'HardwareMouse',
    name: 'HardwareMouse',
    description: 'Improves mouse input by using hardware acceleration.',
    author: 'Horizon',
    version: '2.3.1',
  },
  {
    id: 'LegacyAC',
    name: 'LegacyAC',
    description: 'Legacy anti-cheat compatibility layer.',
    author: 'Horizon',
    version: '1.4.0',
  },
  {
    id: 'Minimap',
    name: 'Minimap',
    description: 'Adds a customizable minimap overlay.',
    author: 'Community',
    version: '1.0.0',
  },
  {
    id: 'Nameplate',
    name: 'Nameplate',
    description: 'Enhanced nameplates with status indicators.',
    author: 'Community',
    version: '1.2.0',
  },
];

function Toggle({
  checked,
  onChange,
  id,
  name,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  name: string;
}) {
  return (
    <label className="toggle" htmlFor={id} aria-label={`Enable ${name}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden />
    </label>
  );
}

function ExtCard({
  item,
  enabled,
  setEnabled,
}: {
  item: ExtensionItem;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  return (
    <article className="ext-card">
      <div className="ext-card-header">
        <div className="ext-title-row">
          <h4 className="ext-name">{item.name}</h4>
          <Toggle
            id={`toggle-${item.id}`}
            checked={enabled}
            onChange={setEnabled}
            name={item.name}
          />
        </div>
        <div className="ext-meta">
          <span className="ext-author">AUTHOR: {item.author}</span>
          <span className="ext-version">v{item.version}</span>
        </div>
      </div>
      <p className="ext-description">{item.description}</p>
    </article>
  );
}

function Column({ title, items }: { title: string; items: ExtensionItem[] }) {
  const initialEnabledState = useMemo(
    () =>
      Object.fromEntries(items.map((i) => [i.id, true])) as Record<
        string,
        boolean
      >,
    [items],
  );
  const [enabled, setEnabled] =
    useState<Record<string, boolean>>(initialEnabledState);

  const openFolder = () => {
    // TODO: wire to IPC (shell.openPath) when paths are defined
    // eslint-disable-next-line no-alert
    alert(`${title}: Open folder (not wired yet)`);
  };

  return (
    <section className="ext-column" aria-label={title}>
      <div className="ext-header">
        <h3 className="ext-section-title">{title}</h3>
        <button type="button" className="ext-open-folder" onClick={openFolder}>
          Open folder
        </button>
      </div>
      <div className="ext-list" role="list">
        {items.map((item) => (
          <div role="listitem" key={item.id}>
            <ExtCard
              item={item}
              enabled={enabled[item.id]}
              setEnabled={(v) => setEnabled((s) => ({ ...s, [item.id]: v }))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ExtensionsPage() {
  return (
    <div className="extensions-page">
      <div className="ext-columns">
        <Column title="ADDONS" items={sampleAddons} />
        <Column title="PLUGINS" items={samplePlugins} />
      </div>
    </div>
  );
}
