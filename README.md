# Coding Narrator 0.2.4

Hear short coding progress updates in your preferred speaking style. A small mint dock provides mute, stop and live speech animation. The settings button expands voice controls and speaking skills. Narration is opt-in: the agent composes safe progress summaries and sends them to the tool. It does not expose private internal reasoning or automatically intercept every message.

## Included

- Local Windows voices work offline. One reusable speech worker avoids launching PowerShell for each update. Live status uses server-sent events instead of polling.
- A shared Windows playback turn prevents overlapping speech across agent sessions and voice providers on this user's desktop. Waiting sessions show their status and remain cancellable.
- Optional offline model voices: Kokoro Heart and Bella, Kitten Nano Bruno, and Piper LJ Speech. One Python worker keeps the selected engine warm; no API key is needed. See [local voice setup](docs/LOCAL-VOICES.md).
- Natural AI voice adapter with Marin and Cedar, cancellation and bounded generation. Requires server-side OpenAI API access and incurs API usage; disabled when access is absent.
- Clear, Caveman and Teacher presets, custom preferences, and SKILL.md import/export. The agent applies the selected instructions to future narration. Imported preferences do not execute code or grant permissions.
- Personal ChatGPT runtime with HTTP MCP, an embedded player, per-account preferences, OAuth validation and rate limits. Docker, Render Free blueprint and packaging scripts are included.

Local Windows speech and synthesis of all four selected offline model voices have been exercised. Live OpenAI speech, the Docker image and ChatGPT account integration still require external setup. See [validation evidence](VALIDATION.md).

## Install locally

Requires Windows, PowerShell 5.1 with System.Speech and an enabled voice, Node.js 20+, and Codex CLI/desktop with local plugins. Extract the source package into a permanent folder, then run from its root:

```powershell
.\install.ps1
```

The installer checks dependencies, tests and Windows synthesis, then installs the personal local plugin. It generates MCP configuration for this folder's absolute path. Keep the folder in place; rerun installation if moved. Existing Codex settings are preserved.

Restart Codex when convenient and begin a new chat with the plugin enabled. Ask:

> Use Coding Narrator to speak progress while you work. Use the caveman style and open the controls.

To try the player independently:

```powershell
cd .\plugins\coding-narrator
npm.cmd run demo
```

Open the printed `controlPanelUrl`. Click the settings button, then **Test voice** for a labeled sample. The circular control enables or mutes narration. Settings remain hidden until needed. The ring and bars animate during speech and stop when playback ends, is muted or cancelled; reduced-motion settings disable animation. This dock lives in the browser/plugin panel, not an operating-system overlay. Ctrl+C shuts down the demo.

## Claude Code and background triggers

Claude Code and other local stdio MCP clients can use the same server. Register it with Claude Code from the source root:

```powershell
.\install-claude.ps1
```

Then start a new Claude Code session, check `/mcp` and ask it to use Coding Narrator. The optional offline trigger helper can announce completed updates or attention events without requiring a model tool call. See [agent connections, async hooks and voice providers](docs/AGENT-INTEGRATIONS.md).

## Speaking skills

Select a preset or expand **Add a speaking skill**. Create a name and wording instructions, or import a small SKILL.md. Export the selected skill to reuse it. Local settings reset on process restart; hosted preferences expire after inactivity or restart.

```markdown
---
name: caveman
description: Short, playful spoken coding progress.
---

Use short, simple sentences. Keep technical facts accurate.
Say "Me checking tests" only when tests are actually being checked.
Apply this style only to spoken narration; keep code and documentation normal.
```

See [skill format and limits](docs/SPEAKING-SKILLS.md).

## Personal ChatGPT deployment

Follow [the Render and ChatGPT setup guide](docs/DEPLOYMENT.md). Render Free supplies HTTPS without a purchased domain, but idle services sleep and have usage limits. Natural voice API usage is separate from hosting.

Hosted mode requires a real HTTPS origin, compatible OAuth provider, explicit owner allowlist and secure server-side API configuration. No credentials belong in source or a package. The source ZIP alone is not an installed ChatGPT plugin.

After deploying, create the portable plugin package from `plugins/coding-narrator`:

```powershell
npm.cmd run package -- chatgpt $actualMcpUrl
```

Use your actual HTTPS `/mcp` endpoint. The hosted player returns a generated clip per spoken update. Browser autoplay rules may require Play for each clip. Use the player Stop control to stop delivered audio.

## Tools

| Tool | Local Windows | Hosted ChatGPT |
| --- | --- | --- |
| `narrator_status` | Voices, style, queue and counters | Voice readiness and account preferences |
| `speak_update` | Queue a safe update, up to 600 characters | Generate natural audio with a player |
| `narrator_settings` | Mute, provider, voice, volume, speed, style | Mute, voice, volume, speed, style |
| `add_narration_style` | Add/import a speaking preference | Add/import an account-scoped preference |
| `stop_narration` | Cancel speech and clear queue | Use the player Stop control |
| `show_narrator` | Control URL is returned by status | Open the embedded player |

Local speech queues at most five pending updates plus the current job per session. Full queues are reported; mute cancels queued audio. Each update keeps its submitted voice settings. Switching providers cancels pending updates, so queued offline text cannot be redirected to a cloud voice. The current job continues with its submitted provider until completion or Stop. Version 0.2.4 coordinates actual playback across updated narrator processes in the same user's Windows logon session, including Windows, installed model voices and locally played OpenAI audio. Model generation can run in parallel. Stop/Mute affect only that agent's work. Restart older narrator processes when updating; they do not contain the shared lock. This does not coordinate hosted browser players or audio from unrelated apps. See [coordination details](docs/PLAYBACK-COORDINATION.md). Completion cannot establish whether someone physically heard it.

The four selected open-source voices are available after the optional model installation. See [setup and voice names](docs/LOCAL-VOICES.md), [research and licenses](docs/OPEN-SOURCE-VOICES.md), and [comparison clips](docs/VOICE-TRIAL.md).

The local panel binds loopback and validates browser origin/Host. Hosted mode authenticates every MCP request and independently checks owner access. Narration history is not saved. See [architecture and performance](docs/ARCHITECTURE.md).

## Development and packaging

From `plugins/coding-narrator`:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd test
npm.cmd run check:windows
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run benchmark
npm.cmd run package -- source
```

The benchmark measures startup/voice lookup and warm command overhead, not speech duration or cloud latency. ZIP creation uses an explicit file allowlist and excludes dependencies, local absolute MCP configuration and environment files.

References: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [ChatGPT connection](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Realtime audio](https://developers.openai.com/api/docs/guides/realtime-conversations), [Render Free hosting](https://render.com/docs/free).
