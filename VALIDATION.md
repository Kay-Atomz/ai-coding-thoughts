# Prototype validation — updated 11 October 2026

No GoTo app files were edited. This is a separate Node/PowerShell project, so Flutter checks do not apply.

## Version 0.2.3 selected offline voices — 11 October 2026

Installed and integrated Kokoro Heart/Bella, Kitten Nano 0.8 int8 Bruno and Piper LJ Speech into the local Windows narrator. The source package excludes downloaded models, Python environments and generated clips. The hosted ChatGPT runtime remains the existing OpenAI adapter; live OpenAI/account deployment, Docker execution and a Claude model-task narration test remain unverified.

| Exact command | Result |
| --- | --- |
| `.\install-local-voices.ps1 -PythonCommand 'C:/Users/Katlego Mgibi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'` (source root) | Passed in the existing isolated Python 3.12 environment; pinned direct dependencies and all public model assets present. This was not a fresh-computer installer test. |
| `npm.cmd run check` | Passed: syntax/manifests for 32 JavaScript files. |
| `npm.cmd test` | Final run: 31 passed, zero failed/skipped; includes real Windows worker and SDK stdio MCP checks. |
| `npm.cmd run check:windows` | Passed: 2 enabled Windows voices and a valid 163,158-byte synthesized WAV. |
| `npm.cmd audit --omit=dev --audit-level=high` | Passed: zero vulnerabilities reported. |
| `node scripts/check-local-voices.mjs` | Passed actual four-model synthesis, generation cancellation/restart, volume-zero and faster-rate checks. |
| `node scripts/check-local-voices.mjs --silent-playback` | Final run passed all four real-model generations, silent Windows device playback, generation cancellation, playback cancellation/restart, volume and rate. Captured the owned venv launcher and descendant PIDs; cancellation finished within 5 seconds and neither PID remained alive. Two Python worker spawns across the cancelled start and subsequent warm work. |
| `node --test plugins/coding-narrator/test/local-voices.test.mjs plugins/coding-narrator/test/local-trigger.test.mjs plugins/coding-narrator/test/narrator.test.mjs` (source root) | Independent final reviewer: 16 passed, zero failed. |
| `codex plugin add coding-narrator@coding-narrator-local` (source root) | Passed: installed version 0.2.3. |
| `codex plugin list --marketplace coding-narrator-local --json` (source root) | Confirmed installed and enabled version 0.2.3. |
| `npm.cmd run package -- source` | Passed: verified source archive with 64 entries. An inline Node/fflate assertion checked version 0.2.3, installer, worker, model-download helpers and guide, and exclusion of model assets, dependencies, local MCP configuration and caches. |

The narration skill passed the exact historical `quick_validate.py` invocation below with `PYTHONPATH` set to this project's `.validation` folder. An inline Python `compile()` pass checked the worker and both voice-lab scripts without creating bytecode. Source packaging is verified separately below.

The final silent device run generated valid non-silent source WAVs before zeroing PCM only for device playback: Heart 213,898 bytes/17,781 ms, Bella 222,156 bytes/5,226 ms, Bruno 368,444 bytes/8,085 ms and Piper 214,572 bytes/21,142 ms. These are one-run full-generation times under concurrent activity, not a controlled latency/quality benchmark. Each phrase included its voice label, so phrase lengths differ. The earlier fresh Heart narrator update reached completed=1, failed=0; completion does not establish that the user heard it. The user's later mute selection was preserved.

Corrections and limitations: the first `--play` smoke was deliberately interrupted when the panel was found muted (exit 1), then completed checks used silent playback. A real Windows venv launches a child Python interpreter; launcher-only cancellation was corrected to bounded process-tree termination. Heavy imports moved to first use to avoid delaying MCP catalog discovery. The suite's cleanup warning is expected only in the injected failure regression. During inspection, two file reads used incorrect source/script paths and were corrected; no files were changed by those reads. Python transitive dependencies remain resolved by pip, and the lightweight Kitten environment intentionally omits unused KittenTTS 2 backend dependencies; no clean `pip check` or complete redistributed-runtime license review is claimed.

## Version 0.2.2 critical review and voice research — 11 October 2026

The independent reviewer reproduced three defects and re-reviewed their fixes: ordinary queued speech changing provider after submission, hosted volume reverting, and JWT issuer URL normalization. See [review evidence and limits](docs/CRITICAL-REVIEW.md). The open-source voice guide identifies candidates only; no new voice runtime or model was installed.

Commands ran in `plugins/coding-narrator` unless stated otherwise:

