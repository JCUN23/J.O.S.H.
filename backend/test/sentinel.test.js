const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, startApp, httpError } = require('./helpers');

tempStores();
process.env.GROQ_API_KEY = 'test-key';
delete process.env.GROQ_MODEL;

const requests = [];
let script = [];   // queued Groq replies (or errors) for successive calls
const axios = {
  post: async (url, body) => {
    if (!url.includes('groq.com')) throw new Error('unexpected ' + url);
    requests.push(JSON.parse(JSON.stringify(body)));
    const next = script.shift();
    if (next instanceof Error) throw next;
    return { data: { choices: [next] } };
  },
  get: async () => { throw new Error('no network in tests'); },
  put: async () => ({ data: {} }),
};
mockModules({ axios, sharp: () => ({}) });

test('sentinel chat (Groq)', async (t) => {
  const app = await startApp(require('../routes/sentinel'));
  t.after(app.close);
  const quiet = [console.log, console.error]; console.log = console.error = () => {};
  t.after(() => { [console.log, console.error] = quiet; });

  await t.test('uses the configured model + low reasoning, never the retired llama model', async () => {
    script = [{ finish_reason: 'stop', message: { role: 'assistant', content: 'It is 10pm.', reasoning: 'user wants time' } }];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'how long until sunset' });
    assert.equal(r.status, 200);
    assert.equal(r.body.response, 'It is 10pm.');
    const sent = requests.at(-1);
    assert.equal(sent.model, 'openai/gpt-oss-120b');
    assert.equal(sent.reasoning_effort, 'low');
    assert.ok(sent.max_tokens >= 1024, 'room for reasoning tokens');
    assert.ok(!JSON.stringify(requests).includes('llama-3.3'));
  });

  await t.test('tool loop: history sent back to Groq has no reasoning field', async () => {
    require('../lib/sentinel/memory').forget();   // no earlier exchange in this request
    requests.length = 0;
    script = [
      { finish_reason: 'tool_calls', message: { role: 'assistant', content: null, reasoning: 'need the time',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_time', arguments: '{}' } }] } },
      { finish_reason: 'stop', message: { role: 'assistant', content: 'Done.' } },
    ];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'how long until sunset' });
    assert.equal(r.status, 200);
    const second = requests[1].messages;
    const echoed = second.find((m) => m.role === 'assistant');
    assert.ok(echoed.tool_calls, 'tool calls kept');
    assert.equal('reasoning' in echoed, false, 'reasoning stripped');
    assert.ok(second.some((m) => m.role === 'tool' && m.tool_call_id === 'c1'));
  });

  await t.test('rate limit (429): long wait -> the smaller model answers instead (Nov 9 "AI unavailable")', async () => {
    requests.length = 0;
    const limited = httpError(429, { error: { message: 'Rate limit reached for model openai/gpt-oss-120b: tokens per minute' } });
    limited.response.headers = { 'retry-after': '40' };
    script = [limited, { finish_reason: 'stop', message: { role: 'assistant', content: 'Resumed on The Frame.' } }];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'resume the music on the frame' });
    assert.equal(r.status, 200);
    assert.equal(r.body.response, 'Resumed on The Frame.');
    assert.deepEqual(requests.map((q) => q.model), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  });

  await t.test('prompt caching: system prompt + tools identical on every request; clock in the user turn', async () => {
    requests.length = 0;
    script = [{ finish_reason: 'stop', message: { role: 'assistant', content: 'A.' } },
              { finish_reason: 'stop', message: { role: 'assistant', content: 'B.' } }];
    await app.call('POST', '/api/sentinel/chat', { message: 'make the office feel like a sunset and tell me a joke' });
    await app.call('POST', '/api/sentinel/chat', { message: 'anything fun happening this weekend around here' });
    const [a, b] = requests;
    assert.equal(JSON.stringify(a.messages[0]), JSON.stringify(b.messages[0]), 'same system message');
    assert.doesNotMatch(a.messages[0].content, /Right now it is/, 'no clock in the cached prefix');
    assert.equal(JSON.stringify(a.tools), JSON.stringify(b.tools), 'same tools, same order');
    assert.equal(a.tools.length, require('../lib/sentinel/tools').SENTINEL_TOOLS.length);
    require('../lib/sentinel/memory').forget();
  });

  await t.test('rate limit on two models: the next one in GROQ_FALLBACK_MODEL answers', async () => {
    requests.length = 0;
    process.env.GROQ_FALLBACK_MODEL = 'openai/gpt-oss-20b, qwen/qwen3.8-27b';
    const limited = () => Object.assign(httpError(429, { error: { message: 'Rate limit' } }), {});
    const a = limited(); a.response.headers = { 'retry-after': '40' };
    const b = limited(); b.response.headers = {};
    script = [a, b, { finish_reason: 'stop', message: { role: 'assistant', content: 'Third time.' } }];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'hi there' });
    assert.equal(r.body.response, 'Third time.');
    assert.deepEqual(requests.map((q) => q.model), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']);
    delete process.env.GROQ_FALLBACK_MODEL;
    require('../lib/sentinel/memory').forget();
  });

  await t.test('rate limit with a short retry-after: waits and retries the same model', async () => {
    requests.length = 0;
    const limited = httpError(429, { error: { message: 'Rate limit reached' } });
    limited.response.headers = { 'retry-after': '0.01' };
    script = [limited, { finish_reason: 'stop', message: { role: 'assistant', content: 'OK.' } }];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'hi' });
    assert.equal(r.body.response, 'OK.');
    assert.deepEqual(requests.map((q) => q.model), ['openai/gpt-oss-120b', 'openai/gpt-oss-120b']);
  });

  await t.test('Groq rejection -> 502 with the reason (regression: silent "not sure how to help")', async () => {
    script = [httpError(404, { error: { message: 'The model `llama-3.3-70b-versatile` has been decommissioned' } })];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'hi' });
    assert.equal(r.status, 502);
    assert.match(r.body.detail, /decommissioned/);
    assert.equal(r.body.model, 'openai/gpt-oss-120b');
  });
});

test('follow-ups: the last few exchanges go along; forgotten after quiet minutes', async (t) => {
  const memory = require('../lib/sentinel/memory');
  memory.forget();
  const app = await startApp(require('../routes/sentinel'));
  t.after(app.close);
  const quiet = [console.log, console.error]; console.log = console.error = () => {};
  t.after(() => { [console.log, console.error] = quiet; });

  requests.length = 0;
  script = [{ finish_reason: 'stop', message: { role: 'assistant', content: 'The Lions play at 1 PM.' } },
            { finish_reason: 'stop', message: { role: 'assistant', content: 'Tomorrow: nothing.' } }];
  await app.call('POST', '/api/sentinel/chat', { message: 'when do the lions play' });
  await app.call('POST', '/api/sentinel/chat', { message: 'what about tomorrow' });
  const sent = requests[1].messages.map((m) => `${m.role}:${m.content}`);
  assert.deepEqual(sent.slice(1, 3), ['user:when do the lions play', 'assistant:The Lions play at 1 PM.']);
  assert.match(sent[3], /^user:\[Right now it is .+\]\n\nwhat about tomorrow$/, 'the time rides in the newest user turn');

  // 6 quiet minutes later: a fresh start
  const later = Date.now() + 6 * 60_000;
  assert.deepEqual(memory.recent(later), []);
  memory.remember('a', 'b'); memory.remember('c', 'd'); memory.remember('e', 'f'); memory.remember('g', 'h');
  assert.equal(memory.recent().length, 6, 'only the last 3 exchanges');
  memory.forget();
});
