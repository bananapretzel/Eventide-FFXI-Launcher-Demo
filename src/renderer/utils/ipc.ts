/**
 * Safe IPC invoke helper for renderer process
 * Prefers window.electron.invoke if available,
 * otherwise falls back to sendMessage + once-reply pattern.
 */
export async function safeInvoke<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const anyWin = window as any;
  const { electron } = anyWin;

  if (!electron) {
    throw new Error('IPC not available');
  }

  // Prefer direct invoke if preload exposes it
  if (typeof electron.invoke === 'function') {
    return electron.invoke(channel, ...args);
  }

  // Fallback: use ipcRenderer.sendMessage and wait for a reply
  const ipc = electron.ipcRenderer;
  if (
    !ipc ||
    typeof ipc.sendMessage !== 'function' ||
    typeof ipc.once !== 'function'
  ) {
    throw new Error('No suitable IPC invoke method available');
  }

  const replyChannel = `${channel}:reply`;
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let finished = false;

    const handler = (_ev: unknown, payload: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(payload);
    };

    timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('IPC invoke timed out'));
    }, 10000);

    ipc.once(replyChannel, handler);
    try {
      ipc.sendMessage(channel, args);
    } catch (err) {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        reject(err);
      }
    }
  });
}