| Exact command | Result |
| --- | --- |
| `npm.cmd test` | Passed twice: all 25 tests, no failures/skips/timeouts, including the final version 0.2.2 run |
| `npm.cmd run check` | Passed: 29 JavaScript files and manifests |
| `npm.cmd run check:windows` | Passed: 2 voices, valid 163,158-byte WAV |
| `node --test test/auth.test.mjs test/narrator.test.mjs test/widget.test.mjs test/local-trigger.test.mjs` | Independent reviewer: 13 passed, zero failed |
| `codex plugin add coding-narrator@coding-narrator-local` (source root) | Passed: installed version 0.2.2 |
| `codex plugin list --marketplace coding-narrator-local --json` (source root) | Confirmed installed and enabled version 0.2.2 |
| `npm.cmd run package -- source` | Passed: 55-file source archive, round-trip verified |

An independent inline Node/fflate archive inspection through `node --input-type=module` verified version 0.2.2, both new guides, all 55 entries, and exclusion of environment files, dependencies, local MCP configuration and validation cache. The exact assertion script was:

```javascript
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
const archive = unzipSync(readFileSync('../../dist/coding-narrator-source-0.2.2.zip'));
const paths = Object.keys(archive);
assert.equal(JSON.parse(strFromU8(archive['plugins/coding-narrator/package.json'])).version, '0.2.2');
assert.ok(archive['docs/OPEN-SOURCE-VOICES.md']);
assert.ok(archive['docs/CRITICAL-REVIEW.md']);
assert.ok(paths.every(p => !p.split('/').some(part => part.startsWith('.env') || part === 'node_modules' || part === '.mcp.json' || part === '.validation')));
assert.equal(paths.length, 55);
```

Two exploratory `Get-Content` reads targeted nonexistent `src/profiles.mjs` and `scripts/check.mjs`; they failed and made no changes. Actual modules are `src/styles.mjs` and `scripts/check-source.mjs`. All final executable checks passed. One primary GitHub license-page request returned 503 and one Piper voice-card URL was unavailable; canonical raw eSpeak NG license and alternative primary model cards were retrieved. No UI visual change was made in this patch, so no new screenshot is claimed. Hosted volume is covered by a simulated browser/host regression, not live ChatGPT rendering.

Live OpenAI, ChatGPT deployment, Docker, Claude model-task use and candidate open-source voice quality/performance remain unverified. Earlier evidence below describes earlier versions, not additional current claims.

## Version 0.2.1 mini dock and agent connections

| Exact command | Result |
| --- | --- |
| `claude --version` | Claude Code 2.1.296 is installed |
| `claude mcp add --help` | Verified CLI syntax and supported stdio/user scope |
| `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./install-claude.ps1` (source root) | Passed; registered coding-narrator in user scope using the real Node executable and server path |
| `claude mcp get coding-narrator` (source root) | Exit 0, Connected; output filtered to a safe connected boolean before display |
| `npm.cmd test` | Final run passed all 23 tests, 0 failed/skipped; earlier 22-test run passed before the offline-provider race regression was added |
| `npm.cmd run check` | Passed; 29 JavaScript files and manifests |
| `npm.cmd run check:windows` | Passed; 2 enabled voices, valid 163,158-byte WAV |
| `node src/server.mjs --demo` | Started the new dock successfully on a random loopback port |
| `codex plugin add coding-narrator@coding-narrator-local` (source root) | Passed; installed/refreshed 0.2.1 |
| `codex plugin list --marketplace coding-narrator-local --json` (source root) | Verified 0.2.1 installed and enabled |

The CLI smoke check piped the following safe playback sample into `node scripts/trigger-local.mjs --panel-url` with the actual running panel URL: "This is a playback sample of the compact narrator. The ring and bars move while the voice is active. The settings stay hidden until needed. The coding agent can continue working while this short sample plays in the background." It returned `Narration queued` before audio finished. No transcript or agent output was read.

Browser verification expanded/collapsed the settings button, used Test voice, and showed Speaking during playback and Ready afterward. DOM measurement confirmed 340 by 118 CSS pixels with settings closed. The final panel reported two completed playback samples; `preview-mini.jpg` shows the complete compact dock. A browser animation-introspection method was not exposed by the read-only DOM tool; an attempted cropped screenshot did not align with the current viewport. The complete screenshot was saved instead. The production CSS uses speech-state animation and a reduced-motion override.

New regression tests cover the real loopback trigger, mute, bounded/foreign destinations, event metadata without transcript/output access, rejection of cloud providers, backend enforcement across a status/submit race, and cancellation of pending offline notifications after a provider switch. The existing embedded-player regression also verifies the new settings disclosure. Hosted UI tests use fixtures and remain separate from actual ChatGPT rendering.

Claude CLI connection health is verified; model selection of the tools in a real Claude task has not been run. Optional async hook configuration is documented but was not enabled globally or exercised by a live Claude session. The previous demo was stopped with Ctrl+C after the browser moved to the compact demo; its exit code 1 was the intentional termination. No test failure or test timeout occurred in the 0.2.1 runs.

