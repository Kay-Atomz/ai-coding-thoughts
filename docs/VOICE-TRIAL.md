# Local voice trial — 11 October 2026

The user requested synthesized examples of the researched voices. This initial comparison trial uses downloaded ONNX models and CPU inference. It did not use a cloud key, clone a person's recording or change narrator settings. The subsequent 0.2.3 implementation integrates four of these voices; see [local voice setup](LOCAL-VOICES.md). All six comparison clips use the same explicitly labeled demo text:

> This is a voice demo for Coding Narrator. Here is a sample progress update: I am checking the code, reviewing the tests, and preparing the next change. You can keep working while this update plays.

Models and an isolated Python environment live in `.voice-lab`, which is ignored and is not part of the plugin source package. Clips are under `.voice-lab/samples`. `models/downloads.json` records exact source URLs, revisions where available, file sizes and SHA256 hashes computed after download. Those hashes record this trial's files; they are not an independent publisher-signature verification. `installed-packages.json` records all installed package versions. Generated WAVs are mono PCM16, with finite non-silent samples and validated WAV framing.

The Kokoro trial uses the community `kokoro-onnx` runtime and its documented v1.0 ONNX release assets, rather than the original PyTorch runtime. Kitten uses the explicitly selected Nano 0.8 int8 model at revision `84781d74e29ee25217551556398b42f80593a813`, through the ONNX-only portion of `kittenml` 0.9.4. No KittenTTS 2 weights were downloaded. Piper uses `en_US-ljspeech-high` for a personal comparison; see the [license distinctions](OPEN-SOURCE-VOICES.md).

Sources: [Kokoro ONNX setup/assets](https://github.com/thewh1teagle/kokoro-onnx), [Kitten lightweight runtime](https://github.com/KittenML/KittenTTS/blob/main/docs/onnx-models.md), [Nano model](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8), [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md).

## Reproduction

From the project root, the actual bundled Python 3.12.14 executable used to create the environment was:

```powershell
& 'C:/Users/Katlego Mgibi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -m venv .voice-lab/venv
```

The effective ONNX-only setup and synthesis commands are:

```powershell
& ./.voice-lab/venv/Scripts/python.exe -m pip install --disable-pip-version-check 'kokoro-onnx==0.6.1' 'soundfile==0.13.1' 'piper-tts==1.8.0'
& ./.voice-lab/venv/Scripts/python.exe -m pip install --disable-pip-version-check --no-deps 'kittenml==0.9.4'
& ./.voice-lab/venv/Scripts/python.exe -m pip install --disable-pip-version-check 'huggingface_hub==2.2.0'
& ./.voice-lab/venv/Scripts/python.exe ./voice-lab/download-models.py
& ./.voice-lab/venv/Scripts/python.exe ./voice-lab/synthesize-samples.py kitten
& ./.voice-lab/venv/Scripts/python.exe ./voice-lab/synthesize-samples.py kokoro
& ./.voice-lab/venv/Scripts/python.exe ./voice-lab/synthesize-samples.py piper
```

Kokoro uses four inference threads and one inter-operation thread. Kitten/Piper retain runtime defaults, so these are initial trial timings, not a controlled ranking between engines. Cold load includes imports and model/session initialization. Generation includes phonemization and full clip synthesis; it is not time to first streamed or audible sample.

## Initial measurements

| Voice | Clip duration | Full generation | Cold model load |
| --- | --- | --- | --- |
| Kokoro Heart | 11.82 s | 8.772 s | 11.433 s |
| Kokoro Bella | 12.06 s | 7.945 s | Shared Kokoro load |
| Kitten Jasper | 14.97 s | 16.790 s | 21.259 s |
| Kitten Luna | 16.88 s | 13.624 s | Shared Kitten load |
| Kitten Bruno | 14.47 s | 6.091 s | Shared Kitten load |
| Piper LJ Speech | 12.23 s | 15.474 s | 18.213 s |

All three final synthesis commands exited successfully. An independent WAV inspection verified all six files' mono PCM16 headers, sample rates and nonzero frames; `verified-samples.json` records clip hashes. Sound quality and whether the user heard playback remain user listening checks.

## Setup limitations and corrected attempts

An older Kitten 0.8 wheel was downloaded and inspected. Its full-dependency installation attempt was interrupted before installation to avoid overlapping package installation and an unnecessary larger dependency stack. The trial instead uses the current runtime's documented lightweight ONNX path. The installed Kitten package lists additional KittenTTS 2 dependencies as missing; this is an intentional ONNX-only environment, not a complete install of every backend. No clean `pip check` result is claimed.

The first Kitten import needed `huggingface_hub`; installing that package corrected it. A code-inspection print hit Windows' default encoding on Unicode source comments, and one guessed upstream source path returned 404. An exploratory read targeted a nonexistent legacy preprocess path. A documentation patch failed because its context did not match; the corrected patch added this measurement table. None affected synthesis. All model downloads completed, and every final synthesis command completed successfully. The user must listen to judge pronunciation, naturalness and artifacts; successful generation alone does not establish subjective quality.
