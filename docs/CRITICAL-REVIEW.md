# Independent critical review — 11 October 2026

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
