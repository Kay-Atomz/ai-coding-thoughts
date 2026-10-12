# Agent connections and background narration

## Agent-driven speech

Coding Narrator exposes standard MCP tools. Codex, Claude Code and other clients that support local stdio MCP can invoke them. The local server runs on Windows and returns a queue acknowledgement immediately; actual speech continues in its worker while the agent resumes coding. A host may still require its normal tool approval. The plugin does not bypass host approvals or interrupt an active agent to inject another user message.

An agent that produces only a final answer will not automatically narrate intermediate work. Ask it explicitly to send concise progress through `speak_update`. Neither MCP nor this plugin grants access to private internal reasoning.

## Claude Code

From the Coding Narrator source root, after installing dependencies:

```powershell
.\install-claude.ps1
```

This uses Claude's CLI to register `coding-narrator` in user scope, making it available across projects. It does not replace other server entries or write API keys. A duplicate name stops installation instead of overwriting existing configuration. For a project-local registration, run `./install-claude.ps1 -Scope local` from the desired directory. Keep the source in its permanent location.

Start a new Claude Code session and check `/mcp`. Ask:

> Use Coding Narrator's MCP tools to speak short progress summaries while you work. Check narrator_status, select the caveman style, and open its control panel. Continue coding after each queue acknowledgement.

Other clients can use `node` with the absolute path to `plugins/coding-narrator/src/server.mjs` as a stdio server. A hosted agent running on a different computer cannot play through this Windows computer without a separate authenticated connection. Use one local narrator process at a time to avoid overlapping voices across clients.

## Independent offline triggers

`scripts/trigger-local.mjs` talks to an already running loopback panel. It does not send a message to the coding agent or wait for audio to finish. It accepts Windows or the installed open-source offline provider and refuses cloud providers. It pins the selected provider and rejects a switch between status and submission. The service must remain running; mute and queue limits still apply. See [model setup and agent voice names](LOCAL-VOICES.md).

Start `npm.cmd run demo`, take its actual printed `controlPanelUrl`, and assign that URL to `$actualControlPanelUrl` in another terminal. To submit a safe summary:

```powershell
'An update is ready in your chat.' | node ./scripts/trigger-local.mjs --panel-url $actualControlPanelUrl
```

The script is in `plugins/coding-narrator`; run from that directory or use its absolute path. It accepts up to 600 text characters and acknowledges queueing, not confirmed playback. It validates the loopback destination, bounds input and timeouts, does not retry, and saves no output history. The server enforces the offline policy at acceptance and playback; pending offline events are cancelled if the provider changes. Do not pipe unrestricted terminal output, credentials or file contents into it.

## Optional Claude background hooks

Claude Code supports background command hooks with `async: true`. The helper's `--claude-hook` mode reads only event metadata from stdin: `Stop` announces an update is finished, and selected `Notification` events announce attention is needed. It ignores `last_assistant_message` and `transcript_path` entirely. These are event announcements, not summaries of hidden work or automatic reading of final answers.

Before launching the Claude session, set `NARRATOR_PANEL_URL` to the actual running offline panel URL in that terminal. Add the following entries to your chosen Claude settings file using its normal settings workflow, preserving existing hooks. The command path below is this source installation's real path; adjust it if you moved the source.

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{
      "type": "command",
      "command": "node C:/Users/Public/Downloads/coding-narrator/plugins/coding-narrator/scripts/trigger-local.mjs --claude-hook",
      "async": true
    }] }],
    "Notification": [{ "matcher": "permission_prompt|idle_prompt", "hooks": [{
      "type": "command",
      "command": "node C:/Users/Public/Downloads/coding-narrator/plugins/coding-narrator/scripts/trigger-local.mjs --claude-hook",
      "async": true
    }] }]
  }
}
```

These hooks are optional and are not automatically installed globally. They return no blocking decisions or instructions to the model. A closed or misconfigured narrator reports a static delivery failure and does not block the agent. Claude may terminate background hooks when a noninteractive session exits, so this is not a guaranteed persistent notification system. Hook mode uses fixed event wording; custom speaking preferences are applied by the agent to its own submitted narration.

Reading arbitrary final answers aloud would require another explicitly chosen adapter and privacy rules. No screen scraping, transcript reading or interception of every assistant message is implemented.

## Other voice APIs

An API key alone cannot identify or implement an arbitrary speech API. Providers differ in endpoint, authentication, model/voice identifiers, response format, streaming and billing. This release supports Windows, the four optional offline model voices and the existing OpenAI adapter; it does not advertise unsupported providers as available.

Once a provider adapter is implemented, the UI can select it without restarting the coding task. Secure credential setup, voice selection and cancellation must be completed first. Credentials should remain in the backend/secure setup flow, never in browser storage, agent chat, tool output or source packages. A new provider must honor the same bounded queue, cancellation, timeout and no-history behavior. It should have a protocol test and an actual-account smoke test before being described as working.

For example, ElevenLabs requires provider-specific authentication and a `voice_id`, so it needs more than an unlabelled key. A provider selector with supported adapters can make onboarding simple, but arbitrary endpoints are not accepted by this release.

Sources: [Claude MCP configuration](https://code.claude.com/docs/en/mcp), [Claude asynchronous hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background), [ElevenLabs speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
