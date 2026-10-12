/**
 * SENTRA API entry point.
 *   npm start          (from server/)  ->  http://localhost:4000
 */
import { createApp } from './app.js';
import { originPolicy, config } from './config.js';

const app = createApp();

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`[sentra] API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  const policy = originPolicy();
  console.log(`[sentra] allowed origins: ${policy.allowed.join(', ') || '(none)'}`);
  if (policy.derivedFrom) {
    console.log(`[sentra] preview origins derived from ${policy.derivedFrom} (ports ${policy.previewPorts.join(', ')})`);
  }
  if (policy.patterns.length) console.log(`[sentra] allowed origin patterns: ${policy.patterns.join(', ')}`);
  console.log(`[sentra] database: ${config.DATABASE_PATH}`);
  console.log(`[sentra] Overpass endpoint: ${config.OVERPASS_URL}`);
});

function shutdown(signal) {
  console.log(`[sentra] ${signal} received, shutting down.`);
  server.close(() => {
    try { app.close(); } catch { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
