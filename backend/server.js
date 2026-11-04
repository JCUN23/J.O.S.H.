// J.O.S.H. / Sentinel backend: composition root.
// Load env -> validate -> wire routers -> static frontend -> error handling -> listen.
require('dotenv').config();
const { validateEnv } = require('./lib/env');
const integrations = validateEnv();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { PORT } = require('./lib/config');
const { apiNotFound, errorHandler } = require('./lib/http');

const app = express();
app.use(cors());
app.use(express.json());

// Health check for the wall panel / future monitoring. Reports which integrations
// are configured (names only, never values).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), integrations });
});

// Routers declare their full paths (/api/govee/..., /auth/google, ...) so a grep for a
// URL lands on the file that handles it.
app.use(require('./routes/auth'));
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
