# One speaking narrator at a time

Version 0.2.4 gives updated local agents one shared playback turn in the same user's Windows logon session. A Codex update can use Kokoro Heart while Claude uses Bruno or Windows; their actual audio cannot overlap. Locally played OpenAI WAV audio uses the same boundary. Generating clips remains independent and can happen concurrently.

Each runtime keeps its own settings and bounded queue. When prepared speech meets a busy audio device, the dock shows **Waiting for another narrator…** without a speech animation. The waiting tool call was already acknowledged, so the agent continues coding. The shared turn is exclusive rather than a strict merged FIFO queue. It waits at most three minutes; a busy timeout reports a safe failure instead of bypassing the lock. Playback has its own two-minute deadline.

Stop or Mute cancels only that session's current/waiting job and pending queue. Cancelling a waiter terminates its worker without interrupting the current owner. If the owner releases its turn during the brief termination race, the waiter may acquire it before termination; it still cannot overlap the previous owner's audio. If the owner crashes or is terminated, Windows abandons the mutex and the next waiter recovers ownership; no stale lock file needs removing. A playback error releases ownership before another session proceeds.

The gate lives in `scripts/AudioGate.cs`, called by both Windows worker speech and generated WAV playback, plus legacy default-device speech. Acquisition, audio and release happen on one OS thread, as required by [Microsoft's mutex documentation](https://learn.microsoft.com/en-us/dotnet/standard/threading/mutexes). Its name is stable across plugin versions and installation paths and scoped by the current Windows user and logon session. It stores no narration history, audio or credentials.

## Updating

Install 0.2.4, then restart narrator runtimes in existing Codex/Claude sessions. An already running older Node process does not gain the new protocol or lock by replacing source files. New runtimes use Kokoro Heart by default when installed and Windows otherwise. The controls expose the selected provider/voice.

This protects local Narrator audio on this desktop. It does not mute unrelated apps, coordinate separate Windows users/logon sessions/computers, or arbitrate the hosted ChatGPT browser players. Hosted deployment and browser autoplay behavior remain as documented in [deployment](DEPLOYMENT.md).

## Verification

`node --test test/playback-coordination.test.mjs` runs two real hidden PowerShell workers with silent device audio, asserts non-overlapping monotonic audio intervals, kills an owner, cancels a waiter, and checks recovery after a malformed WAV. It also checks Heart default selection and generated-provider waiting/cancellation state. See [validation evidence](../VALIDATION.md).

With the optional models installed, `node scripts/check-model-coordination.mjs` runs independent Kokoro Heart and Kitten Bruno Python workers, prepares real clips and tests their serialized device playback with silenced PCM. No clips are saved.
