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


class FollowUpTest(unittest.TestCase):
    def test_follow_up_only_after_a_real_answer_and_never_after_music(self):
        heard = {'text': 'turn on the lights', 'handledBy': 'panel'}
        self.assertTrue(L.follow_up_allowed(heard, {'speaking': False, 'followup': True}))
        self.assertFalse(L.follow_up_allowed(heard, {'speaking': False, 'followup': False}), 'music started')
        self.assertFalse(L.follow_up_allowed(heard, {'speaking': True, 'followup': True}), 'still talking')
        self.assertFalse(L.follow_up_allowed({'text': '', 'handledBy': None}, {}), 'nothing heard')
        self.assertTrue(L.follow_up_allowed({'text': 'x', 'handledBy': 'pi', 'followup': True}, {}))
        self.assertFalse(L.follow_up_allowed({'text': 'play jazz', 'handledBy': 'pi', 'followup': False}, {}))

    def test_follow_up_window_is_shorter_to_start(self):
        # nobody speaks within the follow-up window -> nothing, after ~start_timeout
        v, t = run(L.Endpointer(60, start_timeout=6.0), frames((10, 50)))
        self.assertEqual(v, 'nothing')
        self.assertAlmostEqual(t, 6.0, delta=0.1)


class SpeechOverTv(unittest.TestCase):
    def test_normal_voice_counts_at_twice_the_room(self):
        # Nov 9: room 300 with the TV on, Josh talking at ~700 - missed at 3x, heard at 2x
        self.assertEqual(run(L.Endpointer(300), frames((0.3, 300), (1.2, 700), (1.5, 300)))[0], 'done')
        self.assertEqual(run(L.Endpointer(300, ratio=3.0), frames((0.3, 300), (1.2, 700), (5, 300)))[0], 'nothing')


class FakeMic:
    def __init__(self, levels):
        self.levels = list(levels)
    def frame(self):
        level = self.levels.pop(0) if self.levels else 0
        return np.full(L.FRAME, level, dtype=np.int16)


class DuckSettle(unittest.TestCase):
    def test_music_alone_is_kept_but_is_not_speech(self):
        # Nov 11: TV at ~900 kept playing for ~1s after the mute was sent
        n = int(1.0 / L.FRAME_S)
        frames, spoke = L.wait_for_duck(FakeMic([900] * n + [100] * 50), 900)
        self.assertEqual(len(frames), n + 1)
        self.assertFalse(spoke)

    def test_talking_over_the_music_is_kept_and_counts(self):
        # Nov 11: "Play Discover Weekly on the Frame" came out "Weakly on the frame"
        frames, spoke = L.wait_for_duck(FakeMic([900, 2500, 2600, 2400] * 10), 900)
        self.assertTrue(spoke)
        self.assertLessEqual(len(frames) * L.FRAME_S, 1.5 + L.FRAME_S)

    def test_record_keeps_the_prefix_audio(self):
        cfg = type('C', (), dict(end_silence=1.0, max_s=10.0, min_level=60.0, speech_ratio=2.0))()
        prefix = [np.full(L.FRAME, 2500, dtype=np.int16)] * 5
        verdict, frames, _ = L.record(cfg, FakeMic([100] * 40), 120, prefix=prefix, started=True)
        self.assertEqual(verdict, 'done')
        self.assertEqual(len(frames[:5]), 5)
        self.assertTrue(all(L.rms(f) > 2000 for f in frames[:5]))


class FakeModel:
    def __init__(self, scores):
        self.scores = list(scores)
    def predict(self, frame):
        return {'alfred': self.scores.pop(0) if self.scores else 0.0}


class FakeApi:
    def __init__(self, speaking_polls):
        self.n = speaking_polls
    def get(self, path, timeout=5):
        self.n -= 1
        return {'speaking': self.n >= 0, 'followup': True}


class BargeIn(unittest.TestCase):
    def test_alfred_over_the_reply_is_caught(self):
        model = FakeModel([0.1] * 5 + [0.9])
        st = L.wait_until_quiet(FakeApi(100), grace=0.05, timeout=5, mic=FakeMic([100] * 400), model=model, barge=0.7)
        self.assertEqual(st, {'barged': 0.9})

    def test_his_own_voice_below_the_bar_does_not_cut_him_off(self):
        model = FakeModel([0.6] * 400)
        st = L.wait_until_quiet(FakeApi(2), grace=0.05, timeout=5, mic=FakeMic([100] * 400), model=model, barge=0.7)
        self.assertNotIn('barged', st)
        self.assertFalse(st['speaking'])

    def test_off_without_a_mic(self):
        st = L.wait_until_quiet(FakeApi(1), grace=0.01, timeout=2)
        self.assertNotIn('barged', st)
