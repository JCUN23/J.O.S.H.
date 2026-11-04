// Registered faces for the lock screen, shared by every device.
// Face lock runs in the browser (face-api.js); the server only stores descriptors
// (128 numbers per face, derived from a photo; not the photo itself).
//
// `initialized` distinguishes "never set up" (a device may upload its local faces
// once) from "deliberately emptied" (don't let a stale device resurrect them).
const express = require('express');
const path = require('path');
const { createJsonStore } = require('../lib/jsonStore');

const router = express.Router();
const store = createJsonStore(
  process.env.FACES_STORE_PATH || path.join(__dirname, '..', 'data', 'faces.json'),
  { label: 'Face store' }
);

const MAX_FACES = 20;
const DESCRIPTOR_LEN = 128; // face-api.js faceRecognitionNet output

function validateFaces(faces) {
  if (!Array.isArray(faces)) return 'faces must be an array';
  if (faces.length > MAX_FACES) return `at most ${MAX_FACES} faces`;
  for (const f of faces) {
    if (!f || typeof f !== 'object') return 'each face must be an object';
    if (typeof f.name !== 'string' || !f.name.trim() || f.name.length > 64) return 'face name must be 1-64 characters';
    if (!Array.isArray(f.descriptor) || f.descriptor.length !== DESCRIPTOR_LEN || !f.descriptor.every(Number.isFinite)) {
      return `face descriptor must be ${DESCRIPTOR_LEN} numbers`;
    }
  }
  return null;
}

router.get('/api/faces', (req, res) => {
  const saved = store.get('faces');
  res.json({ initialized: saved !== null, faces: saved || [] });
});

router.put('/api/faces', (req, res) => {
  const faces = req.body?.faces;
  const problem = validateFaces(faces);
  if (problem) return res.status(400).json({ error: problem });
  const clean = faces.map(({ id, name, descriptor, registeredAt }) => ({
    id: Number.isFinite(id) ? id : Date.now(),
    name: name.trim(),
    descriptor,
    registeredAt: typeof registeredAt === 'string' ? registeredAt : new Date().toISOString(),
  }));
  store.set('faces', clean);
  res.json({ initialized: true, faces: clean });
});

module.exports = router;
