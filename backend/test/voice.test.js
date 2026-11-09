// Pi mic relay: token, wake + speaking guard, transcript to the panel, Pi-only fallback.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

process.env.GROQ_API_KEY = 'gk';
const voice = require('../routes/voice');
const T = voice._test;

const quiet = () => { const o = [console.log, console.warn]; console.log = console.warn = () => {}; return () => { [console.log, console.warn] = o; }; };
const WAV = Buffer.concat([Buffer.alloc(44), Buffer.alloc(3200, 1)]);

// Open an SSE stream and collect its events.
async function stream(base, panel) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/voice/events${panel ? '?panel=1' : ''}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const events = [];
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += Buffer.from(value).toString();
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      }
    } catch { /* aborted */ }
  })();
  const waitFor = async (type) => {
    for (let n = 0; n < 100; n++) { const e = events.find((x) => x.type === type); if (e) return e; await new Promise((r) => setTimeout(r, 10)); }
    throw new Error(`no ${type} event; got ${JSON.stringify(events)}`);
  };
  await waitFor('hello');
  return { events, waitFor, close: () => ctrl.abort() };
}

const postWav = (base, body, token = 'vt') => fetch(`${base}/api/voice/utterance`, {
  method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Voice-Token': token }, body,
}).then(async (r) => ({ status: r.status, body: await r.json() }));

let sttText = 'Hey Jarvis, turn off the lights.';
let sttCalls = [];
T.setFetch(async (url, opts) => {
  sttCalls.push({ url, model: opts.body.get('model'), file: opts.body.get('file') });
  if (sttText instanceof Error) return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) };
  return { ok: true, json: async () => ({ text: sttText }) };
});

test('cleanTranscript strips the wake phrase and drops Whisper silence junk', () => {
  assert.equal(T.cleanTranscript('Hey Jarvis, turn off the lights.'), 'turn off the lights.');
  assert.equal(T.cleanTranscript('Jarvis what games are on today?'), 'what games are on today?');
  assert.equal(T.cleanTranscript(' Thank you. '), '');
  assert.equal(T.cleanTranscript('you'), '');
  assert.equal(T.cleanTranscript('Hey Jarvis.'), '');
  assert.equal(T.cleanTranscript('Alfred, turn off the lights.'), 'turn off the lights.');
  assert.equal(T.cleanTranscript('Hey Alfred, what games are on?'), 'what games are on?');
  assert.equal(T.cleanTranscript('play some jazz'), 'play some jazz');
});

test('Pi routes need VOICE_TOKEN', async (t) => {
  const app = await startApp(voice); t.after(app.close);
  delete process.env.VOICE_TOKEN;
  assert.equal((await app.call('POST', '/api/voice/wake', {})).status, 503);
  process.env.VOICE_TOKEN = 'vt';
  assert.equal((await app.call('POST', '/api/voice/wake', {}, { 'X-Voice-Token': 'nope' })).status, 401);
  assert.equal((await app.call('POST', '/api/voice/heartbeat', { mic: 'USB mic', model: 'hey_jarvis' }, { 'X-Voice-Token': 'vt' })).status, 200);
  const s = await app.call('GET', '/api/voice/status');
  assert.equal(s.body.listener.mic, 'USB mic');
  assert.equal(s.body.configured, true);
});

test('with a panel open: wake shows listening, the cleaned transcript goes to the panel', async (t) => {
  const restore = quiet(); t.after(restore);
  T.reset(); sttCalls = []; sttText = 'Hey Jarvis, turn off the lights.';
  const app = await startApp(voice);
  const panel = await stream(app.base, true);
  t.after(async () => { panel.close(); T.reset(); await app.close(); });
  const w = await app.call('POST', '/api/voice/wake', {}, { 'X-Voice-Token': 'vt' });
  assert.deepEqual(w.body, { listen: true, panels: 1 });
  await panel.waitFor('wake');
  const r = await postWav(app.base, WAV);
  assert.deepEqual(r.body, { text: 'turn off the lights.', handledBy: 'panel' });
  assert.equal((await panel.waitFor('transcript')).text, 'turn off the lights.');
  assert.equal(sttCalls[0].model, 'whisper-large-v3-turbo');
  assert.equal(sttCalls[0].file.size, WAV.length);
});

test('while the panel is speaking, wake words are ignored', async (t) => {
  T.reset();
  const app = await startApp(voice); t.after(app.close);
  await app.call('POST', '/api/voice/speaking', { speaking: true });
  assert.equal((await app.call('POST', '/api/voice/wake', {}, { 'X-Voice-Token': 'vt' })).body.listen, false);
  await app.call('POST', '/api/voice/speaking', { speaking: false });
  assert.equal((await app.call('POST', '/api/voice/wake', {}, { 'X-Voice-Token': 'vt' })).body.listen, true);
});

test('no panel open: Sentinel runs it here and the reply goes back to the Pi', async (t) => {
  const restore = quiet(); t.after(restore);
  T.reset(); sttText = 'Jarvis, lights off';
  let ran = null;
  T.setAgent(async (text) => { ran = text; return { response: 'Lights are off.' }; });
  const app = await startApp(voice);
  const viewer = await stream(app.base, false);
  t.after(async () => { viewer.close(); T.reset(); await app.close(); });    // a laptop tab, not the voice panel
  const r = await postWav(app.base, WAV);
  assert.deepEqual(r.body, { text: 'lights off', handledBy: 'pi', reply: 'Lights are off.' });
  assert.equal(ran, 'lights off');
  assert.equal((await viewer.waitFor('handled')).reply, 'Lights are off.');
});

test('silence or junk -> nothing; speech-to-text failure -> 502 + error event', async (t) => {
  const restore = quiet(); t.after(restore);
  T.reset();
  const app = await startApp(voice);
  const panel = await stream(app.base, true);
  t.after(async () => { panel.close(); T.reset(); await app.close(); });
  assert.deepEqual((await postWav(app.base, Buffer.alloc(0))).body, { text: '', handledBy: null });
  sttText = 'Thank you.';
  assert.deepEqual((await postWav(app.base, WAV)).body, { text: '', handledBy: null });
  await panel.waitFor('nothing');
  sttText = new Error('x');
  const r = await postWav(app.base, WAV);
  assert.equal(r.status, 502);
  assert.match((await panel.waitFor('error')).text, /rate limited/);
});

test('two panels open: the command runs on ONE (the newest), not both (Nov 9 double reply)', async (t) => {
  const restore = quiet(); t.after(restore);
  T.reset(); sttText = 'Alfred, play Discover Weekly';
  const app = await startApp(voice);
  const older = await stream(app.base, true);
  await new Promise((r) => setTimeout(r, 5));
  const newer = await stream(app.base, true);
  t.after(async () => { older.close(); newer.close(); T.reset(); await app.close(); });
  const r = await postWav(app.base, WAV);
  assert.equal(r.body.handledBy, 'panel');
  const ev = await newer.waitFor('transcript');
  assert.equal(ev.text, 'play Discover Weekly');
  assert.ok(ev.id > 0, 'commands carry an id');
  await new Promise((r2) => setTimeout(r2, 30));
  assert.equal(older.events.filter((e) => e.type === 'transcript').length, 0);
});
