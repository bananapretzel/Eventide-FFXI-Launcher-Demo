import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// Configure electron-log for the main process
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';

// Set log file location
if (app) {
  const userDataPath = app.getPath('userData');
  log.transports.file.resolvePathFn = () => path.join(userDataPath, 'logs', 'main.log');
}

// Format log messages
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

// Override console methods to use electron-log
Object.assign(console, log.functions);

export default log;
