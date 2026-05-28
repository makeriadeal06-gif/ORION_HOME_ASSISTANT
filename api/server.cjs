// CommonJS entrypoint for Vercel function
// Loads the bundled server code (dist/server.cjs) produced at build time.
// This file must be CommonJS so Vercel's Node runtime can require it
// without attempting to resolve TypeScript sources.

try {
  const srv = require('../dist/server.cjs');
  // If the bundled module exports the app as default (ESM -> transpiled), prefer that
  const exported = srv && (srv.default || srv);
  module.exports = exported;
} catch (err) {
  // Provide a clearer error at runtime rather than a cryptic module not found
  console.error('Failed to load backend bundle (dist/server.cjs). Have you run npm run build?', err);
  throw err;
}
