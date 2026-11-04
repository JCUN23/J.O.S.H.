// J.O.S.H. / Sentinel backend: composition root.
// Load env -> validate -> wire routers -> static frontend -> error handling -> listen.
// DOTENV_CONFIG_PATH lets tests point at an empty fixture instead of the real .env
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined, quiet: true });
const { validateEnv } = require('./lib/env');
const integrations = validateEnv();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { PORT } = require('./lib/config');
const { apiNotFound, errorHandler } = require('./lib/http');

const app = express();
// CORS: only our own pages may read API responses. The API now hands out OAuth
// access tokens, so a wide-open `*` would let any website opened on a tailnet device
// read them. Production is same-origin (no CORS needed); this allowlist covers dev.
const { FRONTEND_URL } = require('./lib/config');
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/;
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin requests and non-browser clients
  try {
    const u = new URL(origin);
    if (u.origin === new URL(FRONTEND_URL).origin) return true;
    // Note: not *.ts.net in general; anyone can host a Funnel page there.
    return PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
app.use(express.json());

// Health check for the wall panel / future monitoring. Reports which integrations
// are configured (names only, never values).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), integrations });
});

// Routers declare their full paths (/api/govee/..., /auth/google, ...) so a grep for a
// URL lands on the file that handles it.
app.use(require('./routes/auth'));
app.use(require('./routes/spotify'));
app.use(require('./routes/accounts'));
app.use(require('./routes/faces'));
app.use(require('./routes/hue'));
app.use(require('./routes/tesla'));
app.use(require('./routes/ai'));
app.use(require('./routes/quotes'));
app.use(require('./routes/govee'));
app.use(require('./routes/creality'));
app.use(require('./routes/smartthings'));
app.use(require('./routes/gameday'));
app.use(require('./routes/sentinel'));
app.use(require('./routes/tts'));

app.use('/api', apiNotFound);

// Serve the built frontend (npm run build -> ../dist) from the same origin.
const DIST_DIR = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback for client-side routes like /callback/microsoft (Express 5 wildcard syntax)
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  console.log(`Serving frontend from ${DIST_DIR}`);
}

app.use(errorHandler);

// Bind on all interfaces so devices on the LAN (wall tablet) can reach it.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT} (all interfaces)`);
});
