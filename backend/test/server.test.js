// Smoke test: the real server.js boots, validates env, and wires every router.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores } = require('./helpers');

tempStores();
process.env.DOTENV_CONFIG_PATH = path.join(__dirname, 'fixtures', 'none.env'); // ignore the real .env
mockModules({ sharp: () => ({}) });
const express = require('express');
let app;
express.application.listen = function () { app = this; return { close() {} }; };

test('server boots and wires all routes', async (t) => {
  const quiet = [console.log, console.warn]; console.log = console.warn = () => {};
  try { require('../server'); } finally { [console.log, console.warn] = quiet; }
  assert.ok(app, 'server called app.listen');

  const routes = [];
  (function walk(stack) {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) routes.push(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack);
    }
  })(app.router.stack);

  for (const r of ['GET /api/health', 'GET /auth/status', 'GET /api/faces', 'PUT /api/faces', 'GET /api/hue/lights',
    'POST /api/govee/control', 'GET /api/stoic', 'POST /api/sentinel/chat',
    'GET /auth/spotify/access-token', 'GET /auth/google/access-token', 'POST /api/game-day']) {
    assert.ok(routes.includes(r), `missing route ${r}`);
  }
  // a big drop means a router stopped being mounted
  assert.ok(routes.length >= 40, `only ${routes.length} routes registered`);

  // unknown API routes get JSON, not the SPA's HTML
  const s = await new Promise((r) => { const srv = require('http').createServer(app).listen(0, () => r(srv)); });
  t.after(() => s.close());
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/definitely-not-a-route`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /No API route/);
});
