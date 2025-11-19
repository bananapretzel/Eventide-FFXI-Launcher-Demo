// Test setup file
import fetch from 'node-fetch';

// Add fetch to global scope for tests
if (!global.fetch) {
  (global as any).fetch = fetch;
}