User chose to retain Windows and OpenAI. No additional speech-provider adapter or API key was created. Natural voice still needs API access and has not had a live smoke test. Hosting, OAuth account setup, Docker execution and ChatGPT connection remain unverified as recorded below. Dependency versions did not change in this release; no additional audit was run.

`npm.cmd run package -- source` regenerates the 0.2.1 source ZIP with the Claude installer, offline trigger and integration guide. The package verifier round-trips ZIP entries, checks its explicit file allowlist and excludes environment files, dependencies, validation cache and local absolute MCP configuration.

## Version 0.2.0 release checks

Commands below ran from `plugins/coding-narrator` unless stated otherwise. Earlier version 0.1.0 evidence remains below for history.

| Exact command | Result |
| --- | --- |
| `npm.cmd install --save-exact --ignore-scripts --no-audit --no-fund jose@6.2.12 ws@8.22.0 yaml@2.9.1` | Passed; dependencies pinned and lockfile updated |
| `npm.cmd run check` | Passed; syntax checked 26 JavaScript files and parsed manifests |
| `npm.cmd test` | Final run passed 20 tests, 0 failed/skipped; installer passed the 19-test suite before the final player-bridge regression test was added |
| `npm.cmd run check:windows` | Passed; 2 enabled voices, valid 163,158-byte WAV; temporary output removed |
| `npm.cmd audit --omit=dev --audit-level=high` | Passed; 0 vulnerabilities |
| `npm.cmd run benchmark` | Passed; measurements recorded below |
| `node src/server.mjs --demo` | Started the revised player at a random loopback port |
| `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./install.ps1` (project root) | Passed; dependency install, 19 tests, Windows validation and plugin installation |
| `codex plugin add coding-narrator@coding-narrator-local` (project root) | Passed; refreshed bundled skill after documentation clarification |
| `codex plugin list --marketplace coding-narrator-local --json` (project root) | Verified version 0.2.0 installed and enabled |

All three bundled skills (`narrate-coding`, `caveman`, `narration-style`) passed `quick_validate.py`. The narration skill was revalidated after its local/hosted wording clarification. Invocation uses the Python and validator paths shown in the historical section below, changing only the skill directory argument.

The real Windows stdio test discovered all five local tools and verified unavailable natural voice, caveman settings and shutdown. Real HTTP SDK tests verified hosted discovery, embedded resource delivery, settings and explicit missing-API errors. A separate HTTP test verified 401 with OAuth discovery, authenticated initialization, foreign-origin rejection and request cleanup. JWT tests generated signing keys only in memory. Natural voice WebSocket and audio packaging tests use protocol fixtures; they do not constitute live API speech. The player bridge regression executes the real widget script with isolated DOM/host fixtures, covering initialization, data media, Play/Stop state, context-update request IDs and resource disposal. It does not establish rendering in ChatGPT.

### Measured command overhead

One recorded `npm.cmd run benchmark` run reported:

| Measurement | Value |
| --- | --- |
| Previous one-shot process startup and voice lookup | 457 ms |
| Reusable worker startup and voice lookup | 374 ms |
| Warm command round-trip median (10 commands) | 0.69 ms |
| Warm command round-trip p90 | 1.18 ms |
| Worker processes started for the warm sequence | 1 |

These numbers measure process/command overhead only, not synthesis duration, audible latency or natural API latency. Cold starts vary with desktop load. Cancellation deliberately restarts the worker.

### Browser verification

Opened the revised local player in the Codex browser. Selecting Caveman and Test voice reached Speaking, then Ready with a completed update. The final panel reported two completed updates after an additional sample. Expanded voice settings showed the natural provider disabled with a setup explanation. Added the custom Calm speaking preference through the form and verified its selected option. Mute showed Narration muted; re-enabling restored Ready. Restored the previously selected Teacher style and collapsed settings. Saved `preview-v2.jpg`.

This validates synthesis completion and visible state on the default Windows audio device; it does not establish what a person physically heard. This is the local player, not a screenshot of a live ChatGPT integration.

### Failures corrected and unavailable checks

