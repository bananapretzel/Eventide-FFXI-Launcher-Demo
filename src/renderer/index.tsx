// Debug: Log window.electron to confirm preload script injection
// eslint-disable-next-line no-console
console.log('window.electron:', window.electron);
import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  // eslint-disable-next-line no-console
  console.error('Root container (#root) not found. Aborting React mount.');
} else {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// calling IPC exposed from preload script (use safe optional chaining)
const ipc = window.electron?.ipcRenderer;
if (ipc?.once) {
  ipc.once('ipc-example', (arg: unknown) => {
    // eslint-disable-next-line no-console
    console.log(arg);
  });
}
if (ipc?.sendMessage) {
  ipc.sendMessage('ipc-example', ['ping']);
}
