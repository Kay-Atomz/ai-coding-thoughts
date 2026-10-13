# Independent critical review — 11 October 2026

## Version 0.2.5 incremental playback — 13 October 2026

The opposing reviewer independently tested the new stream gate with two real Windows workers: ownership remained held across an input gap and multiple clips, cancelling during an input gap released the turn, and a malformed later clip failed safely. Its final command, `node --test test/incremental-speech.test.mjs test/local-voices.test.mjs test/narrator.test.mjs`, passed 18 tests with zero failures. Source review checked one-segment lookahead/backpressure, cumulative audio limits, late-error propagation, warmup cancellation/restart, activation-only warming and stage timing semantics.

The cache helper was corrected to match the public phonemizer's platform-specific line handling; the reviewer independently matched five technical/multiline samples. It also verified that inference QoS changes affect only its own process and restore the previous policy after normal and exceptional exits. Review prompted checking the restoration result; failure now emits a static diagnostic and terminates the worker rather than retaining that policy while idle. Universal voice-quality/prosody equivalence is not claimed. The final re-review found no further actionable flaws within the inspected scope.

## Version 0.2.4 playback coordination — 13 October 2026

The opposing reviewer independently ran two real Windows workers, then ran `node --test test/playback-coordination.test.mjs` (2 passed, zero failed). It verified cross-process System.Speech/WAV exclusion, abandoned-owner recovery, cancellation isolation, playback-failure release, Heart default selection and waiting state. Source review covered synchronous OS-thread ownership in the shared C# gate, the one-shot audio path, bounded waits/watchdogs, stable per-user/logon-session naming and restart requirements. No further actionable runtime findings remained in the inspected scope. One documentation correction describes the brief waiter cancellation/termination race accurately. Hosted browser audio and older pre-lock processes are explicitly outside this local guarantee.

The earlier review history follows.

The user requested a separate opposing reviewer. The reviewer inspected executable code and relevant documentation without editing files, reproduced findings independently, then re-reviewed the fixes. The review covered the local queue/trigger, hosted player, JWT authentication, worker lifecycle, HTTP boundaries, packaging and the new open-source voice guide. This was a bounded source and test review, not proof that every possible flaw has been found.

| Finding | Severity | Resolution |
| --- | --- | --- |
| Ordinary Windows updates queued before a provider change could be submitted to OpenAI afterward. Only the special offline-trigger path was guarded. | P1 | Snapshot settings and voice direction at submission; cancel all pending entries when the provider changes. Active work stays with its submitted provider and can be stopped. Add a regression proving queued Windows text never reaches the cloud fixture. |
| The hosted volume slider changed only the current audio object; later tool results restored the previous server value. | P2 | Save the committed volume through `narrator_settings`; verify it survives a subsequent style result. |
| JWT verification URL-normalized the configured issuer, adding a trailing slash and rejecting valid signed tokens with an exact issuer that omitted it. | P2 | Validate the configured URL separately, preserve its exact identifier for JWT comparison and OAuth metadata; test valid and mismatching issuer strings with genuine in-memory signatures. |

The reviewer independently ran this command from `plugins/coding-narrator` after the fixes:

```powershell
node --test test/auth.test.mjs test/narrator.test.mjs test/widget.test.mjs test/local-trigger.test.mjs
```

Result: **13 passed, zero failed**. The primary agent's final full suite passed **25 tests**. See [validation commands](../VALIDATION.md).

The second review found **no further actionable findings within the inspected scope**. The voice guide distinguishes research from installed providers, model size from runtime footprint, publisher grades from local listening tests, and code/weight/dependency licensing. One reviewer fetch of the Kitten ONNX documentation timed out; the exact Nano model card remained accessible, and the primary agent retrieved the runtime documentation successfully.

At that 0.2.2 review, model voices had not yet been auditioned or integrated. Live-account OpenAI synthesis, actual ChatGPT player rendering, Docker build/hosted deployment and a live Claude model-task narration test remain unverified.

## Version 0.2.3 local voices

The opposing reviewer re-reviewed the four selected voices, worker reuse, startup/generation deadlines, cancellation, model-switch recovery, PCM validation, offline provider pinning, safe diagnostics, installer and source packaging. Its independent fixture command was:

```powershell
node --test plugins/coding-narrator/test/local-voices.test.mjs plugins/coding-narrator/test/local-trigger.test.mjs plugins/coding-narrator/test/narrator.test.mjs
```

Final result: **16 passed, zero failed**, including bounded cleanup-failure and process-tree command tests. Review prompted stricter PCM chunk validation and packaging/documentation corrections. Implementation also resets model state before a potentially failed engine switch and releases failed Kokoro sessions. Subsequent real Windows inspection exposed the venv launcher's child Python process; cancellation now terminates the owned process tree, and shutdown waits within a deadline. Lazy inference imports keep catalog discovery separate from first-use model loading. The final re-review found no further actionable source findings within its inspected scope. No review or fixture test establishes subjective voice quality. See [current validation evidence](../VALIDATION.md) for real-model and device checks.
