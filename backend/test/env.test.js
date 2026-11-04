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
