import React, { useState, useEffect } from 'react';

type ExtensionItem = {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
};

// Addons list aligned with provided JSON
// prettier-ignore
const Addons: ExtensionItem[] = [
  { id: 'aspect', name: 'aspect', description: "Forces the game's aspect ratio to match the Windows resolution.", author: 'atom0s', version: '1.0' },
  { id: 'autojoin', name: 'autojoin', description: 'Automatically handles party invite related interactions.', author: 'atom0s & Thorny', version: '1.0' },
  { id: 'blucheck', name: 'blucheck', description: 'Helper addon to assist with tracking learned BLU spells with an in-game UI.', author: 'atom0s', version: '1.1' },
  { id: 'blumon', name: 'blumon', description: 'Monitors for learnt Blue Mage spells and announces them with color.', author: 'atom0s', version: '1.0' },
  { id: 'blusets', name: 'blusets', description: 'Manage blue magic spells easily with slash commands.', author: 'atom0s', version: '1.0' },
  { id: 'cfhblock', name: 'cfhblock', description: 'Blocks call for help from working to prevent accidents.', author: 'atom0s', version: '1.0' },
  { id: 'chains', name: 'chains', description: 'Display current skillchain options.', author: 'Sippius - Original Ashita-v3 skillchains by Ivaar', version: '0.6.2' },
  { id: 'chamcham', name: 'chamcham', description: 'Enables coloring models based on their entity type.', author: 'atom0s', version: '1.0' },
  { id: 'changecall', name: 'changecall', description: 'Replaces all call commands with the selected call id instead.', author: 'atom0s', version: '1.0' },
  { id: 'chatfix', name: 'chatfix', description: 'Fixes private server chat issues related to a client update.', author: 'atom0s & Thorny', version: '1.0' },
  { id: 'chatmon', name: 'chatmon', description: 'Plays sounds as a reaction to certain events in chat. (And some other helpful events.)', author: 'atom0s', version: '1.0' },
  { id: 'checker', name: 'checker', description: 'Displays additional information when using /check on a monster.', author: 'atom0s', version: '1.0' },
  { id: 'cleancs', name: 'cleancs', description: 'Hides Ashita rendered elements while in a cutscene.', author: 'atom0s', version: '1.0' },
  { id: 'clock', name: 'clock', description: 'Allows the player to display various times on screen.', author: 'atom0s', version: '1.0' },
  { id: 'config', name: 'config', description: 'Enables slash commands to force-set game settings directly.', author: 'atom0s', version: '1.1' },
  { id: 'craftmon', name: 'craftmon', description: 'Displays crafting results immediately upon starting a synth.', author: 'atom0s', version: '1.0' },
  { id: 'debuff', name: 'debuff', description: 'Enables cancelling status effects via a command.', author: 'atom0s', version: '1.0' },
  { id: 'distance', name: 'distance', description: 'Displays the distance between you and your target.', author: 'atom0s', version: '1.0' },
  { id: 'drawdistance', name: 'drawdistance', description: 'Adds slash commands to alter the games scene rendering distances.', author: 'atom0s', version: '1.0' },
  { id: 'enternity', name: 'enternity', description: 'Removes the need to press enter through npc dialog and cutscenes.', author: 'Hypnotoad & atom0s', version: '1.0' },
  { id: 'equipmon', name: 'equipmon', description: 'Displays the players equipment onscreen at all times.', author: 'atom0s', version: '1.0' },
  { id: 'filterless', name: 'filterless', description: 'Disables the bad language filter for private servers.', author: 'atom0s', version: '1.0' },
  { id: 'filters', name: 'filters', description: 'Allows for saving/loading chat filter sets with ease. (Useful for private servers.)', author: 'atom0s', version: '1.0' },
  { id: 'find', name: 'find', description: 'Allows searching for items, NPCs, and other entities within the game.', author: 'MalRD, zombie343, sippius(v4)', version: '3.1.0' },
  { id: 'fps', name: 'fps', description: 'Displays and manipulates the games framerate handling.', author: 'atom0s', version: '1.1' },
  { id: 'freemem', name: 'freemem', description: 'Memory cleanup.', author: 'atom0s', version: '1.0' },
  { id: 'hideconsole', name: 'hideconsole', description: 'Adds slash commands to hide or show the boot loader for private servers.', author: 'atom0s', version: '1.0' },
  { id: 'hideparty', name: 'hideparty', description: 'Adds slash commands to hide, show, or toggle the games party frames.', author: 'atom0s', version: '1.0' },
  { id: 'hideui', name: 'hideui', description: "Adds slash commands to hide, show, or toggle Ashita's custom drawn elements.", author: 'atom0s', version: '1.0' },
  { id: 'hxui', name: 'HXUI', description: 'Multiple UI elements with manager', author: 'Team HXUI (Tirem, Shuu, colorglut, RheaCloud)', version: '1.1.1' },
  { id: 'ime', name: 'ime', description: 'Allows non-Japanese clients to talk using the Japanese IME and character sets.', author: 'atom0s', version: '1.0' },
  { id: 'imguistyle', name: 'imguistyle', description: 'Allows per-character customizations to the ImGui style settings.', author: 'atom0s', version: '1.0' },
  { id: 'instantah', name: 'instantah', description: 'Removes the delay from auction house interactions.', author: 'atom0s', version: '1.0' },
  { id: 'instantchat', name: 'instantchat', description: 'Removes the delay from adding messages to the chat windows.', author: 'atom0s', version: '1.1' },
  { id: 'itemwatch', name: 'itemwatch', description: 'Tracks and monitors items and key items on screen.', author: 'atom0s', version: '1.0' },
  { id: 'links', name: 'links', description: 'Captures urls from the various text of the game and adds them to a ui window.', author: 'atom0s', version: '1.0' },
  { id: 'logincmd', name: 'logincmd', description: 'Executes a per-character script when logging in, or switching characters.', author: 'atom0s', version: '1.0' },
  { id: 'logs', name: 'logs', description: 'Logs all text that goes through the chat log to a file.', author: 'atom0s', version: '1.0' },
  { id: 'luashitacast', name: 'luashitacast', description: 'A lua-based equipment swapping system for Ashita', author: 'Thorny', version: '1.50' },
  { id: 'macrofix', name: 'macrofix', description: 'Removes the macro bar delay when pressing CTRL or ALT.', author: 'atom0s & Sorien', version: '1.0' },
  { id: 'meteorologist', name: 'meteorologist', description: 'Provides weather information in chat.', author: 'Matix and Hugin', version: '4.0.0' },
  { id: 'minimapmon', name: 'minimapmon', description: 'Hides the Minimap plugin under certain conditions, such as standing still.', author: 'atom0s', version: '1.0' },
  { id: 'mipmap', name: 'mipmap', description: 'Removes the recent patch made by SE to alter how mipmaps are configured.', author: 'atom0s', version: '1.0' },
  { id: 'mobdb', name: 'mobdb', description: 'Displays various information about monsters.', author: 'Thorny', version: '1.11' },
  { id: 'move', name: 'move', description: 'Window helper to adjust position, size, border, etc.', author: 'atom0s', version: '1.0' },
  { id: 'noname', name: 'noname', description: 'Removes the local player name.', author: 'atom0s', version: '1.0' },
  { id: 'petinfo', name: 'petinfo', description: 'Displays information about the players pet.', author: 'atom0s & Tornac', version: '1.1' },
  { id: 'petme', name: 'petme', description: 'Displays detailed pet information.', author: 'Mathemagic', version: '2.1.1' },
  { id: 'points', name: 'points', description: 'Various resource point and event tracking', author: 'Shinzaku', version: '2.2.2' },
  { id: 'pupsets', name: 'pupsets', description: 'Manage pup attachments easily with slash commands.', author: 'sippius - blusets(atom0s)/pupsets-v3(DivByZero)', version: '1.1' },
  { id: 'recast', name: 'recast', description: 'Displays ability and spell recast times.', author: 'atom0s, Thorny, RZN', version: '1.0' },
  { id: 'renamer', name: 'renamer', description: 'Renames entities with overrides.', author: 'atom0s & Teotwawki', version: '1.0' },
  { id: 'rolltracker', name: 'RollTracker', description: 'Tracks Corsair rolls and displays relevant information for party members.', author: 'Daniel_H, sippius(v4)', version: '1.0.2' },
  { id: 'sexchange', name: 'sexchange', description: 'Allows changing the players race and hair style with commands', author: 'atom0s', version: '1.0' },
  { id: 'simplelog', name: 'SimpleLog', description: 'Combat log parser', author: 'Created by Byrth, Ported by Spiken', version: '0.1.1' },
  { id: 'singlerace', name: 'singlerace', description: 'Enables changing all player and npc models to a single race/hair style. (One of us....)', author: 'atom0s', version: '1.0' },
  { id: 'stfu', name: 'stfu', description: 'Prevents commonly repeated chat output from the game and prevents calls from making sounds.', author: 'atom0s', version: '1.0' },
  { id: 'targetlines', name: 'targetlines', description: 'FFXII style target lines', author: 'Jyouya', version: '1.2' },
  { id: 'timers', name: 'timers', description: "Displays the duration of spells and abilities you've used.", author: 'Lunaretic, Shiyo, The Mystic', version: '1.0.3.3' },
  { id: 'timestamp', name: 'timestamp', description: 'Adds a timestamp to chat messages.', author: 'atom0s', version: '1.0' },
  { id: 'tokens', name: 'tokens', description: 'Extends the parsable tokens in the chatlog.', author: 'atom0s', version: '1.0' },
  { id: 'tparty', name: 'tparty', description: 'Displays party member TP amounts and target health percent.', author: 'atom0s', version: '1.0' },
  { id: 'xicamera', name: 'xicamera', description: 'Modifies the camera distance from the player.', author: 'Hokuten', version: '0.7.5' },
];

