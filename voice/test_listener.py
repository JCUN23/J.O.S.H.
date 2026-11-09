# python3 -m unittest voice/test_listener.py  (needs numpy only)
import io
import os
import tempfile
import unittest
import wave

import numpy as np

import listener as L


def frames(*spans):
    """spans of (seconds, rms) -> list of per-frame rms values"""
    out = []
    for secs, level in spans:
        out += [level] * round(secs / L.FRAME_S)
    return out


def run(ep, levels):
    for i, lv in enumerate(levels):
        v = ep.push(lv)
        if v != 'more':
            return v, round((i + 1) * L.FRAME_S, 2)
    return 'more', None


class EndpointerTest(unittest.TestCase):
    def test_command_then_pause_is_done(self):
        v, t = run(L.Endpointer(100), frames((0.3, 50), (1.5, 2000), (2, 50)))
        self.assertEqual(v, 'done')
        self.assertAlmostEqual(t, 0.3 + 1.5 + 1.0, delta=0.1)

    def test_short_mid_sentence_pause_does_not_end_it(self):
        v, t = run(L.Endpointer(100), frames((1, 2000), (0.6, 50), (1, 2000), (2, 50)))
        self.assertEqual(v, 'done')
        self.assertGreater(t, 3.4)

    def test_silence_after_wake_is_nothing(self):
        self.assertEqual(run(L.Endpointer(100), frames((6, 60)))[0], 'nothing')

    def test_tail_of_the_wake_word_is_not_the_command(self):
        # loud for 0.16 s right after the wake, then quiet: not a command
        self.assertEqual(run(L.Endpointer(100), frames((0.16, 3000), (6, 60)))[0], 'nothing')

    def test_loud_room_raises_the_bar(self):
        # TV at rms 900: talking at 1500 doesn't clear 3x noise; a raised voice does
        self.assertEqual(run(L.Endpointer(900), frames((2, 1500), (5, 900)))[0], 'nothing')
        self.assertEqual(run(L.Endpointer(900), frames((0.3, 900), (1, 4000), (2, 900)))[0], 'done')

    def test_quiet_mic_in_a_quiet_room_still_counts_as_speech(self):
        # Josh's UM02 (Nov 8 mic check): room ~35, normal talking 100-300
        v, t = run(L.Endpointer(35), frames((0.3, 35), (0.5, 160), (0.2, 90), (0.6, 220), (1.5, 35)))
        self.assertEqual(v, 'done')
        self.assertAlmostEqual(t, 0.3 + 1.3 + 1.0, delta=0.1)

    def test_never_stops_talking_caps_at_max(self):
        v, t = run(L.Endpointer(100, max_s=4), frames((10, 2000)))
        self.assertEqual((v, t), ('done', 4.0))


class NoiseFloorTest(unittest.TestCase):
    def test_the_wake_word_does_not_count_as_the_room(self):
        # Nov 8: 4 s of room at ~80, then 1 s of "hey jarvis" at ~400 right before the wake
        levels = [80] * 50 + [400] * 12
        floor = L.noise_floor(levels)
        self.assertLess(floor, 100)
        # and the command after it (talking at 300-900) clears the bar
        v, _ = run(L.Endpointer(floor), frames((0.3, 80), (1.2, 450), (1.5, 80)))
        self.assertEqual(v, 'done')

    def test_empty_window(self):
        self.assertEqual(L.noise_floor([]), 0.0)


class HelpersTest(unittest.TestCase):
    def test_wav_is_16k_mono_16bit(self):
        data = L.to_wav(np.zeros(1600, dtype=np.int16))
        with wave.open(io.BytesIO(data)) as w:
            self.assertEqual((w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()), (16000, 1, 2, 1600))

    def test_env_file_parsing_and_override(self):
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as f:
            f.write('# comment\nVOICE_TOKEN="abc123"\nVOICE_THRESHOLD=0.6\nOTHER=x=y\n')
        try:
            os.environ['VOICE_MIC'] = 'Jabra'
            c = L.Config(f.name)
            self.assertEqual((c.token, c.threshold, c.mic, c.model, c.speaker), ('abc123', 0.6, 'Jabra', 'alfred', 'auto'))
            self.assertEqual(L.load_env(f.name)['OTHER'], 'x=y')
        finally:
            os.unlink(f.name)
            del os.environ['VOICE_MIC']

    def test_models_resolve_to_local_files_or_builtins(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, 'alfred.onnx'), 'wb').close()
            self.assertEqual(L.resolve_models('alfred, hey_jarvis', d), [os.path.join(d, 'alfred.onnx'), 'hey_jarvis'])
        self.assertEqual(L.wake_phrase('alfred'), 'Alfred')
        self.assertEqual(L.wake_phrase('hey_jarvis,alfred'), 'Hey Jarvis')
        # the shipped model is where the default points
        self.assertTrue(L.resolve_models('alfred')[0].endswith(os.path.join('models', 'alfred.onnx')))

    def test_speaker_setting(self):
        self.assertIsNone(L.find_speaker('none'))
        self.assertEqual(L.find_speaker('plughw:3,0'), 'plughw:3,0')


if __name__ == '__main__':
    unittest.main()
