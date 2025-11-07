<div align="center">
  <img src="assets/eventide-logo.png" alt="Eventide Logo" width="400" />
  
  # Eventide FFXI Launcher
  
  <p>A modern, feature-rich launcher for Final Fantasy XI built with Electron, React, and TypeScript</p>
  
  <img src="assets/slime2.png" alt="Eventide Slime" width="150" />
</div>

<br>

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Development](#-development)
- [Building](#-building)
- [Debugging](#-debugging)
- [Project Structure](#-project-structure)
- [Configuration Files](#-configuration-files)
- [License](#-license)

## ✨ Features

- 🎮 **Account Management** - Secure credential storage with AES-256 encryption
- 🔌 **Extension System** - Manage Ashita addons and plugins
- ⚙️ **Settings Management** - Comprehensive FFXI and Ashita configuration
- 📰 **News Feed** - Stay updated with the latest server news
- 🎨 **Modern UI** - Clean, responsive interface with Tailwind CSS
- 🔒 **Secure** - Password encryption with salt and IV
- 💾 **Persistent Config** - Automatic save/load of user preferences

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

### Starting the Development Server

The launcher uses a dual-process architecture (Main + Renderer). To start development:

```bash
npm start
```

This command will:
1. Start the Renderer process (React app) on `http://localhost:1212`
2. Start the Main process (Electron)
3. Open the application with hot-reload enabled

### Development Scripts

```bash
# Start development with hot-reload
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Type check TypeScript
npm run tsc

# Format code with Prettier
npm run prettier
```

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
- **Production**: Logs are written to:
  - Windows: `%USERPROFILE%\AppData\Roaming\eventide-launcher\logs`
  - macOS: `~/Library/Logs/eventide-launcher`
  - Linux: `~/.config/eventide-launcher/logs`

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
├── assets/                 # Static assets (images, icons)
│   ├── eventide-logo.png
│   ├── slime2.png
│   └── icons/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Application entry point
│   │   ├── menu.ts        # Application menu
│   │   ├── preload.ts     # Preload script (IPC bridge)
│   │   └── util.ts        # Utility functions
│   ├── renderer/          # React renderer process
│   │   ├── App.tsx        # Main React component
│   │   ├── App.css        # Global styles
│   │   ├── index.tsx      # Renderer entry point
│   │   ├── pages/         # Page components
│   │   │   ├── HomePage.tsx
│   │   │   ├── ExtensionsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── data/          # Static data
│   │   │   └── feed.ts
│   │   └── types/         # TypeScript types
│   └── types/             # Shared type definitions
├── release/               # Built application output
├── config.json            # User configuration (credentials, version)
├── settings.json          # FFXI/Ashita settings
├── extensions.json        # Addon/plugin states
├── Eventide.ini           # Ashita configuration
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── README.md             # This file
```

## 📄 Configuration Files

### `config.json`
Stores user credentials and launcher version:
```json
{
  "username": "encrypted_username",
  "password": "encrypted_password_with_iv",
  "rememberCredentials": true,
  "launcherVersion": "1.0.0"
}
```
- Passwords are encrypted using AES-256-CBC
- Each encryption uses a unique IV for security

### `settings.json`
Stores FFXI and Ashita settings configured in the Settings page:
```json
{
  "ffxi": {
    "windowMode": "borderless",
    "windowWidth": 1920,
    "windowHeight": 1080,
    ...
  },
  "ashita": {
    "fps": "60",
    ...
  }
}
```

### `extensions.json`
Tracks enabled/disabled state of addons and plugins:
```json
{
  "addons": {
    "fps": true,
    "fps": true
  },
  "plugins": {
    "sdk": true
  }
}
```

### `Eventide.ini`
Ashita bootstrap configuration file (INI format)

## 🛠️ Technology Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Webpack** - Module bundler
- **electron-builder** - Application packager
- **React Router** - Navigation
- **Lucide React** - Icon library

## 📝 License

MIT © Eventide FFXI

---

<div align="center">
  <img src="assets/slime2.png" alt="Eventide Slime" width="80" />
  <p><strong>Made with ❤️ for the Eventide FFXI community</strong></p>
</div>
