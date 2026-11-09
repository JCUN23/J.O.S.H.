// Panel screenshots with sample data. Serves the built app (dist/) and answers every
// backend and third-party request from the fixtures below, so nothing real (devices,
// calendar, location, accounts) can appear.
// Usage: npm run screenshots   (= vite build + node scripts/screenshots.cjs dist docs/screenshots)
// Needs Playwright with Chromium: npm i -D playwright && npx playwright install chromium
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.resolve(process.argv[2] || 'dist');
const OUT = path.resolve(process.argv[3] || 'docs/screenshots');
const ORIGIN = 'http://sentinel.demo';
const TZ = 'America/Detroit';
// Sunday afternoon, a Lions game in the 2nd quarter
const NOW = new Date('2026-11-15T14:07:00-05:00');
const t = (min) => new Date(NOW.getTime() + min * 60_000).toISOString();
const day = (d, h, m = 0) => { const x = new Date(NOW); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };

// ---------------- fixtures ----------------
const team = (id, name, abbr, score, ha) => ({ id, homeAway: ha, team: { id, displayName: name, shortDisplayName: name.split(' ').pop(), abbreviation: abbr, logo: '' }, score: score == null ? undefined : { value: score, displayValue: String(score) } });
const espnEvent = (id, date, state, detail, away, home, tv) => ({
  id, date, name: `${away.team.displayName} at ${home.team.displayName}`, shortName: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
  competitions: [{ status: { type: { state, shortDetail: detail, detail, completed: state === 'post' } }, competitors: [away, home], broadcasts: tv ? [{ media: { shortName: tv } }] : [] }],
});
const ESPN = {
  'football/nfl/teams/8/schedule': { events: [
    espnEvent('L9', day(-7, 13), 'post', 'Final', team('15', 'Miami Dolphins', 'MIA', 17, 'away'), team('8', 'Detroit Lions', 'DET', 27, 'home')),
    espnEvent('L10', day(0, 13), 'in', '2nd 4:12', team('9', 'Green Bay Packers', 'GB', 10, 'away'), team('8', 'Detroit Lions', 'DET', 14, 'home'), 'FOX'),
    espnEvent('L11', day(7, 13), 'pre', 'Sun, Nov 22 1:00 PM', team('8', 'Detroit Lions', 'DET', null, 'away'), team('16', 'Minnesota Vikings', 'MIN', null, 'home'), 'CBS'),
  ] },
  'basketball/nba/teams/8/schedule': { events: [
    espnEvent('P5', day(-1, 19), 'post', 'Final', team('13', 'Los Angeles Lakers', 'LAL', 108, 'away'), team('8', 'Detroit Pistons', 'DET', 115, 'home')),
    espnEvent('P6', day(1, 19, 30), 'pre', 'Mon 7:30 PM', team('8', 'Detroit Pistons', 'DET', null, 'away'), team('15', 'Milwaukee Bucks', 'MIL', null, 'home'), 'FanDuel SN DET'),
  ] },
  'football/college-football/teams/130/schedule': { events: [
    espnEvent('M8', day(-1, 12), 'post', 'Final', team('130', 'Michigan Wolverines', 'MICH', 31, 'away'), team('356', 'Illinois Fighting Illini', 'ILL', 20, 'home')),
    espnEvent('M9', day(6, 12), 'pre', 'Sat 12:00 PM', team('275', 'Wisconsin Badgers', 'WIS', null, 'away'), team('130', 'Michigan Wolverines', 'MICH', null, 'home'), 'FOX'),
  ] },
  'basketball/mens-college-basketball/teams/130/schedule': { events: [
    espnEvent('B3', day(2, 19), 'pre', 'Tue 7:00 PM', team('2', 'Oakland Golden Grizzlies', 'OAK', null, 'away'), team('130', 'Michigan Wolverines', 'MICH', null, 'home'), 'BTN'),
  ] },
  'soccer/esp.1/teams/83/schedule': { events: [
    espnEvent('S12', day(-1, 15), 'post', 'FT', team('83', 'FC Barcelona', 'BAR', 3, 'away'), team('243', 'Sevilla FC', 'SEV', 1, 'home')),
    espnEvent('S13', day(6, 15), 'pre', 'Sat 3:00 PM', team('86', 'Real Madrid', 'RMA', null, 'away'), team('83', 'FC Barcelona', 'BAR', null, 'home'), 'ESPN+'),
  ] },
};

