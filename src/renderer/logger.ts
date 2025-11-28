import log from 'electron-log/renderer';

// Configure electron-log for the renderer process
if (log.transports.file) {
  log.transports.file.level = 'debug';
}
if (log.transports.console) {
  log.transports.console.level = 'debug';
  // Format log messages
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
}

// Export logger
export default log;
