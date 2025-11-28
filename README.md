<div align="center">
  <img src="assets/eventide-logo.png" alt="Eventide Logo" width="400" />
  
  # Eventide FFXI Launcher
  
  <p>A modern, layered, feature-rich launcher for Final Fantasy XI built with Electron, React, and TypeScript</p>
  
  <img src="assets/slime2.png" alt="Eventide Slime" width="150" />
</div>

<br>

## 📋 Table of Contents

- [Eventide FFXI Launcher](#eventide-ffxi-launcher)
  - [📋 Table of Contents](#-table-of-contents)
  - [✨ Features](#-features)
  - [🆕 Recent Changes](#-recent-changes)
  - [📦 Prerequisites](#-prerequisites)
  - [🚀 Installation](#-installation)
  - [💻 Development](#-development)
    - [Starting the Development Environment](#starting-the-development-environment)
    - [Common Scripts](#common-scripts)
  - [🏗️ Architecture](#️-architecture)
  - [🔨 Building](#-building)
    - [Build for Production](#build-for-production)
    - [Build for All Platforms](#build-for-all-platforms)
    - [Build Options](#build-options)
  - [🐛 Debugging](#-debugging)
    - [VS Code Debugging](#vs-code-debugging)
    - [Opening DevTools](#opening-devtools)
    - [Debugging Main Process](#debugging-main-process)
    - [Logging](#logging)
    - [Common Issues](#common-issues)
  - [📁 Project Structure](#-project-structure)
  - [📄 Configuration \& Data Storage](#-configuration--data-storage)
    - [`config.json`](#configjson)
    - [`storage.json`](#storagejson)
    - [Default Script Generation](#default-script-generation)
    - [Security Notes](#security-notes)
  - [🧪 Testing](#-testing)
  - [🛠️ Technology Stack](#️-technology-stack)
  - [📝 License](#-license)

## ✨ Features

- 🐧 **Cross-Platform Support** – Runs natively on Windows and Linux (macOS support planned)
- 🎮 **Secure Credential Management** – Uses `keytar` for OS keychain integration (no plaintext on disk)
- 📦 **Game Bootstrap & Auto-Extraction** – Detects downloaded base game archive and extracts it automatically on first run
- ⬇️ **Patch & Update System** – Remote release + patch manifest retrieval (`release.json` + patch manifest) with version comparison
- 🔄 **Incremental Patching** – Applies patches sequentially via `logic/patch.ts` ensuring integrity with direct-to-game-root extraction
- 🌐 **Network + Manifest Layer** – Separate `core/net.ts`, `core/manifest.ts` for clean remote interactions
- 🧪 **Storage Validation** – `core/storage.ts` schema validation and safe defaults (protects against corrupt `storage.json`)
- 🔐 **Config Isolation** – Per-user `config.json` stored under Electron `userData` (not in repository) – replaces earlier root-level config approach
- 🧩 **Addon & Plugin Auto-Script** – Generates `scripts/default.txt` dynamically from enabled 63 addons and 10 plugins
- 🧬 **Integrity & Hash Utilities** – `core/hash.ts` for verifying downloaded artifacts (SHA256 validation)
- 🪣 **Remote Asset Download** – S3 / R2 backed release and patch distribution (AWS SDK + axios)
- 📁 **Centralized Paths API** – IPC exposes launcher path map for renderer consumption (`eventide:get-paths`)
- 🧰 **Directory Self-Heal** – Ensures required folders (Downloads/Game/logs) on startup
- 🧪 **Testing Harness** – Jest + Testing Library for unit and renderer tests
- ⚡ **Hot Reload Dev Flow** – Concurrent main + renderer watch with fast iteration
- 🖼️ **Modern UI** – React 19 + Tailwind utility styling, Lucide icons
- 📝 **Manifest Caching** – Intelligent 5-minute TTL cache for release/patch manifests to reduce network calls

> Older sections about root-level `settings.json`, `extensions.json`, and `Eventide.ini` have been superseded by unified `config.json` + dynamic script generation.

## 🆕 Recent Changes

Date: 2025-11-27

- **Direct Patch Extraction** – Patches now extract directly to the game root folder for simplified file management
- **Manifest Caching** – Implemented 5-minute TTL cache for release and patch manifests to reduce redundant network calls
- **Config Migration** – Automatic migration from old `extensions.addons/plugins` arrays to new object-based structure
- **Patch Extraction Enhancement** – Smart ZIP extraction with automatic directory merging (prevents nested folder issues)
- Introduced layered architecture (`core`, `logic`) separating domain concerns from Electron main
- Added automatic base game extraction and version initialization logic
- Implemented remote release + patch manifest fetching with update notification logic
- Added dynamic default script generation for Ashita (63 addons + 10 plugins auto-load)
- Migrated config/storage handling to Electron `userData` directory (per user, cross-platform)
- Added storage self-sync with filesystem (downloaded/extracted flags) and zero-version normalization
- Introduced hash/integrity helpers and error abstraction modules with SHA256 verification
- Added IPC bootstrap endpoint returning release, patchManifest, clientVersion & game state flags
- Refined logging strategy with structured startup phases using electron-log + chalk
- Added AWS S3/R2 integration for remote assets (release JSON + patch manifest)
- Upgraded React to 19 and integrated updated dependency stack (Electron 35, TypeScript 5.8)
- Expanded test scaffolding under `src/__tests__` with setup environment and Jest configuration

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download here](https://git-scm.com/)

## 🚀 Installation

1. **Clone the repository**

```bash
git clone https://github.com/bananapretzel/Eventide-FFXI-Launcher-Demo.git
cd Eventide-FFXI-Launcher-Demo
```

2. **Install dependencies**

```bash
npm install
```

3. **Verify installation**

```bash
npm run check
```

## 💻 Development

### Starting the Development Environment

Dual-process architecture (Main + Renderer):

```bash
npm start
```

This performs:
1. Port availability check
2. Builds/starts main process in watch mode
3. Serves renderer (`webpack-dev-server`) at `http://localhost:1212`
4. Launches Electron with preload + hot module refresh

### Common Scripts

```bash
# Start dev (main builds once, renderer served)
npm start

# Manually start only renderer (if main already running)
npm run start:renderer

# Manually start main (debug / watch)
npm run start:main

# Full production build (main + renderer)
npm run build

# Package app for current platform
npm run package

# Lint sources
npm run lint
npm run lint:fix

# Run tests
npm test

# Rebuild native modules for packaged app
npm run rebuild
```

> Note: Former scripts like `tsc`, `prettier`, and custom coverage commands are not currently defined. Use IDE/type checking and add new scripts as needed.

## 🏗️ Architecture

Layered separation for maintainability:

| Layer    | Location       | Responsibility                                                                                     |
| -------- | -------------- | -------------------------------------------------------------------------------------------------- |
| Core     | `src/core`     | Generic utilities: storage, fs, hashing, manifests, versions, network, errors                      |
| Logic    | `src/logic`    | Domain workflows: bootstrap sequence, download orchestration, patch application, state transitions |
| Main     | `src/main`     | Electron lifecycle, IPC handlers, path normalization, secure config access, directory management   |
| Renderer | `src/renderer` | React UI, user interaction, status display, initiation of bootstrap via IPC                        |

Startup Flow Overview:
1. Electron `ready` → directories ensured (`ensureDirs`)
2. `storage.json` read/validated → defaults applied if missing
3. Paths synced (download/install) → game state flags updated
4. Auto-extraction if base archive present & not extracted
5. Remote release / patch manifest fetched → version comparison
6. Renderer `launcher:bootstrap` IPC returns unified state snapshot

IPC Endpoints (selected):
- `launcher:bootstrap` – Initial state (release, patchManifest, clientVersion, base game flags)
- `eventide:get-paths` – UserData + resource path map
- `read-config` / `write-settings` – Secure config access (with keytar credential retrieval)
- `write-default-script` – Generates `scripts/default.txt` from enabled addons/plugins

Game Updating:
- Download orchestrated via `logic/download.ts` (to `Downloads/`)
- Patch application via `logic/patch.ts` with manifest guidance
- Patches extract directly to the game root folder
- Smart ZIP extraction with automatic directory merging (avoids nested folders)
- Integrity & version tracking stored in `storage.json` with SHA256 verification
- Manifest caching (5-minute TTL) reduces redundant network requests

## 🔨 Building

### Build for Production

To create a production build for your current platform:

```bash
npm run package
```

The built application will be located in the `release/build` directory.

### Build for All Platforms

```bash
# Build for Windows
npm run package:win

# Build for macOS
npm run package:mac

# Build for Linux
npm run package:linux

# Build for all platforms
npm run package:all
```

### Linux-Specific Build Notes

The launcher supports Linux and creates three package formats:
- **AppImage** - Universal Linux package that runs on most distributions
- **deb** - Debian/Ubuntu package format
- **tar.gz** - Portable archive

**Building on Linux:**
```bash
npm run package:linux
```

**Running FFXI on Linux:**
The launcher itself runs natively on Linux, but Final Fantasy XI requires Windows compatibility:
- **Wine/Proton**: Use Wine 8.0+ or Proton for running the Windows game client
- **Launch Script**: The launcher creates `Launch_Eventide.sh` which should be configured to launch the game through Wine
  - See `Launch_Eventide.sh.example` in the project root for a template
  - See `LINUX_SETUP.md` for detailed Linux installation and configuration guide
- **Default Paths**: Game files install to `~/.config/Eventide Launcherv2/Eventide/Game/`

**Linux Installation:**
```bash
# AppImage (recommended)
chmod +x Eventide-FFXI-Launcher-*.AppImage
./Eventide-FFXI-Launcher-*.AppImage

# Debian/Ubuntu
sudo dpkg -i eventide-ffxi-launcher_*.deb
sudo apt-get install -f  # Install dependencies if needed

# Portable tar.gz
tar -xzf eventide-ffxi-launcher-*.tar.gz
cd eventide-ffxi-launcher/
./eventide-ffxi-launcher
```

### Build Options

The launcher uses `electron-builder` for packaging. Configuration is in `package.json` under the `build` section.

## 🐛 Debugging

### VS Code Debugging

The project includes VS Code launch configurations for debugging:

1. **Debug Main Process**
   - Set breakpoints in `src/main/main.ts`
   - Press `F5` or use the "Electron: Main" debug configuration
   - Inspect IPC handlers, file operations, and window management

2. **Debug Renderer Process**
   - Set breakpoints in React components (`src/renderer/`)
   - Use Chrome DevTools (automatically opens)
   - Or use "Electron: Renderer" debug configuration in VS Code

### Opening DevTools

DevTools automatically open in development mode. To toggle:

- Press `Ctrl+Shift+I` (Windows/Linux)
- Press `Cmd+Option+I` (macOS)

### Debugging Main Process

```bash
# Start with inspect flag
npm run start:main:debug
```

Then attach your debugger to `localhost:5858`

### Logging

The application uses `electron-log` for logging:

- **Development**: Logs appear in the console
- **Production**: Logs are written to platform-specific locations:
  - Windows: `%USERPROFILE%\AppData\Roaming\Eventide Launcherv2\logs\`
  - macOS: `~/Library/Logs/Eventide Launcherv2/`
  - Linux: `~/.config/Eventide Launcherv2/logs/`

### Common Issues

**Port already in use:**
```bash
# Kill process on port 1212 (Windows)
netstat -ano | findstr :1212
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:1212 | xargs kill -9
```

**Build failures:**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm cache clean --force
npm install
```

## 📁 Project Structure

```
Eventide-FFXI-Launcher-Demo/
├── assets/                    # Static assets bundled (icons, branding, entitlements)
│   ├── eventide-logo.png
│   ├── slime2.png
│   └── icons/
├── Eventide-test/             # Local test game assets + sample client tree (used in dev mode)
├── src/
│   ├── core/                  # Pure logic + utilities (no Electron/React):
│   │   ├── fs.ts              # JSON read/write, zip extraction helper entry
│   │   ├── storage.ts         # storage.json schema + validation + defaults
│   │   ├── manifest.ts        # Remote release + patch manifest fetching
│   │   ├── versions.ts        # Version helpers (normalization/comparison)
│   │   ├── net.ts             # Network fetch utilities (axios abstraction)
│   │   ├── hash.ts            # Hash / integrity helpers
│   │   ├── errors.ts          # Error types / classification
│   │   └── __tests__/         # Unit tests for core modules
│   ├── logic/                 # Domain workflows composed from core utilities:
│   │   ├── bootstrap.ts       # Startup orchestration (release, manifest, version state)
│   │   ├── download.ts        # Game + patch download pipeline
│   │   ├── patch.ts           # Patch application sequence
│   │   ├── state.ts           # Shared state helpers / transitions
│   │   └── __tests__/         # Workflow tests
│   ├── main/                  # Electron main process layer:
│   │   ├── main.ts            # App entry, startup lifecycle, IPC registration
│   │   ├── paths.ts           # Central path resolution + directory ensure
│   │   ├── config.ts          # Environment constants, resource/exec path helpers
│   │   ├── preload.ts         # Preload script (secure IPC bridge)
│   │   ├── menu.ts            # Application menu setup
│   │   ├── util.ts            # HTML resolution helpers
│   │   └── utils/             # (Additional main utilities)
│   ├── renderer/              # React UI layer (runs in BrowserWindow):
│   │   ├── index.tsx          # Renderer entry point
│   │   ├── App.tsx            # Root component
│   │   ├── App.css / styles.css
│   │   ├── pages/             # UI pages (Home, Extensions, Settings, etc.)
│   │   ├── data/              # Static feed / sample data
│   │   ├── types/             # Renderer-only TS types
│   │   └── __tests__/         # Component tests
│   └── types/                 # Shared cross-layer type definitions
├── release/                   # Packaged application output (electron-builder)
├── scripts/                   # Generated or helper scripts (e.g., default.txt target)
├── tailwind.config.js         # Tailwind configuration
├── tsconfig.json              # TypeScript project config
├── postcss.config.js          # PostCSS (Tailwind pipeline)
├── jest.config.custom.js      # Jest configuration override
├── package.json               # Dependencies, build & runtime scripts
├── LICENSE                    # Project license
└── README.md                  # Project documentation (this file)
```

Notes:
- Runtime files (`config.json`, `storage.json`, logs, extracted Game client) live under Electron `userData` and are intentionally NOT tracked here.
- `Eventide-test/` simulates / contains base game assets for development convenience.
- `scripts/default.txt` is generated dynamically via IPC (`write-default-script`).

## 📄 Configuration & Data Storage

All runtime state lives inside Electron's `userData` directory (platform-specific):

```
<userData>/Eventide/
  Game/          # Extracted FFXI client
  Downloads/     # Archived zips (base + patches)
logs/            # Launcher logs
config.json      # User + addon/plugin config, launcherVersion, credentials flags
storage.json     # Update & patch state, paths, versions
```

### `config.json`
Structure (abridged):
```json
{
  "username": "",           // Retrieved via keytar if rememberCredentials true
  "password": "",           // Retrieved via keytar if rememberCredentials true
  "rememberCredentials": false,
  "launcherVersion": "<current>",
  "installDir": "",
  "addons": { 
    "aspect": { 
      "description": "Forces the games aspect ratio to match the windows resolution.",
      "author": "atom0s",
      "version": "1.0",
      "link": "https://ashitaxi.com",
      "enabled": false 
    },
    // ... 62 more addons with metadata
  },
  "plugins": { 
    "Addons": { 
      "description": "Enabled use of addons.",
      "enabled": true 
    },
    // ... 9 more plugins with metadata
  }
}
```
**Note:** On first run, `config.json` is automatically populated with 63 addons and 10 plugins, each with their metadata (description, author, version, link, enabled status). This provides a complete Ashita addon/plugin management system out of the box. The config automatically migrates from legacy array-based structure to the current object-based format if needed.

### `storage.json`
Tracks game & patch state:
```json
{
  "paths": { "installPath": "...", "downloadPath": "..." },
  "GAME_UPDATER": {
    "baseGame": { "downloaded": true, "extracted": true },
    "currentVersion": "1.0.0",
    "latestVersion": "1.1.0",
    "updater": { "downloaded": "0", "extracted": "0" }
  }
}
```

### Default Script Generation
`write-default-script` builds `scripts/default.txt` with auto-load commands based on enabled addons/plugins.

### Patch Extraction
Patches are extracted directly to the game root folder:
- Patch files download to `Downloads/` directory
- ZIP files extract directly to the game installation folder
- Smart extraction with automatic directory merging prevents nested folder issues
- Files are verified post-extraction with SHA256 checksums
- Version tracking ensures patches apply in correct order

### Security Notes
- Credentials stored via OS keychain (`keytar`) – not in JSON files
- Config and storage files validated & size-limited before writing
- Directories auto-created with recursive safety checks

## 🧪 Testing

Jest configuration includes JSDOM, React Testing Library setup and custom build existence check.

```bash
npm test          # Run all tests
```

Add new tests under `src/__tests__/` or module-specific `__tests__` directories.

## 🛠️ Technology Stack

- **Electron 35** – Desktop runtime with native module support
- **React 19 / React DOM 19** – Modern concurrent-capable UI with hooks
- **TypeScript 5.8** – Type-safe development with strict mode
- **Tailwind CSS 3** – Utility-first styling with custom theme
- **Webpack 5** – Bundling (separate configs for main/preload/renderer)
- **electron-builder** – Cross-platform packaging (Windows/macOS/Linux)
- **electron-updater 6.6** – Auto-update integration (release & patch coordination)
- **electron-log 5.4** – Structured logging with chalk for colored output
- **Axios 1.13 / AWS SDK S3 v3** – Remote asset + manifest retrieval from S3/R2
- **Ini 6.0 / fs-extra / extract-zip 2.0** – File system, INI parsing, archive extraction
- **Keytar** – Secure OS keychain credential storage (macOS Keychain, Windows Credential Vault, Linux Secret Service)
- **Jest 29 + Testing Library** – Automated testing with JSDOM environment
- **React Router DOM 7.3** – Client-side routing for multi-page navigation
- **Lucide React 0.548 / simple-icons 15.18** – Modern iconography
- **AJV 8.17** – JSON schema validation for manifests and storage

## 📝 License

MIT © Eventide FFXI

---

<div align="center">
  <img src="assets/slime2.png" alt="Eventide Slime" width="80" />
  <p><strong>Made with ❤️ for the Eventide FFXI community</strong></p>
</div>
