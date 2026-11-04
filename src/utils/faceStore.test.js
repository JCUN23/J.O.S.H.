import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncFaces, saveFaces, getCachedFaces } from './faceStore';

const face = (name = 'Josh') => ({ id: 1, name, descriptor: Array(128).fill(0.01) });
const reply = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('faceStore', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('uploads this device\'s faces once when the server was never set up', async () => {
    localStorage.setItem('registered_faces', JSON.stringify([face()]));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply({ initialized: false, faces: [] }))
      .mockImplementationOnce((url, opts) => reply({ initialized: true, faces: JSON.parse(opts.body).faces }));
    const faces = await syncFaces();
    expect(faces).toHaveLength(1);
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });

  it('never resurrects faces deleted on another device', async () => {
    localStorage.setItem('registered_faces', JSON.stringify([face('stale')]));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply({ initialized: true, faces: [] }));
    expect(await syncFaces()).toEqual([]);
    expect(getCachedFaces()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no upload
  });

  it('keeps working from the cache when the backend is down', async () => {
    localStorage.setItem('registered_faces', JSON.stringify([face()]));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await syncFaces()).toHaveLength(1);
  });

  it('saveFaces throws on rejection instead of silently diverging', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply({ error: 'face descriptor must be 128 numbers' }, 400));
    await expect(saveFaces([face()])).rejects.toThrow(/128 numbers/);
  });
});
