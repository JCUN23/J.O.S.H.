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
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'what time is it' });
    assert.equal(r.status, 200);
    assert.equal(r.body.response, 'It is 10pm.');
    const sent = requests.at(-1);
    assert.equal(sent.model, 'openai/gpt-oss-120b');
    assert.equal(sent.reasoning_effort, 'low');
    assert.ok(sent.max_tokens >= 1024, 'room for reasoning tokens');
    assert.ok(!JSON.stringify(requests).includes('llama-3.3'));
  });

  await t.test('tool loop: history sent back to Groq has no reasoning field', async () => {
    requests.length = 0;
    script = [
      { finish_reason: 'tool_calls', message: { role: 'assistant', content: null, reasoning: 'need the time',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_time', arguments: '{}' } }] } },
      { finish_reason: 'stop', message: { role: 'assistant', content: 'Done.' } },
    ];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'what time is it' });
    assert.equal(r.status, 200);
    const second = requests[1].messages;
    const echoed = second.find((m) => m.role === 'assistant');
    assert.ok(echoed.tool_calls, 'tool calls kept');
    assert.equal('reasoning' in echoed, false, 'reasoning stripped');
    assert.ok(second.some((m) => m.role === 'tool' && m.tool_call_id === 'c1'));
  });

  await t.test('Groq rejection -> 502 with the reason (regression: silent "not sure how to help")', async () => {
    script = [httpError(404, { error: { message: 'The model `llama-3.3-70b-versatile` has been decommissioned' } })];
    const r = await app.call('POST', '/api/sentinel/chat', { message: 'hi' });
    assert.equal(r.status, 502);
    assert.match(r.body.detail, /decommissioned/);
    assert.equal(r.body.model, 'openai/gpt-oss-120b');
  });
});
