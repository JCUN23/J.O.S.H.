const test = require('node:test');
const assert = require('node:assert/strict');
const { tempStores, startApp } = require('./helpers');

tempStores();
const face = (over = {}) => ({ id: 1, name: 'Josh', descriptor: Array(128).fill(0.01), ...over });

test('faces API', async (t) => {
  const app = await startApp(require('../routes/faces'));
  t.after(app.close);

  await t.test('a fresh server reports initialized: false', async () => {
    const r = await app.call('GET', '/api/faces');
    assert.deepEqual(r.body, { initialized: false, faces: [] });
  });

  await t.test('rejects bad descriptors, names and counts', async () => {
    for (const faces of [
      [face({ descriptor: [1, 2, 3] })],
      [face({ descriptor: [...Array(127).fill(0), 'x'] })],
      [face({ name: '   ' })],
      Array(21).fill(face()),
      'nope',
    ]) {
      const r = await app.call('PUT', '/api/faces', { faces });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    }
  });

  await t.test('saves a clean copy (trimmed, unknown fields dropped)', async () => {
    const r = await app.call('PUT', '/api/faces', { faces: [face({ name: ' Josh ', extra: 'drop me' })] });
    assert.equal(r.status, 200);
    assert.equal(r.body.faces[0].name, 'Josh');
    assert.deepEqual(Object.keys(r.body.faces[0]).sort(), ['descriptor', 'id', 'name', 'registeredAt']);
  });

  await t.test('deleting everything keeps initialized: true (no resurrection)', async () => {
    await app.call('PUT', '/api/faces', { faces: [] });
    const r = await app.call('GET', '/api/faces');
    assert.deepEqual(r.body, { initialized: true, faces: [] });
  });
});