// Plugins list aligned with provided JSON
// prettier-ignore
const Plugins: ExtensionItem[] = [
  { id: 'addons', name: 'Addons', description: 'Enables use of addons.', author: '', version: '' },
  { id: 'discordrpc', name: 'DiscordRPC', description: 'Sends "rich presence" information to Discord showing your character\'s name, location, levels, etc.', author: '', version: '' },
  { id: 'hardwaremouse', name: 'HardwareMouse', description: 'Fixes issues with the mouse not working properly when using some graphics proxy libraries, such as dgVoodoo.', author: '', version: '' },
  { id: 'legacyac', name: 'LegacyAC', description: 'Older version of Ashitacast ported from Ashita v3.', author: '', version: '' },
  { id: 'minimap', name: 'Minimap', description: 'Displays a minimap of the current area on-screen. Includes various configurations to customize the minimap and its features.', author: '', version: '' },
  { id: 'nameplate', name: 'Nameplate', description: 'Corrects rendering issues in the nameplate', author: '', version: '' },
  { id: 'packetflow', name: 'PacketFlow', description: 'Sends update requests to the server at a higher rate', author: '', version: '' },
  { id: 'screenshot', name: 'Screenshot', description: 'Allows users to save a current snapshot of the screen in different image formats.', author: '', version: '' },
  { id: 'thirdparty', name: 'Thirdparty', description: 'Enables third-party external applications to communicate with Ashita and the game client.', author: '', version: '' },
  { id: 'toon', name: 'toon', description: 'Adds a stylistic cell-shading visual effect to the game.', author: '', version: '' },
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
  enabled,
  setEnabled,
}: {
  title: string;
  items: ExtensionItem[];
  enabled: Record<string, boolean>;
  setEnabled: (id: string, value: boolean) => void;
}) {
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
        {(items || []).map((item) => (
          <div role="listitem" key={item.id}>
            <ExtCard
              item={item}
              enabled={enabled[item.id] ?? true}
              setEnabled={(v) => setEnabled(item.id, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ExtensionsPage() {
  const [addonsEnabled, setAddonsEnabled] = useState<Record<string, boolean>>({});
  const [pluginsEnabled, setPluginsEnabled] = useState<Record<string, boolean>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load extension states on mount
  useEffect(() => {
    const loadExtensions = async () => {
      try {
        if (!window.electron?.readExtensions) {
          setError('Electron preload API not available.');
          return;
        }
        const result = await window.electron.readExtensions();
        if (result.success && result.data) {
          if (result.data.addons) {
            setAddonsEnabled(result.data.addons);
          }
          if (result.data.plugins) {
            setPluginsEnabled(result.data.plugins);
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load extensions:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadExtensions();
  }, []);

  // Save extension states whenever they change (but only after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    const saveExtensions = async () => {
      try {
        if (!window.electron?.writeExtensions) {
          setError('Electron preload API not available.');
          return;
        }
        await window.electron.writeExtensions({
          addons: addonsEnabled,
          plugins: pluginsEnabled,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save extensions:', error);
      }
    };

    saveExtensions();
  }, [addonsEnabled, pluginsEnabled, isLoaded]);

  const updateAddonEnabled = (id: string, value: boolean) => {
    setAddonsEnabled((prev) => ({ ...prev, [id]: value }));
  };

  const updatePluginEnabled = (id: string, value: boolean) => {
    setPluginsEnabled((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <div className="extensions-page">
      <div className="ext-columns">
        <Column
          title="ADDONS"
          items={Addons}
          enabled={addonsEnabled}
          setEnabled={updateAddonEnabled}
        />
        <Column
          title="PLUGINS"
          items={Plugins}
          enabled={pluginsEnabled}
          setEnabled={updatePluginEnabled}
        />
      </div>
    </div>
  );
}
