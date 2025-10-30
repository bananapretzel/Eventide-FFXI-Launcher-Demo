import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';
// Removed Tailwind stylesheet import; using component-scoped CSS instead

// Create the root once and render the application.
const container = document.getElementById('root');
if (!container) {
  console.error('Root container (#root) not found. Aborting React mount.');
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
    console.log(arg);
  });
}
if (ipc?.sendMessage) {
  ipc.sendMessage('ipc-example', ['ping']);
}
