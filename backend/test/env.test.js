const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findUnparsedLines } = require('../lib/env');

const check = (text) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, text);
  return findUnparsedLines(f);
};

test('valid lines, comments, blanks and export are fine', () => {
  assert.deepEqual(check('A=1\n# comment\n\nexport B=2\nC=\n'), []);
});

test('JS syntax pasted from code is flagged (regression: Govee key never loaded)', () => {
  const out = check('A=1\nconst GOVEE_API_KEY = "secret";\n');
  assert.equal(out.length, 1);
  assert.match(out[0], /line 2 \(GOVEE_API_KEY\)/);
});

test('two lines glued together are flagged (regression: Hue username + Govee key)', () => {
  const out = check('HUE_USERNAME=abcdef123GOVEE_API_KEY=\n');
  assert.equal(out.length, 1);
  assert.match(out[0], /HUE_USERNAME.*GOVEE_API_KEY=/);
});

test('values that merely contain "=" are not false positives', () => {
  assert.deepEqual(check('TOKEN=YWJjZGVm==\nURL=https://x.test/?a=b\n'), []);
});

test('never echoes the secret value', () => {
  const out = check('const GOVEE_API_KEY = "super-secret-value";\n').join(' ');
  assert.ok(!out.includes('super-secret-value'));
});

test('example placeholders count as not set (regression: Tesla showed ✅ with your_tesla_client_id)', () => {
  const { isPlaceholder, validateEnv } = require('../lib/env');
  assert.ok(isPlaceholder('your_tesla_client_id'));
  assert.ok(isPlaceholder('your-api-key'));
  assert.ok(isPlaceholder('<paste here>'));
  assert.equal(isPlaceholder('abc123real'), false);
  assert.equal(isPlaceholder('yourtube-ish-but-real'), false);
  const saved = { ...process.env };
  const logs = [];
  const orig = console.log;
  console.log = (m = '') => logs.push(String(m));
  try {
    Object.assign(process.env, { TESLA_CLIENT_ID: 'your_tesla_client_id', TESLA_CLIENT_SECRET: 'your_tesla_client_secret' });
    delete process.env.FRONTEND_URL; delete process.env.TESLA_REDIRECT_URI; delete process.env.PORT;
    const tesla = validateEnv().find((s) => s.name === 'Tesla');
    assert.equal(tesla.enabled, false);
    assert.deepEqual(tesla.placeholders, ['TESLA_CLIENT_ID', 'TESLA_CLIENT_SECRET']);
    assert.ok(logs.some((l) => /Tesla.*still the example placeholder/.test(l)));
    assert.ok(!logs.join('\n').includes('your_tesla_client_id'), 'never prints the value');
  } finally { console.log = orig; process.env = saved; }
});
