import React, { useState, useEffect } from 'react';
import log from '../logger';

type ExtensionItem = {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  enabled: boolean;
};

const REQUIRED_PLUGINS = ['Addons', 'Screenshot', 'Sequencer', 'Thirdparty'];

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
        checked={!!checked}
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
  const showAuthor = item.author && item.author.trim().length > 0;
  const showVersion = item.version && item.version.trim().length > 0;

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
        {(showAuthor || showVersion) && (
          <div className="ext-meta">
            {showAuthor && (
              <span className="ext-author">AUTHOR: {item.author}</span>
            )}
            {showVersion && (
              <span className="ext-version">v{item.version}</span>
            )}
          </div>
        )}
      </div>
      <p className="ext-description">{item.description}</p>
    </article>
  );
}

function Column({
  title,
  items,
  setEnabled,
}: {
  title: string;
  items: ExtensionItem[];
  setEnabled: (id: string, value: boolean) => void;
}) {
  const openFolder = async () => {
    try {
      const folderType = title.toLowerCase().includes('addon')
        ? 'addons'
        : 'plugins';
      const result = await window.electron.invoke(
        'open-extension-folder',
        folderType,
      );
      if (!result.success) {
        // eslint-disable-next-line no-alert
        alert(
          `Failed to open ${title} folder${result.error ? `:\n\n${result.error}` : ''}`,
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(
        `Error opening ${title} folder: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
        {(items || []).map((item) => (
          <div role="listitem" key={item.id}>
            <ExtCard
              item={item}
              enabled={item.enabled}
              setEnabled={(v) => setEnabled(item.id, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ExtensionsPage() {
  const [addons, setAddons] = useState<ExtensionItem[]>([]);
  const [plugins, setPlugins] = useState<ExtensionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Required plugins that should always be loaded and hidden from UI
  const requiredPlugins = REQUIRED_PLUGINS;

  // Load extensions from config.json on mount
  useEffect(() => {
    const loadExtensions = async () => {
      try {
        if (!window.electron?.readConfig) {
          setError('Electron preload API not available.');
          return;
        }
        const result = await window.electron.readConfig();
        if (result.success && result.data) {
          const { data } = result;

          // Transform addons object to array and sort alphabetically (case-insensitive)
          if (data.addons) {
            const addonsArray = Object.entries(data.addons)
              .map(([key, value]: [string, any]) => ({
                id: key,
                name: key,
                description: value.description || '',
                author: value.author || '',
                version: value.version || '',
                enabled: value.enabled ?? true,
              }))
              .sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
              );
            setAddons(addonsArray);
          }

          // Transform plugins object to array, filtering out required plugins, and sort alphabetically
          if (data.plugins) {
            const pluginsArray = Object.entries(data.plugins)
              .filter(([key]) => !requiredPlugins.includes(key))
              .map(([key, value]: [string, any]) => ({
                id: key,
                name: key,
                description: value.description || '',
                author: value.author || '',
                version: value.version || '',
                enabled: value.enabled ?? true,
              }))
              .sort((a, b) =>
                a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
              );
            setPlugins(pluginsArray);
          }
        }
      } catch (err) {
        log.error('Failed to load extensions:', err);
        setError('Failed to load extensions from config.');
      }
    };

    loadExtensions();
  }, [requiredPlugins]);

  // Update addon enabled state
  const updateAddonEnabled = async (id: string, value: boolean) => {
    try {
      // Update local state
      setAddons((prev) =>
        prev.map((addon) =>
          addon.id === id ? { ...addon, enabled: value } : addon,
        ),
      );

      // Read current config
      const result = await window.electron.readConfig();
      if (result.success && result.data) {
        const config = result.data;

        // Update the specific addon
        if (config.addons && config.addons[id]) {
          config.addons[id].enabled = value;
        }

        // Write back to config using writeSettings (preserves all fields)
        await window.electron.writeSettings(config);
      }
    } catch (err) {
      log.error('Failed to update addon:', err);
    }
  };

  // Update plugin enabled state
  const updatePluginEnabled = async (id: string, value: boolean) => {
    try {
      // Update local state
      setPlugins((prev) =>
        prev.map((plugin) =>
          plugin.id === id ? { ...plugin, enabled: value } : plugin,
        ),
      );

      // Read current config
      const result = await window.electron.readConfig();
      if (result.success && result.data) {
        const config = result.data;

        // Update the specific plugin
        if (config.plugins && config.plugins[id]) {
          config.plugins[id].enabled = value;
        }

        // Write back to config using writeSettings (preserves all fields)
        await window.electron.writeSettings(config);
      }
    } catch (err) {
      log.error('Failed to update plugin:', err);
    }
  };

  return (
    <div className="extensions-page">
      {error && <div className="error-message">{error}</div>}
      <div className="ext-columns">
        <Column title="ADDONS" items={addons} setEnabled={updateAddonEnabled} />
        <Column
          title="PLUGINS"
          items={plugins}
          setEnabled={updatePluginEnabled}
        />
      </div>
    </div>
  );
}
