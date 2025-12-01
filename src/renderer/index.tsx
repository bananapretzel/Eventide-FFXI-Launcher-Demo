import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';
import log from './logger';
// Debug: Log window.electron to confirm preload script injection
log.debug('window.electron:', window.electron);

// Global error handlers to catch fatal errors
window.addEventListener('error', (event) => {
  log.error(
    '[Global Error Handler] Uncaught error:',
    event.error || event.message,
    event,
  );
});
window.addEventListener('unhandledrejection', (event) => {
  log.error(
    '[Global Error Handler] Unhandled promise rejection:',
    event.reason,
    event,
  );
});

// Base dimensions including margins
const BASE_WIDTH = 1148;
const BASE_HEIGHT = 673;

// Save zoom level to config
const saveZoomLevel = async (zoomLevel: number) => {
  try {
    if (window.electron?.writeConfig) {
      // Read existing config first to preserve other settings
      const existing = await window.electron.readConfig?.();
      const existingData = existing?.success ? existing.data : {};
      await window.electron.writeConfig({
        ...existingData,
        guiScale: zoomLevel,
      });
      log.debug(`[Zoom] Saved zoom level: ${zoomLevel}%`);
    }
  } catch (err) {
    log.warn('[Zoom] Failed to save zoom level:', err);
  }
};

const updateZoom = (newZoom: number, persist = true) => {
  document.body.style.zoom = `${newZoom}%`;

  // Resize window to match zoom level
  if (window.electron?.windowControls?.setSize) {
    const newWidth = Math.round(BASE_WIDTH * (newZoom / 100));
    const newHeight = Math.round(BASE_HEIGHT * (newZoom / 100));
    window.electron.windowControls.setSize(newWidth, newHeight);
  }
  log.debug(`[Zoom] Updated to ${newZoom}%`);

  // Save to config (debounced to avoid too many writes)
  if (persist) {
    saveZoomLevel(newZoom);
  }
};

// Load saved zoom level on startup
const loadSavedZoom = async () => {
  try {
    if (window.electron?.readConfig) {
      const result = await window.electron.readConfig();
      if (result?.success && result.data?.guiScale) {
        const savedZoom = Number(result.data.guiScale);
        if (savedZoom >= 50 && savedZoom <= 150) {
          log.debug(`[Zoom] Restoring saved zoom level: ${savedZoom}%`);
          updateZoom(savedZoom, false); // Don't persist on load
        }
      }
    }
  } catch (err) {
    log.warn('[Zoom] Failed to load saved zoom level:', err);
  }
};

// Load saved zoom after a short delay to ensure electron is ready
setTimeout(loadSavedZoom, 100);

// Add Ctrl + =/- and Ctrl + scroll zoom support
window.addEventListener('keydown', (event) => {
  // Check for Ctrl + = or Ctrl + + (zoom in / scale up)
  const isZoomIn = (event.key === '+' || event.key === '=') && event.ctrlKey;
  // Check for Ctrl + - (zoom out / scale down)
  const isZoomOut = event.key === '-' && event.ctrlKey;

  if (isZoomIn) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.min(zoomLevel + 10, 150); // Max 150%
    updateZoom(newZoom);
  } else if (isZoomOut) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.max(zoomLevel - 10, 50); // Min 50%
    updateZoom(newZoom);
  }
});

// Add Ctrl + mouse scroll zoom support
window.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) {
      event.preventDefault();
      const currentZoom = (document.body.style.zoom as any) || '100%';
      const zoomLevel = parseFloat(currentZoom);

      if (event.deltaY < 0) {
        // Scroll up = zoom in
        const newZoom = Math.min(zoomLevel + 5, 150); // Max 150%
        updateZoom(newZoom);
      } else if (event.deltaY > 0) {
        // Scroll down = zoom out
        const newZoom = Math.max(zoomLevel - 5, 50); // Min 50%
        updateZoom(newZoom);
      }
    }
  },
  { passive: false },
);

const container = document.getElementById('root');
if (!container) {
  log.error('Root container (#root) not found. Aborting React mount.');
} else {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// calling IPC exposed from preload script (use safe optional chaining)
const ipc = window.electron?.ipcRenderer;
if (ipc?.once) {
  ipc.once('ipc-example', (arg: unknown) => {
    log.debug(arg);
  });
}
if (ipc?.sendMessage) {
  ipc.sendMessage('ipc-example', ['ping']);
}
