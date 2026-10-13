# Offline model voices

The Windows local runtime supports the four selected voices: **Kokoro Heart**, **Kokoro Bella**, **Kitten Bruno** (Nano 0.8 int8), and **Piper LJ Speech** (en_US-ljspeech-high). Speech is synthesized on this computer and played through its Windows audio device. No API key is needed.

## Setup

Install the main plugin first. From the source root, with Python 3.12 installed:

```powershell
.\install-local-voices.ps1 -PythonCommand python
```

An absolute Python 3.12 executable path also works. The installer creates `.voice-lab/venv`, installs pinned direct dependencies and downloads about 496 MB of public model assets into `.voice-lab/models`. Dependencies and the Python environment add disk usage. Installation needs internet; normal narration uses offline inference. These downloads are optional and excluded from source packages. Transitive Python dependencies are resolved by pip; they are not a complete locked dependency set.

Restart the narrator process after installation. Open its settings, choose **Open-source · offline**, then a voice. Startup discovers fixed model files and installed module names; heavy imports and model loading happen on first use. If files or modules are missing, the provider stays unavailable. Broken dependencies or invalid models fail synthesis with a safe error; there is no automatic cloud fallback. Windows voices remain selectable.

## Agent selection

Ask an agent with Coding Narrator loaded:

> Check narrator_status. Select provider local and voice kokoro-heart, then speak short progress summaries while you work.

| Label | Tool voice name |
| --- | --- |
| Kokoro · Heart | `kokoro-heart` |
| Kokoro · Bella | `kokoro-bella` |
| Kitten · Bruno | `kitten-bruno` |
| Piper · LJ Speech | `piper-ljspeech` |

Use only names returned by the current status. Codex and Claude Code use the same MCP interface. Existing chats retain their loaded tool schema; begin a new chat to load the installed release. The optional background trigger helper also accepts this offline provider and pins the provider at submission to prevent rerouting.

Kokoro Heart is the default for a new local runtime when its files/modules are discovered. Without Heart installed, Windows remains the offline default; no cloud provider is chosen automatically. User selection can override the default for that process. Across updated local agent sessions, prepared audio waits for a shared playback turn before it reaches the speakers. See [coordination](PLAYBACK-COORDINATION.md).

## Performance and controls

Heart warms silently on first status/control use; unused agent connections do not load it. The dock shows **Warming Heart…** during idle warmup and **Preparing voice…** for an active request. A single Python worker keeps one engine warm; switching between Heart and Bella reuses Kokoro, while switching engines releases the previous model. All three engines use four CPU threads with idle spinning disabled. A short initial segment plays while the next is prepared, with one shared turn retained across the complete update. See [latency and measurements](VOICE-PERFORMANCE.md).

Volume and speed affect synthesis; Stop cancels generation or playback and clears the queue. Cancellation during generation terminates that worker; the next update creates a new one. Stop during playback retains the idle model. Mute also cancels current and pending work. Requests are limited to 600 characters, 120 seconds of generation, 65 seconds of audio and 3 MiB of WAV data. Queue limits remain unchanged. The runtime saves no narration history or generated clips.

For a custom local installation, set `NARRATOR_LOCAL_PYTHON` to its Python executable and `NARRATOR_LOCAL_MODELS` to the model directory before starting the server. These variables configure local paths, not credentials.

From `plugins/coding-narrator`, the optional real-model check is `node scripts/check-local-voices.mjs`. Add `--play` to deliberately hear its labelled samples. Use `--silent-playback` to test Windows playback/cancellation with zeroed device audio. These checks require the installed models and are separate from the normal test suite; they do not save clips.

The hosted ChatGPT runtime continues to use its existing OpenAI adapter. These Windows offline engines are not deployed to the hosted service by this release. See [recorded trial](VOICE-TRIAL.md), [license distinctions](OPEN-SOURCE-VOICES.md), and [validation](../VALIDATION.md).