const calendarEvents = {
  primary: [
    { id: 'c1', summary: 'Lions watch party', start: { dateTime: day(0, 13) }, end: { dateTime: day(0, 16, 30) } },
    { id: 'c2', summary: 'Meal prep', start: { dateTime: day(0, 17, 30) }, end: { dateTime: day(0, 18, 30) } },
    { id: 'c3', summary: 'Gym', start: { dateTime: day(1, 6, 30) }, end: { dateTime: day(1, 7, 30) } },
    { id: 'c4', summary: 'Sprint planning', start: { dateTime: day(1, 10) }, end: { dateTime: day(1, 11) } },
    { id: 'c5', summary: 'Car service', start: { dateTime: day(2, 8, 15) }, end: { dateTime: day(2, 9) } },
  ],
  shared: [
    { id: 'c6', summary: 'Dinner reservation', start: { dateTime: day(3, 19) }, end: { dateTime: day(3, 21) } },
    { id: 'c7', summary: 'Pistons game', start: { dateTime: day(1, 19, 30) }, end: { dateTime: day(1, 22) } },
  ],
};

const weather = () => {
  const hours = Array.from({ length: 48 }, (_, i) => { const d = new Date(NOW); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + i - 2); return d; });
  const fmt = (d) => d.toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16).replace(' ', 'T');
  return {
    current: { time: fmt(NOW), temperature_2m: 41, apparent_temperature: 36, relative_humidity_2m: 64, weather_code: 3, wind_speed_10m: 9, uv_index: 1.1 },
    hourly: { time: hours.map(fmt), temperature_2m: hours.map((_, i) => Math.round(41 - Math.abs(i - 4) * 0.7)), weather_code: hours.map((_, i) => (i % 5 === 0 ? 2 : 3)) },
    daily: { time: [0, 1, 2].map((d) => fmt(new Date(NOW.getTime() + d * 86400000)).slice(0, 10)), temperature_2m_max: [44, 47, 39], temperature_2m_min: [33, 35, 30], sunrise: [day(0, 7, 21)], sunset: [day(0, 17, 6)] },
  };
};

const news = { sources: [], articles: [
  { title: 'Sample headline: a smaller, faster single-board computer arrives', description: 'Demo article for screenshots.', url: 'https://example.com/1', source: 'Sample Feed', category: 'tech', pubDate: t(-35), thumbnail: null },
  { title: 'Sample headline: open-source voice assistants get local wake words', description: 'Demo article for screenshots.', url: 'https://example.com/2', source: 'Sample Feed', category: 'tech', pubDate: t(-90), thumbnail: null },
  { title: 'Sample headline: city adds new bike lanes downtown', description: 'Demo article for screenshots.', url: 'https://example.com/3', source: 'Sample Feed', category: 'world', pubDate: t(-140), thumbnail: null },
  { title: 'Sample headline: Lions lead at the half', description: 'Demo article for screenshots.', url: 'https://example.com/4', source: 'Sample Feed', category: 'sports', pubDate: t(-5), thumbnail: null },
] };

