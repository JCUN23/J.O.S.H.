// Frame TV local control against a fake TV: HTTP info (8001), WebSocket channels (8002), WOL (UDP).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const dgram = require('dgram');
const path = require('path');
const { WebSocketServer } = require('ws');
const { tempStores, startApp } = require('./helpers');

const dir = tempStores();
process.env.ACTIVITY_STORE_PATH = path.join(dir, 'activity.json');

// ---- fake TV ----
const tv = { wolWorks: true, power: 'standby', art: 'off', keys: [], allow: true, wol: 0, token: 'tok-123' };
const httpSrv = http.createServer((req, res) => {
  if (tv.power === 'off') { req.socket.destroy(); return; }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ device: { PowerState: tv.power, wifiMac: 'AA:BB:CC:DD:EE:FF', modelName: 'QN55LS03DAFXZA', FrameTVSupport: 'true' } }));
});
const wss = new WebSocketServer({ noServer: true });
httpSrv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req)));
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const art = url.pathname.endsWith('com.samsung.art-app');
  const hasToken = url.searchParams.get('token') === tv.token;
  if (!hasToken && !tv.allow) { ws.send(JSON.stringify({ event: 'ms.channel.unauthorized' })); return; }
  ws.send(JSON.stringify({ event: 'ms.channel.connect', data: hasToken ? {} : { token: tv.token } }));
  if (art) ws.send(JSON.stringify({ event: 'ms.channel.ready' }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.method === 'ms.remote.control') {
      tv.keys.push(`${msg.params.Cmd}:${msg.params.DataOfCmd}`);
      if (msg.params.DataOfCmd === 'KEY_POWER' && msg.params.Cmd === 'Release') tv.power = 'standby';
      return;
    }
    const d = JSON.parse(msg.params.data);
    const reply = (data) => ws.send(JSON.stringify({ event: 'd2d_service_message', data: JSON.stringify({ id: d.id, ...data }) }));
    if (d.request === 'get_artmode_status') reply({ event: 'artmode_status', value: tv.art });
    if (d.request === 'set_artmode_status') { tv.art = d.value; reply({ event: 'art_mode_changed', status: d.value }); }
  });
});
const udp = dgram.createSocket('udp4');
udp.on('message', (m) => {
  const mac = m.subarray(6, 12).toString('hex');
  if (m.subarray(0, 6).equals(Buffer.alloc(6, 0xff)) && mac === 'aabbccddeeff') { tv.wol++; if (tv.wolWorks) tv.power = 'on'; }
});

let frame;
test.before(async () => {
  await new Promise((r) => httpSrv.listen(0, '127.0.0.1', r));
  await new Promise((r) => udp.bind(0, '127.0.0.1', r));
  const port = httpSrv.address().port;
  Object.assign(process.env, {
    FRAME_TVS: 'Office@127.0.0.1', FRAME_TV_WS_SCHEME: 'ws', FRAME_TV_WS_PORT: String(port),
    FRAME_TV_HTTP_PORT: String(port), FRAME_TV_WOL_ADDR: '127.0.0.1', FRAME_TV_WOL_PORT: String(udp.address().port),
    FRAME_TV_BOOT_MS: '3000',
  });
  frame = require('../lib/frameTv');
});
test.after(() => { httpSrv.close(); udp.close(); wss.close(); });

test('config: Name@IP list', () => {
  assert.deepEqual(frame.configured(), [{ id: 'office', name: 'Office', host: '127.0.0.1' }]);
});

test('pairing stores the token the TV hands back; later connections reuse it', async () => {
  const office = frame.find('office');
  assert.equal((await frame.status(office)).paired, false);
  assert.equal(await frame.pair(office), true);
  tv.allow = false;                                   // only a saved token gets in now
  await frame.sendKey(office, 'KEY_HOME');
  assert.deepEqual(tv.keys, ['Click:KEY_HOME']);
});

test('status learns the MAC; power on sends Wake-on-LAN', async () => {
  const office = frame.find('office');
  const s = await frame.status(office);
  assert.equal(s.power, 'standby');
  assert.equal(s.model, 'QN55LS03DAFXZA');
  assert.equal(await frame.powerOn(office), 'on');
  assert.equal(tv.wol, 1);
  assert.equal(await frame.powerOn(office), 'already on');
});

test('art mode on/off round-trips through the art channel', async () => {
  const office = frame.find('office');
  await frame.setArtMode(office, true);
  assert.equal(tv.art, 'on');
  assert.equal(await frame.getArtMode(office), 'on');
  await frame.setArtMode(office, false);
  assert.equal((await frame.status(office)).artMode, 'off');
});

test('scenes: art mode leaves an off TV alone; power:false holds POWER', async () => {
  tv.power = 'standby'; tv.keys = [];
  assert.match(await frame.apply({ artMode: true }), /art left alone/);
  assert.equal(tv.wol, 1, 'did not wake it');
  tv.power = 'on';
  assert.match(await frame.apply({ artMode: true }), /TV Office: art mode/);
  assert.match(await frame.apply({ power: false }), /TV Office: off/);
  assert.deepEqual(tv.keys, ['Press:KEY_POWER', 'Release:KEY_POWER']);
});

test('unreachable TV reports a readable error, not a crash', async () => {
  tv.power = 'off'; tv.wolWorks = false;
  const r = await frame.apply({ artMode: false, power: true });
  assert.match(r, /TV Office: error: didn't wake/);
  tv.power = 'on'; tv.wolWorks = true;
});

test('HTTP routes', async (t) => {
  const app = await startApp(require('../routes/frametv'));
  t.after(app.close);
  const list = await app.call('GET', '/api/frametv');
  assert.equal(list.body.tvs[0].paired, true);
  const art = await app.call('POST', '/api/frametv/office/command', { action: 'art-on' });
  assert.equal(art.status, 200); assert.equal(art.body.status.artMode, 'on');
  const vol = await app.call('POST', '/api/frametv/office/command', { action: 'key', key: 'KEY_VOLUP' });
  assert.equal(vol.status, 200);
  assert.equal((await app.call('POST', '/api/frametv/office/command', { action: 'key', key: 'KEY_FACTORY' })).status, 400);
  assert.equal((await app.call('POST', '/api/frametv/nope/command', { action: 'art-on' })).status, 404);
});
