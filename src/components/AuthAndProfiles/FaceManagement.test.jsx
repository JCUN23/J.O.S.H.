import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const saved = [];
vi.mock('../../utils/faceStore', () => ({
    syncFaces: async () => [],
    saveFaces: async (faces) => { saved.push(...faces); return faces; },
}));
vi.mock('../../utils/faceApiLoader', () => ({ loadFaceApi: async () => window.faceapi, FACE_MODEL_URL: 'x' }));
import FaceManagement from './FaceManagement';

beforeEach(() => {
    const net = { loadFromUri: async () => {} };
    window.faceapi = {
        nets: { tinyFaceDetector: net, faceLandmark68Net: net, faceRecognitionNet: net },
        TinyFaceDetectorOptions: class {},
        detectSingleFace: () => ({ withFaceLandmarks: () => ({ withFaceDescriptor: async () => ({ descriptor: new Float32Array([0.1, 0.2]) }) }) }),
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
});
afterEach(() => { cleanup(); delete window.faceapi; saved.length = 0; });

describe('FaceManagement', () => {
    it('registering a face hands off on its own (no close button, no second scan)', async () => {
        const onRegistered = vi.fn();
        const onClose = vi.fn();
        render(<FaceManagement onClose={onClose} onRegistered={onRegistered} />);
        const name = await screen.findByPlaceholderText(/Enter name/);
        fireEvent.change(name, { target: { value: 'Josh' } });
        fireEvent.click(screen.getByText(/START CAMERA/));
        fireEvent.click(await screen.findByText('CAPTURE FACE'));
        await waitFor(() => expect(saved.length).toBe(1));
        expect(saved.map((f) => f.name)).toEqual(['Josh']);
        await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1), { timeout: 2500 });
        expect(onRegistered.mock.calls[0][0].name).toBe('Josh');
        expect(onClose).not.toHaveBeenCalled();
    });
});