- Initial checks after the feature upgrade had outdated expectations for the four-tool list and 4 KB request limit. Tests were updated for the fifth tool and the bounded skill-import request size; the 17-test run passed.
- After adding two lifecycle/authentication tests, one run passed 18 of 19. The Windows worker hit its 10-second cold-start deadline under desktop load. The production startup deadline is now bounded at 30 seconds, and real Windows test budgets allow initialization/restart. All 19 subsequently passed, including the installer run. No final execution timeout remains.
- One terminal attempt to write README text was rejected by execution policy. The document was successfully updated using the file patch tool instead.
- Two semantic browser clicks did not match disclosure elements. Fresh accessibility state identified the controls; native browser accessibility clicks expanded them successfully. An initial browser binding was absent after context restoration and was rebound to the existing tab.
- Markdown-page retrieval and one guessed UI reference URL failed; the canonical official HTML documentation and its reference link were retrieved successfully.
- Final MCP Apps specification review found that the default media policy allows data media but does not promise blob media. The hosted player now uses bounded data audio and declares inline display support; its model-context update uses a request with an ID, as required. The added bridge regression passed, bringing the final suite to 20 tests.
- No OpenAI API access was configured, so live natural voice, voice quality, billable generation and real API latency are **unverified**. The provider stays unavailable when its key is absent.
- Docker is not installed, so the Docker image was **not built or run**.
- No Render/OAuth account was connected and no HTTPS endpoint was deployed, so ChatGPT plugin installation and actual ChatGPT widget rendering are **not complete**. The source package and instructions prepare those steps without claiming success.

`npm.cmd run package -- source` generated and round-trip verified the source ZIP. An independent Node/fflate inspection verified the version, deployment guide and Dockerfile, and confirmed that local MCP configuration, environment files, validation cache and dependencies were absent. A child invocation of `node scripts/package.mjs chatgpt` without an endpoint failed with the expected missing-URL message and generated no hosted package. The final archive contains 48 files. Public plugin-directory submission is outside this personal release.

## Commands and results

Unless otherwise stated, commands ran in `C:\Users\Public\Downloads\coding-narrator\plugins\coding-narrator`.

| Command | Result |
| --- | --- |
| `npm.cmd install --ignore-scripts --no-fund --no-audit` | Passed; installed 95 packages |
| `npm.cmd test` | Final run passed all 8 tests, none skipped |
| `npm.cmd run check:windows` | Passed; 2 enabled voices and a valid 163,158-byte WAV; temporary output removed |
| `npm.cmd audit --omit=dev --audit-level=high` | Passed; 0 vulnerabilities reported |
| `node src/server.mjs --demo` | Started local control panel successfully |
| `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ./install.ps1` | Passed from the project root; ran `npm.cmd ci --ignore-scripts --no-audit --no-fund`, tests and Windows validation, then registered and installed the plugin |
| `codex plugin marketplace add C:\Users\Public\Downloads\coding-narrator` | Passed via the installer |
| `codex plugin add coding-narrator@coding-narrator-local` | Passed via the installer |
| `codex plugin list --marketplace coding-narrator-local --json` | Used to verify the local installation |
| `codex mcp list --json` | Narrator entry filtered before printing; reported enabled |

Skill validation passed with the exact PowerShell invocation:

```powershell
$env:PYTHONPATH = 'C:/Users/Public/Downloads/coding-narrator/.validation'
& 'C:/Users/Katlego Mgibi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' 'C:/Users/Katlego Mgibi/.codex/skills/.system/skill-creator/scripts/quick_validate.py' 'C:/Users/Public/Downloads/coding-narrator/plugins/coding-narrator/skills/narrate-coding'
```

## Initial failures and corrections

- The first `npm.cmd test` failed because Node 20 on Windows did not expand `test/*.test.mjs`. The npm script now uses `node --test` discovery.
- The next test run passed 7 of 8 tests. The foreign-Host test failed because the Fetch client replaced the supplied Host header. The test now uses Node's HTTP client to send the actual foreign header. All 8 then passed, including the real Windows MCP connection.
- The first `quick_validate.py` invocation failed because the bundled Python lacked PyYAML. Installed only the validator dependency into this project's ignored `.validation` folder using `python -m pip install --target C:/Users/Public/Downloads/coding-narrator/.validation PyYAML==6.0.3 --disable-pip-version-check`, then reran successfully with that folder on `PYTHONPATH`.
- No validation timeouts occurred.

## Visible and audio-device checks

Opened the local panel in the Codex browser. Verified Mute switched to Muted and Unmute restored Ready to speak. Played the three labeled sample updates through the default Windows audio device. The panel progressed from Speaking with two pending updates to Ready to speak, zero queued, three completed, zero failed. Saved `preview.jpg` at that final state.

This confirms the Windows synthesis job completed against the configured audio device. It cannot establish whether the user physically heard audio or whether system volume was audible. The MCP integration test connected an SDK client to the real server, discovered all four tools, controlled mute/state, validated invalid arguments, and checked that disconnect closes the panel.

The current chat cannot acquire newly installed tools mid-turn. After a convenient Codex restart, request narration in a new chat to verify desktop host loading and skill invocation. Automatic interception of all commentary messages is outside this prototype; Codex explicitly sends safe summaries to its speech tool.
