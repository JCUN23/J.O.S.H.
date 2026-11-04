// Shared test helpers. node --test runs each file in its own process, so module
// mocks and env set here stay isolated per file.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Replace modules by name before anything requires them: mockModules({ axios: fake })
function mockModules(map) {
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(map, request)) return map[request];
    return original.call(this, request, ...rest);
  };
}

// Throwaway data dir so tests never touch backend/data
function tempStores() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'));
  process.env.TOKEN_STORE_PATH = path.join(dir, 'tokens.json');
  process.env.FACES_STORE_PATH = path.join(dir, 'faces.json');
  return dir;
}

// Mount routers on a bare app and listen on a random port.
async function startApp(...routers) {
  const express = require('express');
  const { errorHandler } = require('../lib/http');
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use(r);
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const httpError = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

module.exports = { mockModules, tempStores, startApp, delay, httpError };
