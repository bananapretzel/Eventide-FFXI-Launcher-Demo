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

// Add Ctrl + =/- and Ctrl + scroll zoom support for low resolution displays (e.g., 720p)
// Zoom can only go down from 100%, not above
window.addEventListener('keydown', (event) => {
  // Check for Ctrl + = or Ctrl + + (zoom in / scale up)
  const isZoomIn = (event.key === '+' || event.key === '=') && event.ctrlKey;
  // Check for Ctrl + - (zoom out / scale down)
  const isZoomOut = event.key === '-' && event.ctrlKey;

  if (isZoomIn) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.min(zoomLevel + 10, 100); // Max 100%
    document.body.style.zoom = `${newZoom}%`;
    log.debug(`[Zoom] Increased to ${newZoom}%`);
  } else if (isZoomOut) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.max(zoomLevel - 10, 50); // Min 50%
    document.body.style.zoom = `${newZoom}%`;
    log.debug(`[Zoom] Decreased to ${newZoom}%`);
  }
});

// Add Ctrl + mouse scroll zoom support
window.addEventListener('wheel', (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);

    if (event.deltaY < 0) {
      // Scroll up = zoom in (scale up towards 100%)
      const newZoom = Math.min(zoomLevel + 5, 100); // Max 100%
      document.body.style.zoom = `${newZoom}%`;
      log.debug(`[Zoom] Scroll increased to ${newZoom}%`);
    } else if (event.deltaY > 0) {
      // Scroll down = zoom out (scale down)
      const newZoom = Math.max(zoomLevel - 5, 50); // Min 50%
      document.body.style.zoom = `${newZoom}%`;
      log.debug(`[Zoom] Scroll decreased to ${newZoom}%`);
    }
  }
}, { passive: false });

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