const goveeDevices = [
  { device: 'AA:01', model: 'H61A2', deviceName: 'Office Neon', controllable: true, retrievable: true, supportCmds: ['turn', 'brightness', 'color', 'colorTem'] },
  { device: 'AA:02', model: 'H61A2', deviceName: 'Desk Neon', controllable: true, retrievable: true, supportCmds: ['turn', 'brightness', 'color', 'colorTem'] },
  { device: 'AA:03', model: 'H6076', deviceName: 'Floor Lamp', controllable: true, retrievable: true, supportCmds: ['turn'] },
];
const hueLights = {
  4: { name: 'Left Go', type: 'Extended color light', state: { on: true, bri: 220, hue: 41000, sat: 230, xy: [0.17, 0.2], reachable: true } },
  5: { name: 'Right Go', type: 'Extended color light', state: { on: true, bri: 220, hue: 2000, sat: 60, xy: [0.33, 0.33], reachable: true } },
};
const routes = {
  'GET /api/health': { ok: true, integrations: ['Sentinel AI (Groq)', 'ElevenLabs TTS', 'Google Calendar', 'Spotify', 'Govee', 'Philips Hue', 'Frame TV', 'Bambu printer', 'ntfy'].map((name) => ({ name, enabled: true })) },
  'GET /auth/status': { google: true, microsoft: false, spotify: true },
  'GET /auth/google/access-token': { access_token: 'demo', expires_at: Date.now() + 3600e3 },
  'GET /auth/spotify/access-token': { access_token: 'demo', expires_at: Date.now() + 3600e3 },
  'GET /api/stoic': { text: 'We suffer more often in imagination than in reality.', author: 'Seneca', quote: 'We suffer more often in imagination than in reality.' },
  'GET /api/faces': [],
  'GET /api/home/location': { lat: 0, lon: 0, name: 'Gotham City' },
  'GET /api/news': news,
  'GET /api/govee/devices': { code: 200, data: { devices: goveeDevices } },
  'GET /api/hue/lights': hueLights,
  'GET /api/hue/groups': { 1: { name: 'Office', type: 'Room', lights: ['4', '5'], action: { on: true, bri: 220 }, state: { all_on: true, any_on: true } } },
  'GET /api/scenes': { scenes: [
    { id: 'focus', name: 'Focus', icon: 'sun', description: 'Cool white, 80%' },
    { id: 'movie', name: 'Movie night', icon: 'film', description: 'Dim amber, TV on' },
    { id: 'gameday', name: 'Game Day', icon: 'trophy', description: 'Team colors, TV on the game' },
    { id: 'off', name: 'All off', icon: 'power', description: 'Lights and TV off' },
  ] },
  'GET /api/rules': { rules: [
    { id: 'sunset', name: 'Lights on at sunset', enabled: true, when: 'At sunset', ok: true },
    { id: 'home', name: 'Welcome home', enabled: true, when: 'When I get home after dark', ok: true },
    { id: 'focus', name: 'Weekday focus lighting', enabled: true, when: 'Weekdays 9:00 AM', ok: true },
    { id: 'bed', name: 'Lights out', enabled: false, when: 'Daily 11:30 PM', ok: true },
  ] },
  'GET /api/presence': { people: [{ id: 'josh', name: 'Josh', status: 'home', since: t(-180) }] },
  'GET /api/presence/peers': { peers: [] },
  'GET /api/notify': { configured: true, muted: [] },
  'GET /api/activity': { entries: [
    { id: 'a1', at: t(-67), source: 'gameday', title: 'Game Day: Detroit Lions', ok: true, results: ['Govee: 4/4 commands ok on Office Neon, Desk Neon', 'Hue: 2 lights set', 'TV The Frame: on, art off, opened Fubo, muted'] },
    { id: 'a2', at: t(-30), source: 'voice', title: 'Timer set: pizza', ok: true, results: ['Timer set for 12 minutes (pizza)'] },
    { id: 'a3', at: t(-190), source: 'printer', title: 'Print started: Cable_clips_v3', ok: true, results: ['printer: 240 layers, about 2 h'] },
    { id: 'a4', at: t(-260), source: 'rule', title: 'Rule: Welcome home', ok: true, results: ['Govee: 2/2 commands ok', 'Hue: 2 lights set'] },
  ] },
  'GET /api/frametv': { configured: true, tvs: [{ id: 'office', name: 'The Frame', host: 'demo', reachable: true, power: 'on', artMode: 'off', paired: true, needsApproval: false, model: 'QN55LS03', frame: true }] },
  'GET /api/printer': { configured: true, connected: true, active: true, name: 'Bambu P2S', state: 'RUNNING', job: 'Cable_clips_v3', percent: 62, layer: 148, totalLayers: 240, remainingMin: 47, finishAt: t(47), nozzle: 220, nozzleTarget: 220, bed: 65, bedTarget: 65 },
  'GET /api/timers': { now: NOW.getTime(), items: [{ id: 't1', kind: 'timer', label: 'pizza', dueAt: NOW.getTime() + 7 * 60_000 + 23_000 }, { id: 't2', kind: 'reminder', label: 'call Mom', dueAt: new Date(day(0, 17)).getTime() }] },
  'GET /api/voice/status': { listener: { mic: 'USB mic', model: 'alfred' }, panels: 1, configured: true },
  'GET /api/game-day/status': { last: null, teams: [] },
};

