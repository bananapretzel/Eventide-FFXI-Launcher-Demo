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

// Add numpad +/- zoom support for low resolution displays (e.g., 720p)
window.addEventListener('keydown', (event) => {
  // Check for numpad plus (107), numpad minus (109), or regular +/- with ctrl
  const isNumpadPlus = event.keyCode === 107 || (event.key === '+' && event.location === 3);
  const isNumpadMinus = event.keyCode === 109 || (event.key === '-' && event.location === 3);
  const isRegularZoom = (event.key === '+' || event.key === '=') && event.ctrlKey;
  const isRegularZoomOut = event.key === '-' && event.ctrlKey;

  if (isNumpadPlus || isRegularZoom) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.min(zoomLevel + 10, 200); // Max 200%
    document.body.style.zoom = `${newZoom}%`;
    log.debug(`[Zoom] Increased to ${newZoom}%`);
  } else if (isNumpadMinus || isRegularZoomOut) {
    event.preventDefault();
    const currentZoom = (document.body.style.zoom as any) || '100%';
    const zoomLevel = parseFloat(currentZoom);
    const newZoom = Math.max(zoomLevel - 10, 50); // Min 50%
    document.body.style.zoom = `${newZoom}%`;
    log.debug(`[Zoom] Decreased to ${newZoom}%`);
  }
});

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
