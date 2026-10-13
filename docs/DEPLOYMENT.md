# Personal ChatGPT deployment

Version 0.2.5 has two real runtimes. The local Windows runtime queues speech to the computer's audio device. The hosted runtime implements streamable HTTP MCP and returns natural audio plus a compact browser player. Hosted speech waits for generation, and the browser may require Play for each clip. It does not intercept every assistant message or read private internal reasoning.

## Free hosting choice

Render Free is a practical first test host for this Node/Docker server. It provides an HTTPS `onrender.com` URL without requiring a custom domain. It sleeps after 15 minutes without incoming traffic and takes about a minute to restart. Free hosting has usage limits and is intended for personal prototypes, not dependable production service. Natural voice API usage is separately billed.

The repository includes `render.yaml` and a Dockerfile. Docker is not installed in the current development environment, so no container-build result is claimed.

## Configure authentication before public deployment

Use an OAuth 2.1 authorization server compatible with ChatGPT MCP discovery. Auth0's documented MCP integration is one option; any compatible provider can be used. Configure the provider with an API/resource audience, a `narrate` scope, an allowed personal account, and the supported client registration flow. ChatGPT uses OAuth; it cannot supply your private API key as a custom connector credential.

The application verifies asymmetric JWT signatures using the provider's JWKS, issuer, audience, expiry, issued-at age, and the `narrate` scope. It also checks an explicit owner subject allowlist. Configure tokens with a lifetime of two hours or less. An arbitrary provider that issues opaque tokens instead of signed JWTs needs an introspection adapter; this release does not silently accept opaque tokens.

Set these values in the hosting provider's environment settings, not source files:

| Variable | Value |
| --- | --- |
| `NARRATOR_PUBLIC_ORIGIN` | Actual HTTPS service origin, no path |
| `NARRATOR_AUTH_ISSUER` | Exact HTTPS issuer from your authorization provider |
| `NARRATOR_AUTH_JWKS_URL` | Provider's HTTPS public signing-key endpoint |
| `NARRATOR_AUTH_AUDIENCE` | Configured narration resource audience |
| `NARRATOR_ALLOWED_SUBJECTS` | Your allowed account's exact OAuth subject, or comma-separated allowed subjects |
| `OPENAI_API_KEY` | Secret set through the provider's secure environment interface |
| `PORT` | Listener port; blueprint uses 8787 |

Keep actual secrets, private account IDs, tokens and production configuration out of commits, chat, screenshots and ZIPs. No `.env` file is needed. The server fails startup if hosted authentication configuration is absent; there is no anonymous paid-speech mode.

## Deploy on Render

1. Put the source project in your own private Git repository and connect it to a Render account.
2. Create a Free web service from the blueprint, or select Docker with context `plugins/coding-narrator` and Dockerfile `plugins/coding-narrator/Dockerfile`.
3. Set the actual HTTPS origin and authentication values above. Set the API key using the host's secure secret input. Configure spending limits in your API project.
4. Deploy. Check `/health` returns version 0.2.5 and that `/mcp` without authorization returns 401 with a protected-resource discovery challenge.
5. Confirm `/.well-known/oauth-protected-resource` advertises your configured authorization server and `narrate` scope. Verify the provider's authorization-server metadata is reachable and client registration works before linking ChatGPT.

Do not run `--local-http` on a public host. That mode binds only `127.0.0.1` for SDK tests and trusted development. The normal hosted entrypoint binds the container listener and requires authentication on every MCP request. TLS terminates at Render's managed HTTPS edge; keep the container port internal.

## Add the personal plugin to ChatGPT

After deployment and OAuth setup:

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Select the plus button, then **Add custom MCP server**.
3. Use **Coding Narrator** as the name and the actual HTTPS service URL ending in `/mcp`.
4. Choose OAuth authentication, complete account authorization and the host's connection review, then create the personal plugin.
5. Confirm the discovered tools: `narrator_status`, `show_narrator`, `narrator_settings`, `add_narration_style`, and `speak_update`.
6. Install it for your account. In a new Work chat, select the plugin and ask it to show the narrator and speak a short sample.
7. Test default, caveman, custom skill, mute, volume, a denied account, and missing API setup. Check actual playback on the target desktop and mobile clients.

Personal connection availability depends on your ChatGPT plan/workspace controls. This project has not been linked to a ChatGPT account yet. There is no published public-directory listing or generated production endpoint.

## Package skills with the hosted plugin

Once the deployed URL is known, from `plugins/coding-narrator` run:

```powershell
npm.cmd run package -- chatgpt $actualMcpUrl
```

`$actualMcpUrl` must be your real HTTPS `/mcp` endpoint. The packager rejects credential-bearing URLs and refuses to generate a placeholder package. It produces a portable `plugin.json`, `mcp.json`, and bundled skills. Use your personal plugin import/package flow if available in your account; otherwise add the MCP connection first and invoke the speaking instructions in the chat. Public directory submission is a separate process requiring a verified publisher, metadata, policy URLs, scans and review. No hooks or private credentials are included.

## Private development alternative

[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) can connect a private local MCP endpoint to ChatGPT without public hosting. It requires a Platform tunnel, runtime API access, appropriate tunnel permissions and association with your ChatGPT workspace. Start `npm.cmd run dev:mcp` locally, then configure the officially supplied `tunnel-client` using Platform's current setup instructions. Never expose the local unauthenticated development port directly to the internet.

## Operational bounds

The hosted service uses a stateless MCP transport. Preferences are isolated per authenticated OAuth subject in a bounded in-memory map (100 users maximum) and expire after 30 minutes of inactivity or restart. Narration text/audio is not stored. Limits are ten generated clips per minute per subject, one in-flight generation per subject, eight concurrent HTTP requests globally, 600 text characters and about 3 MiB of PCM audio per clip. Generation has a 45-second deadline, cancellation, fixed OpenAI WSS destination and no automatic retries that could duplicate costs. Invalid raw provider errors are not printed.

These process-local limits are for one personal instance. Multiple replicas require shared rate limiting/preferences and aggregate spending controls. Free-host restarts discard preferences. Render/proxy logs and OpenAI/ChatGPT data handling are external to the application; review those providers before speaking private information.

## Sources

- [OpenAI MCP server deployment](https://developers.openai.com/plugins/build/mcp-server)
- [ChatGPT connection and testing](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Plugin OAuth requirements](https://developers.openai.com/plugins/build/auth)
- [MCP Apps interface](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Realtime speech protocol](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [TTS deprecations](https://developers.openai.com/api/docs/deprecations)
- [Render Free limitations](https://render.com/docs/free)
