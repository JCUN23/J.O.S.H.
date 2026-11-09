# Wake word models

| File | Say | Source | License |
|---|---|---|---|
| `alfred.onnx` | "Alfred, …" | [home-assistant-wakewords-collection](https://github.com/fwartner/home-assistant-wakewords-collection) (`en/alfred`), © 2023 Florian Wartner | MIT |

Built-in openWakeWord models (`hey_jarvis`, …) download on install instead of living here.

Pick with `VOICE_WAKE_MODEL` in `backend/.env`: a file name here without `.onnx`, a
built-in name, or a comma list to listen for several (`alfred,hey_jarvis`).

Tested Nov 9 2026 with three synthetic voices: "Alfred, turn off the lights" 0.86-0.89,
"Hey Alfred" 0.60-0.85, ordinary sentences (incl. "fettuccine alfredo", "call Fred",
"Hey Jarvis") 0.00-0.01. Leading with "Alfred" (no "hey") scores highest.
