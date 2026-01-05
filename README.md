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
    - [Major Features](#major-features)
    - [Technical Improvements](#technical-improvements)
    - [UI/UX Enhancements](#uiux-enhancements)
  - [📦 Prerequisites](#-prerequisites)
  - [🚀 Installation](#-installation)
  - [💻 Development](#-development)
    - [Starting the Development Environment](#starting-the-development-environment)
    - [Available Scripts](#available-scripts)
    - [VS Code Tasks](#vs-code-tasks)
  - [🏗️ Architecture](#️-architecture)
    - [Key Files](#key-files)
    - [IPC Endpoints](#ipc-endpoints)
    - [Startup Flow](#startup-flow)
  - [🔨 Building](#-building)
    - [Build for Production](#build-for-production)
    - [Platform-Specific Builds](#platform-specific-builds)
    - [Build Configuration](#build-configuration)
  - [🐛 Debugging](#-debugging)
    - [VS Code Launch Configs](#vs-code-launch-configs)
    - [DevTools](#devtools)
    - [Debug Mode](#debug-mode)
    - [Logging Locations](#logging-locations)
    - [Common Issues](#common-issues)
  - [📁 Project Structure](#-project-structure)
  - [📄 Configuration \& Data Storage](#-configuration--data-storage)
    - [Directory Layout](#directory-layout)
    - [`config.json`](#configjson)
    - [`storage.json` (Schema v2)](#storagejson-schema-v2)
    - [Security Notes](#security-notes)
  - [🧪 Testing](#-testing)
  - [🛠️ Technology Stack](#️-technology-stack)
    - [Core](#core)
    - [UI](#ui)
    - [Backend](#backend)
    - [Development](#development)
  - [📝 License](#-license)

## ✨ Features

- 🐧 **Cross-Platform Support** – Runs natively on Windows and Linux using wine.
- 🎮 **Secure Credential Management** – Uses `keytar` for OS keychain integration (no plaintext passwords on disk)
- 📦 **Game Bootstrap & Auto-Extraction** – Detects downloaded base game archive and extracts it automatically on first run
- ⬇️ **Resumable Downloads** – Pause, resume, and cancel game downloads with progress persistence across launcher restarts
- 🔄 **Incremental Patching** – Applies patches sequentially via `logic/patch.ts` with direct-to-game-root extraction and SHA256 verification
- 🌐 **Network + Manifest Layer** – Separate `core/net.ts`, `core/manifest.ts` for clean remote interactions with 5-minute TTL caching
- 🧪 **Storage Validation** – Schema v2 `storage.json` with automatic migration, validation, and safe defaults
- 🔐 **Security Layer** – URL allowlist validation for external links, input sanitization, and secure IPC preload bridge
- 🧩 **Addon & Plugin Management** – 63+ Ashita addons and 10 plugins with metadata, auto-generates `scripts/default.txt`
- 🎮 **DirectPlay Integration** – Automatic detection and prompt to enable DirectPlay on Windows (required for FFXI)
- 🕹️ **Gamepad Configuration** – Reads FFXI gamepad settings from Windows registry and applies them to INI
- ⚙️ **INI Settings Mapping** – Bidirectional sync between Settings UI and `Eventide.ini` game configuration
- 🎨 **Pivot Overlay Support** – Integration with Pivot overlays including overlay order management
- 📁 **Custom Install Directory** – Flexible installation paths supporting legacy launcher migrations and any folder structure
- 🧬 **Integrity & Hash Utilities** – SHA256 verification for all downloaded artifacts
- 🪣 **Remote Asset Distribution** – S3/R2-backed release and patch hosting (AWS SDK + native HTTPS)
- 📁 **Centralized Paths API** – IPC exposes launcher path map (`eventide:get-paths`) for renderer consumption
- 🧰 **Directory Self-Heal** – Ensures required folders (Downloads/Game/logs) on startup with write permission handling
- 🔄 **Auto-Updates** – Built-in launcher self-update via electron-updater with GitHub releases
- 🧪 **Testing Harness** – Jest + React Testing Library with comprehensive test coverage
- ⚡ **Hot Reload Dev Flow** – Concurrent main + renderer watch with electronmon for fast iteration
- 🖼️ **Modern UI** – React 19 + Tailwind CSS with dark mode support, Lucide & Simple Icons iconography
- 📰 **Patch Notes Feed** – In-app display of server patch notes fetched from remote API

## 🆕 Recent Changes

Date: 2026-01-05

### Major Features
- **Resumable Downloads** – Full pause/resume/cancel support for base game downloads with progress persistence
- **DirectPlay Auto-Detection** – Prompts Windows users to enable DirectPlay via DISM if not installed
- **Gamepad Configuration** – Reads controller settings from Windows registry and applies to game INI
- **Security Hardening** – URL allowlist for external links (eventide-xi.com, discord.gg, github.com, ashitaxi.com)
- **Storage Schema v2** – Migrated from `GAME_UPDATER` to cleaner `gameState` structure with automatic migration
- **Custom Install Directories** – Full support for custom game paths with legacy launcher migration support
- **Pivot Overlay Integration** – Manage Pivot overlay order through the Settings UI
- **Download Speed & ETA** – Real-time download speed calculation with exponential smoothing and time remaining estimates

### Technical Improvements
- **React 19 Context API** – `GameStateContext` for centralized game state management across components
- **INI Bidirectional Mapping** – Settings page reads/writes directly to `Eventide.ini` with type-safe transforms
- **Atomic File Writes** – JSON writes use temp files with rename for crash safety
- **Write Lock Protection** – Prevents concurrent storage writes (especially important for Wine compatibility)
- **Manifest Caching** – 5-minute TTL cache with stale-cache fallback on network errors
- **Progress Throttling** – Download/patch progress saves throttled to reduce disk writes
- **Preload Security** – Strict allowlist for IPC invoke/send/listen channels
- **Structured Logging** – Color-coded console output with chalk + electron-log file persistence

### UI/UX Enhancements
- **Dark Mode** – Toggle between light and dark themes
- **Version Display** – Shows both launcher and game versions in the UI
- **Toast Notifications** – In-app notifications for updates, errors, and status changes
- **Cancel Dialog** – Confirmation dialog before canceling active downloads
- **Extension Cards** – Rich addon/plugin cards with author, version, and description metadata
- **Settings Categories** – Organized settings with FFXI, Pivot, and Troubleshooting tabs

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (v7 or higher, comes with Node.js)
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

3. **Start development**

```bash
npm start
```

## 💻 Development

### Starting the Development Environment

Dual-process architecture (Main + Renderer):

```bash
npm start
```

This performs:
1. Port availability check (default: 1212)
2. Builds main process with webpack
3. Serves renderer via `webpack-dev-server` at `http://localhost:1212`
4. Launches Electron with electronmon for hot reload

### Available Scripts

```bash
# Start development (main builds once, renderer served with HMR)
npm start

# Start only renderer dev server
npm run start:renderer

# Start main process in watch mode
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

# Rebuild native modules
npm run rebuild
```

### VS Code Tasks

The project includes VS Code tasks for convenience:
- **Start Renderer Dev Server** – Runs `npm run start:renderer`
- **Start Electron** – Runs main with debug, depends on renderer
- **TypeScript Check** – Runs `npx tsc --noEmit` for type checking

## 🏗️ Architecture

Layered separation for maintainability:

| Layer    | Location       | Responsibility                                                                                     |
| -------- | -------------- | -------------------------------------------------------------------------------------------------- |
| Core     | `src/core`     | Pure utilities: storage, fs, hashing, manifests, versions, network, errors, constants              |
| Logic    | `src/logic`    | Domain workflows: bootstrap sequence, download orchestration, patch application, state transitions |
| Main     | `src/main`     | Electron lifecycle, IPC handlers, paths, security, DirectPlay, gamepad, INI mapping                |
| Renderer | `src/renderer` | React UI, pages (Home/Extensions/Settings), contexts, components                                   |

### Key Files

| File                                         | Purpose                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `src/main/main.ts`                           | App entry, IPC handlers (~4000 lines), window management, auto-updater |
| `src/main/preload.ts`                        | Secure IPC bridge with channel allowlists                              |
| `src/main/paths.ts`                          | Path resolution with custom install directory support                  |
| `src/main/security.ts`                       | URL validation and input sanitization                                  |
| `src/main/directplay.ts`                     | Windows DirectPlay detection and installation                          |
| `src/main/gamepad.ts`                        | Registry-based gamepad config reading                                  |
| `src/main/config/iniMappings.ts`             | Bidirectional INI ↔ Settings transforms                                |
| `src/core/storage.ts`                        | Schema v2 storage with migration support                               |
| `src/core/net.ts`                            | Resumable downloads with AbortController                               |
| `src/logic/download.ts`                      | Download orchestration with pause/resume                               |
| `src/logic/patch.ts`                         | Patch application with version recovery                                |
| `src/renderer/contexts/GameStateContext.tsx` | React context for game state management                                |

### IPC Endpoints

| Channel                          | Purpose                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `launcher:bootstrap`             | Initial state (release, patchManifest, clientVersion, flags) |
| `launcher:downloadGame`          | Start/resume base game download                              |
| `launcher:applyPatches`          | Apply pending patches                                        |
| `launcher:launchGame`            | Launch FFXI with credentials                                 |
| `game:pause-download`            | Pause active download                                        |
| `game:resume-download`           | Resume paused download                                       |
| `game:cancel-download`           | Cancel and cleanup download                                  |
| `game:check-resumable`           | Check for resumable download                                 |
| `eventide:get-paths`             | Get launcher paths                                           |
| `read-config` / `write-settings` | Config access with keytar                                    |
| `write-default-script`           | Generate Ashita load script                                  |
| `read-ini-settings`              | Read game configuration                                      |
| `pivot:list-overlays`            | List Pivot overlay folders                                   |

### Startup Flow

1. Electron `ready` → `ensureDirs()` creates required folders
2. `storage.json` read → schema validated → migrated if v1
3. Custom install paths synced from storage
4. DirectPlay check on Windows
5. Main window created with preload
6. Renderer calls `launcher:bootstrap` → gets unified state
7. Game state determined (missing/needs-extraction/update-available/ready)

## 🔨 Building

### Build for Production

```bash
npm run package
```

Output: `release/build/` directory

### Platform-Specific Builds

```bash
# Windows (NSIS installer)
npm run publish:win

# The package.json also supports:
# npm run package:win
# npm run package:mac
# npm run package:linux
```

### Build Configuration

electron-builder configuration in `package.json`:

```json
{
  "build": {
    "productName": "EventideXI",
    "appId": "com.eventide.ffxi.launcher",
    "win": {
      "target": ["nsis"],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": true,
      "createDesktopShortcut": "always",
      "deleteAppDataOnUninstall": false
    }
  }
}
```

## 🐛 Debugging

### VS Code Launch Configs

1. **Debug Main Process** – Set breakpoints in `src/main/`, press F5
2. **Debug Renderer** – Use Chrome DevTools or VS Code debugger

### DevTools

- Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- Auto-opens in development mode

### Debug Mode

```bash
npm run start:main:debug
```

Attach debugger to `localhost:5858`

### Logging Locations

| Platform | Path                                                      |
| -------- | --------------------------------------------------------- |
| Windows  | `%USERPROFILE%\AppData\Roaming\Eventide Launcherv2\logs\` |
| macOS    | `~/Library/Logs/Eventide Launcherv2/`                     |
| Linux    | `~/.config/Eventide Launcherv2/logs/`                     |

### Common Issues

**Port 1212 in use:**
```powershell
# Windows
netstat -ano | findstr :1212
taskkill /PID <PID> /F
```

**Native module errors:**
```bash
npm run rebuild
```

**Clear cache:**
```bash
rm -rf node_modules .erb/dll
npm install
```

## 📁 Project Structure

```
Eventide-FFXI-Launcher-Demo/
├── assets/                    # Static assets (icons, fonts, installer resources)
│   ├── icons/                 # App icons for all platforms
│   ├── fonts/                 # Custom fonts
│   ├── entitlements.mac.plist # macOS code signing
│   └── installer.nsh          # NSIS installer script
├── src/
│   ├── core/                  # Pure utilities (no Electron/React)
│   │   ├── constants.ts       # URLs, filenames
│   │   ├── errors.ts          # Error types
│   │   ├── fs.ts              # File operations, ZIP extraction
│   │   ├── hash.ts            # SHA256 verification
│   │   ├── manifest.ts        # Release/patch manifest types & fetching
│   │   ├── net.ts             # Network utilities, resumable downloads
│   │   ├── storage.ts         # storage.json schema v2, migration
│   │   ├── versions.ts        # Version comparison utilities
│   │   └── __tests__/         # Core module tests
│   ├── logic/                 # Domain workflows
│   │   ├── bootstrap.ts       # Startup orchestration
│   │   ├── download.ts        # Resumable game download
│   │   ├── patch.ts           # Patch application
│   │   ├── state.ts           # State transitions
│   │   └── __tests__/         # Logic tests
│   ├── main/                  # Electron main process
│   │   ├── main.ts            # Entry point, IPC handlers
│   │   ├── preload.ts         # Secure IPC bridge
│   │   ├── paths.ts           # Path management
│   │   ├── config.ts          # Environment config
│   │   ├── security.ts        # URL validation, sanitization
│   │   ├── directplay.ts      # Windows DirectPlay utility
│   │   ├── gamepad.ts         # Controller config from registry
│   │   ├── logger.ts          # electron-log setup
│   │   ├── menu.ts            # Application menu
│   │   ├── util.ts            # HTML resolution
│   │   ├── defaultExtensions.ts # 63 addons + 10 plugins definitions
│   │   ├── globals.ts         # Global state
│   │   ├── config/
│   │   │   └── iniMappings.ts # Settings ↔ INI transforms
│   │   └── utils/
│   │       └── io.ts          # I/O utilities
│   ├── renderer/              # React UI
│   │   ├── index.tsx          # Entry point
│   │   ├── App.tsx            # Root component, routing
│   │   ├── App.css            # Global styles
│   │   ├── styles.css         # Tailwind imports
│   │   ├── logger.ts          # Renderer logging
│   │   ├── pages/
│   │   │   ├── HomePage.tsx   # Main page with download/launch
│   │   │   ├── ExtensionsPage.tsx # Addon/plugin management
│   │   │   └── SettingsPage.tsx   # Game and launcher settings
│   │   ├── components/
│   │   │   └── Select.tsx     # Custom select component
│   │   ├── contexts/
│   │   │   └── GameStateContext.tsx # Game state management
│   │   ├── data/
│   │   │   └── feed.ts        # Patch notes fetching
│   │   ├── types/
│   │   │   └── feed.ts        # Feed type definitions
│   │   ├── utils/
│   │   │   ├── format.ts      # Formatting utilities
│   │   │   ├── index.ts       # Utility exports
│   │   │   └── ipc.ts         # Safe IPC wrappers
│   │   └── __tests__/         # Component tests
│   ├── types/                 # Shared type definitions
│   │   ├── electron-log.d.ts
│   │   └── ini.d.ts
│   ├── ui/                    # Shared UI components
│   │   ├── button.tsx
│   │   └── main.tsx
│   └── __tests__/             # Integration tests
│       ├── App.test.tsx
│       ├── ipcHandlers.test.ts
│       ├── manifestValidation.test.ts
│       └── setup.ts
├── __mocks__/                 # Jest mocks
│   └── electron-log.js
├── release/                   # Build output
│   ├── app/package.json       # Production dependencies
│   └── build/                 # Packaged executables
├── .erb/                      # Electron React Boilerplate configs
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── tailwind.config.js         # Tailwind CSS configuration
├── postcss.config.js          # PostCSS configuration
├── jest.config.custom.js      # Jest configuration
└── LICENSE                    # GPL-3.0-or-later
```

## 📄 Configuration & Data Storage

All runtime state lives in Electron's `userData` directory:

| Platform | Path                                                 |
| -------- | ---------------------------------------------------- |
| Windows  | `%APPDATA%\Eventide Launcherv2\`                     |
| macOS    | `~/Library/Application Support/Eventide Launcherv2/` |
| Linux    | `~/.config/Eventide Launcherv2/`                     |

### Directory Layout

```
<userData>/
├── Eventide/
│   ├── Game/                  # Extracted FFXI client
│   └── Downloads/             # Downloaded archives
├── logs/                      # Application logs
├── config.json                # User settings + extensions
└── storage.json               # Game state + paths
```

### `config.json`

```json
{
  "username": "",
  "password": "",
  "rememberCredentials": false,
  "launcherVersion": "0.6.8",
  "installDir": "",
  "addons": {
    "aspect": {
      "description": "Forces the games aspect ratio...",
      "author": "atom0s",
      "version": "1.0",
      "link": "https://ashitaxi.com",
      "enabled": true
    }
    // ... 62 more addons
  },
  "plugins": {
    "Addons": {
      "description": "Enables use of addons.",
      "enabled": true
    }
    // ... 9 more plugins
  }
}
```

### `storage.json` (Schema v2)

```json
{
  "schemaVersion": 2,
  "paths": {
    "installPath": "C:\\...\\Game",
    "downloadPath": "C:\\...\\Downloads",
    "customInstallDir": "D:\\Games\\Eventide"
  },
  "gameState": {
    "installedVersion": "1.0.0",
    "availableVersion": "1.1.0",
    "baseGame": {
      "isDownloaded": true,
      "isExtracted": true
    },
    "patches": {
      "downloadedVersion": "1.0.0",
      "appliedVersion": "1.0.0"
    },
    "downloadProgress": {
      "url": "...",
      "destPath": "...",
      "bytesDownloaded": 1234567890,
      "totalBytes": 2000000000,
      "sha256": "...",
      "isPaused": true,
      "startedAt": 1704067200000,
      "lastUpdatedAt": 1704067500000
    }
  }
}
```

### Security Notes

- **Credentials** – Stored in OS keychain via `keytar`, never in JSON
- **External URLs** – Allowlisted domains only (eventide-xi.com, discord.gg, github.com, ashitaxi.com)
- **IPC Security** – Strict channel allowlists in preload, no direct Node access in renderer
- **File Writes** – Atomic writes with temp files, write lock protection
- **Input Sanitization** – Control characters stripped from user input

## 🧪 Testing

```bash
# Run all tests
npm test

# Tests are located in:
# - src/__tests__/           (integration)
# - src/core/__tests__/      (core modules)
# - src/logic/__tests__/     (workflows)
# - src/renderer/__tests__/  (components)
```

Test stack: Jest 29 + React Testing Library + JSDOM

## 🛠️ Technology Stack

### Core
| Package    | Version | Purpose         |
| ---------- | ------- | --------------- |
| Electron   | 35.x    | Desktop runtime |
| React      | 19.x    | UI framework    |
| TypeScript | 5.8     | Type safety     |
| Webpack    | 5.x     | Bundling        |

### UI
| Package          | Version | Purpose                 |
| ---------------- | ------- | ----------------------- |
| Tailwind CSS     | 4.x     | Utility-first styling   |
| React Router DOM | 7.3     | Client-side routing     |
| Lucide React     | 0.548   | Icons                   |
| Simple Icons     | 15.18   | Brand icons             |
| React Select     | 5.10    | Custom select dropdowns |

### Backend
| Package            | Version | Purpose                |
| ------------------ | ------- | ---------------------- |
| electron-updater   | 6.6     | Auto-updates           |
| electron-log       | 5.4     | Logging                |
| keytar             | 7.9     | OS keychain            |
| axios              | 1.13    | HTTP client            |
| @aws-sdk/client-s3 | 3.x     | S3/R2 access           |
| extract-zip        | 2.0     | ZIP extraction         |
| unzipper           | 0.12    | Streaming unzip        |
| ini                | 6.0     | INI parsing            |
| ajv                | 8.17    | JSON schema validation |
| check-disk-space   | 3.4     | Disk space checking    |

### Development
| Package                | Version | Purpose           |
| ---------------------- | ------- | ----------------- |
| Jest                   | 29.x    | Testing           |
| @testing-library/react | 16.x    | Component testing |
| ESLint                 | 8.x     | Linting           |
| Prettier               | 3.5     | Formatting        |
| electron-builder       | 25.x    | Packaging         |
| electronmon            | 2.x     | Hot reload        |
| chalk                  | 4.x     | Colored logging   |

## 📝 License

GPL-3.0-or-later. See [LICENSE](LICENSE).

---

<div align="center">
  <img src="assets/slime2.png" alt="Eventide Slime" width="80" />
  <p><strong>Made with ❤️ for the Eventide FFXI community</strong></p>
  <p>
    <a href="https://eventide-xi.com/">Website</a> •
    <a href="https://discord.gg/vT4UQU8z">Discord</a> •
    <a href="https://github.com/bananapretzel/Eventide-XI-Launcher">GitHub</a>
  </p>
</div>