const spotifyTrack = { id: 'demo1', name: 'Midnight Protocol', duration_ms: 214000, artists: [{ name: 'The Gotham Strings' }],
  album: { name: 'Night Shift', images: [{ url: `${ORIGIN}/demo-art.svg` }] }, uri: 'spotify:track:demo1' };
const spotify = {
  '/v1/me/player': { is_playing: true, progress_ms: 81000, item: spotifyTrack, device: { id: 'tv1', name: 'The Frame', type: 'TV', volume_percent: 35 }, context: { type: 'playlist', uri: 'spotify:playlist:demo' }, shuffle_state: true, repeat_state: 'off' },
  '/v1/me/player/currently-playing': { is_playing: true, progress_ms: 81000, item: spotifyTrack },
  '/v1/me/player/devices': { devices: [{ id: 'tv1', name: 'The Frame', type: 'TV', is_active: true, volume_percent: 35 }, { id: 'p1', name: 'Sentinel Panel', type: 'Computer', is_active: false }, { id: 'm1', name: 'Phone', type: 'Smartphone', is_active: false }] },
  '/v1/me/player/recently-played': { items: [{ track: spotifyTrack, played_at: t(-3), context: { type: 'playlist', uri: 'spotify:playlist:demo' } }] },
  '/v1/me/tracks/contains': [true],
  '/v1/me/player/queue': { queue: [] },
};
const albumArt = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1d3a"/><stop offset="1" stop-color="#1fb6ff"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="90" r="40" fill="#e6f7ff" opacity=".85"/><path d="M0 240 L60 190 L110 215 L170 160 L230 200 L300 150 L300 300 L0 300Z" fill="#06101f"/></svg>`;

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function handle(route) {
  const url = new URL(route.request().url());
  const method = route.request().method();
  if (url.origin === ORIGIN) {
    if (url.pathname === '/demo-art.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: albumArt });
    if (url.pathname === '/api/voice/events') {
      // One announcement on the first connection, so the screenshot shows Alfred talking
      const first = !handle.announced; handle.announced = true;
      const events = [{ type: 'hello', listener: true }];
      if (first) events.push({ type: 'announce', id: 1, text: "Good afternoon, Josh. The Lions lead the Packers 14 to 10 in the second quarter. Your pizza timer has 7 minutes left, and the print is 62 percent done." });
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 600000\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      const key = `${method} ${url.pathname}`;
      if (routes[key] !== undefined) return json(route, routes[key]);
      if (url.pathname.startsWith('/api/govee/state/')) return json(route, { code: 200, data: { properties: [{ online: true }, { powerState: 'on' }, { brightness: 80 }, { color: { r: 31, g: 182, b: 255 } }] } });
      if (method !== 'GET') return json(route, { ok: true });
      return json(route, { error: 'not in demo data' }, 404);
    }
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
    return route.fulfill({ path: path.join(DIST, 'index.html') });
  }
  if (url.hostname === 'api.open-meteo.com') return json(route, weather());
  if (url.hostname === 'site.api.espn.com') {
    const key = url.pathname.replace('/apis/site/v2/sports/', '');
    return json(route, ESPN[key] || { events: [], children: [] });
  }
  if (url.hostname === 'www.googleapis.com') {
    if (url.pathname.endsWith('/calendarList')) return json(route, { items: [{ id: 'primary', summary: 'Josh', backgroundColor: '#22d3ee' }, { id: 'shared', summary: 'Family', backgroundColor: '#a78bfa' }] });
    const m = url.pathname.match(/calendars\/([^/]+)\/events/);
    return json(route, { items: calendarEvents[decodeURIComponent(m?.[1] || '')] || [] });
  }
  if (url.hostname === 'api.spotify.com') {
    const body = spotify[url.pathname];
    return body ? json(route, body) : route.fulfill({ status: 204, body: '' });
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return route.continue().catch(() => route.abort());
  return route.abort();          // anything else (CDNs, SDKs): not needed for a still
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shoot = async (name, { width = 1280, height = 800, scale = 2, setup, order, idle, announce = true, clip } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, timezoneId: TZ, locale: 'en-US' });
    handle.announced = !announce;
    await ctx.route('**/*', handle);
    await ctx.clock.install({ time: NOW });
    await ctx.addInitScript(({ order, idle }) => {
      localStorage.setItem('onboarding_completed', '1');
      localStorage.setItem('voice_panel', 'on');
      localStorage.setItem('idle_mode', idle ? 'on' : 'off');
      localStorage.setItem('wake_word_enabled', 'false');
      localStorage.setItem('spotify_access_token', 'demo');
      localStorage.setItem('spotify_token_expiry', String(Date.now() + 3600e3));
      if (order) localStorage.setItem('batcomputer_widget_order', JSON.stringify(order));
    }, { order, idle: Boolean(idle) });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/`);
    await page.waitForTimeout(3500);
    await page.evaluate(() => { const g = document.querySelector('.hud-grid'); if (g) g.scrollLeft = 0; });
    if (setup) await setup(page);
    await page.waitForTimeout(800);
    if (clip) await page.locator(clip).first().screenshot({ path: path.join(OUT, `${name}.png`) });
    else await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('wrote', path.join(OUT, `${name}.png`));
    await ctx.close();
  };

  const MAIN = ['weather', 'sports', 'calendar', 'spotify', 'phillips_hue', 'scenes', 'govee', 'crealityprinter', 'frametv', 'activity', 'news', 'quickcontrols'];
  await shoot('panel', { order: MAIN });
  const DEVICES = ['phillips_hue', 'govee', 'crealityprinter', 'frametv', 'activity', 'news', 'weather', 'sports', 'calendar', 'spotify', 'scenes', 'quickcontrols'];
  // Devices: lights, printer, TV, activity
  await shoot('devices', { order: DEVICES, announce: false });
  // Close-up: the color studio, mid-drag (a held drag only previews, so nothing reloads)
  await shoot('color', {
    order: DEVICES, announce: false, height: 1500, clip: '[data-testid="color-studio"]',
    setup: async (page) => {
      await page.getByRole('button', { name: /^Colors$/ }).click();
      await page.waitForTimeout(300);
      const wheel = page.locator('[data-testid="color-wheel"]').first();
      await wheel.scrollIntoViewIfNeeded();
      const box = await wheel.boundingBox();
      const r = box.width / 2, cx = box.x + r, cy = box.y + r;
      const at = (deg, sat) => [cx + r * sat * Math.sin((deg * Math.PI) / 180), cy - r * sat * Math.cos((deg * Math.PI) / 180)];
      await page.mouse.move(...at(150, 0.3));
      await page.mouse.down();
      await page.mouse.move(...at(200, 0.85), { steps: 8 });   // Honolulu-ish blue, held
      await page.evaluate(() => Object.assign(document.querySelector('[data-testid="color-studio"]').style, { padding: '20px', background: '#01080e', borderRadius: '12px' }));
    },
  });
  // The idle screen: three quiet minutes later
  await shoot('idle', { order: MAIN, idle: true, setup: async (page) => { await page.clock.fastForward('03:05'); await page.waitForTimeout(1500); } });
  await browser.close();
})();
