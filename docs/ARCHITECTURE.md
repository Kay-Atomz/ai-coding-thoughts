# Architecture and performance

## Local path

Codex composes a safe progress summary → `speak_update` → bounded serial Narrator queue → provider → Windows audio device. The offline provider reuses a hidden PowerShell process and one System.Speech synthesizer. Voice discovery happens once. Cancellation kills the active worker and subsequent work restarts it; normal consecutive sentences reuse the same process. Shutdown closes the worker, queue, HTTP listener and SSE streams.

The natural provider generates PCM through the OpenAI Realtime API, converts it to a WAV in memory and sends it to the same reusable worker for playback. No audio files are written. Server-side `OPENAI_API_KEY` configuration enables that provider; without it, natural voice is explicitly unavailable in the controls. A new per-utterance Realtime connection avoids retained conversation context and voice-change constraints. It is not a warmed continuous voice session.

The browser panel receives status via one SSE connection. It does not poll every second. Heartbeats every 25 seconds keep the connection healthy; clients close on page teardown, and slow readers are dropped instead of accumulating output. There are at most eight connected panels. The server caches static assets when it starts; restart the demo after changing HTML/CSS/JS.

The 0.2.1 mini dock is 340 by 118 CSS pixels with settings closed on the tested viewport. The ring and bars use CSS animation only while the speech state is active. They indicate activity rather than measured amplitude. Reduced-motion preferences suppress animation; no microphone or audio analyser is used. Its settings panel expands explicitly and the embedded host is notified of size changes.

An independent local trigger can submit safe summaries or fixed Claude event announcements to an existing dashboard. It validates the loopback destination and pins the selected Windows or open-source offline provider. The server enforces that restriction before acceptance and again when queued playback starts; switching providers cancels pending offline events. The Claude installer registers the same stdio server through the official CLI without changing other server entries. Background hooks remain opt-in.

Version 0.2.3 adds an optional Python ONNX worker for four installed model voices. It loads one engine at a time, caps inference at four CPU threads, keeps the selected engine warm and synthesizes PCM16 mono WAV in memory. The Node boundary validates the WAV chunks before Windows playback. Generation has a 120-second deadline, a 65-second audio limit and a 3 MiB size cap. Stop terminates an active generation process; cancellation during playback retains the idle model. Shutdown closes both workers. The dock reports preparation separately from playback; its animation indicates activity rather than audio amplitude. No automatic model downloads or cloud fallback occur during speech. See [setup](LOCAL-VOICES.md).

Version 0.2.5 adds background Heart warmup, cached public eSpeak backend reuse, disabled idle thread spinning and incremental local playback. `speech-segments.mjs` preserves the supplied words, prefers sentence/clause boundaries and limits the initial segment to eight words. Later segments are larger; splitting can affect prosody. The producer generates at most one segment ahead. `AudioGate.PlayStream` acquires once and retains ownership across every segment and input gap, with bounded cumulative bytes/duration/count. Late errors cancel inference and the device stream and count as failures. Request-to-playback, first-chunk, queue wait, generation and audio timings remain separate from the full active-job duration. See [performance](VOICE-PERFORMANCE.md).

Version 0.2.2 snapshots every update's provider, voice, volume, rate and voice direction at submission. Any provider change cancels the pending backlog; it does not redirect existing text or stop the active job. Stop and Mute cancel that active job. The hosted player saves committed volume changes through account settings, and JWT issuer validation preserves the exact configured identifier rather than URL-normalizing it.

Cold Windows initialization has a 30-second deadline. Before actual audio, the worker acquires a named Windows mutex shared by this user and logon session; all acquisition, playback and release execute synchronously on one OS thread in `AudioGate.cs`. The turn waits up to three minutes and actual playback has a separate two-minute deadline. The Node wait watchdog allows 30 additional seconds for protocol/cleanup overhead. Killing an owner abandons the mutex; the next waiter safely acquires it. Killing a waiter leaves the owner alone. Errors release the turn in `finally`. The legacy one-shot default-device helper also uses the gate; file-only synthesis does not. No text, keys, audio or files are stored in the mutex. Cancelling playback terminates only the owning worker, so its next job incurs a cold start. Hosted widget assets are also cached once per server process.

## Hosted path

HTTPS edge → OAuth/JWT and personal owner authorization → stateless MCP transport → per-user ephemeral preferences/rate limit → natural speech provider → generated MCP audio content and MCP Apps player. No hosted process tries to use the developer's speakers. The browser player owns its Audio resource, volume and stop state. It uses bounded data media supported by the default MCP Apps policy, and releases the audio source on teardown or replacement. No external audio URL is needed.

Each hosted clip is bounded and waits for complete generation. The player may require a click to play because of browser autoplay policies. It does not promise continuous automatic background narration across rendered cards. Tool-call completion means generated audio, not human-confirmed playback. Unconfigured natural voice returns an explicit error and no audio payload.

## Code boundaries

| Module | Responsibility |
| --- | --- |
| `src/narrator.mjs` | Local queue, cancellation, settings, observable status |
| `src/windows-worker.mjs` and `scripts/speech-worker.ps1` | Reusable Windows process and audio-device lifetime |
| `scripts/AudioGate.cs` | Cross-process playback exclusion, bounded wait and abandoned-owner recovery |
| `src/local-voices.mjs` and `scripts/local-voice-worker.py` | Optional CPU model worker, PCM validation, generation/playback cancellation |
| `src/realtime-voice.mjs` | Fixed OpenAI WSS integration, cancellation, bounds, PCM/WAV encoding |
| `src/styles.mjs` | Bounded speaking profiles and SKILL.md parsing |
| `src/dashboard.mjs` | Loopback controls, static assets, SSE, browser request isolation |
| `src/auth.mjs` | Hosted OAuth-resource metadata, JWT verification and owner allowlist |
| `src/hosted-state.mjs` | Per-user preference lifetime and generation limits |
| `src/hosted-tools.mjs` | Hosted tools, audio results and player resource |
| `src/http-server.mjs` | Stateless MCP HTTP transport and request lifecycle |
| `web/` | Local control UI and MCP Apps player |

## Measurement

`npm.cmd run benchmark` compares the previous one-shot Windows process startup/voice lookup with reusable worker startup, then measures ten warm command round trips. It measures process/command overhead, not synthesis duration, time to first audible sample or cloud latency. `workerProcessesStarted` must be one for a normal warm sequence. See the recorded run in `VALIDATION.md`.

## Verification and remaining production work

Local tests exercise real Windows worker startup/reuse/cancellation and a real SDK stdio connection. Hosted tests exercise a real SDK HTTP connection, settings isolation, audio-result packaging and missing-configuration behavior. API protocol tests use controlled WebSocket events; they do not establish live model availability, voice quality or billing access. OAuth signature tests use ephemeral signing keys in memory and never save them.

Before production, exercise the configured authorization provider and the real natural model, test the player in actual ChatGPT desktop/mobile clients, build/run the Docker image, validate the HTTPS edge and secrets setup, and measure real audio latency. Shared persistence/limits are required before running multiple replicas.
