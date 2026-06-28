# phovia-plugin

Phovia plugin for Claude Code — SessionStart/Stop memory hooks, an on-demand memory search MCP tool, and a device-auth login helper.

## Install

In Claude Code:

```text
/plugin marketplace add PhoviaAI/phovia-plugin
/plugin install phovia
```

The Phovia Brain API URL defaults to the hosted service `https://api.phovia.ai/api` — leave it as-is for normal use. Only self-hosters need to change it: set `PHOVIA_BRAIN_URL`, pass `--brain` to login, or set the plugin option during install. The helper accepts either an API base ending in `/api` or a service origin.

## Login

Run the plugin command:

```text
/phovia:phovia login
```

Some Claude Code builds may expose the root command as `/phovia login`; if so, that form is equivalent.

The helper starts the Phovia device authorization flow:

1. `POST <brain-origin>/api/auth/device/start`
2. prints the `user_code` and opens `verification_uri_complete` in your browser
3. polls `POST <brain-origin>/api/auth/device/token`
4. writes `access_token` + `refresh_token` to `~/.phovia/auth.json`

The token file is written with `0600` permissions on POSIX systems; its directory is `0700`.

You can also run the CLI helper from a Bash tool while the plugin is enabled:

```bash
phovia login --brain https://brain.example.com
phovia status
phovia logout
```

## Hooks

- `SessionStart` calls `POST {brain}/insight/recall` with `Authorization: Bearer <access_token>` and injects returned profile/insight text into Claude context.
- `UserPromptSubmit` performs a cheap per-session "already loaded" marker check before each user prompt. If `SessionStart` did not successfully load memory (for example because the network was down or login had not happened yet), it silently retries recall and injects memory once the token/network is available.
- `Stop` calls `POST {brain}/insight/ingest` with the last assistant message and a bounded transcript tail.

If a hook receives `401`, it calls `POST <brain-origin>/api/auth/token/refresh` with the refresh token, updates the token file, and retries once. If refresh fails or tokens are missing, hooks exit successfully; `SessionStart`/`Stop` may show a reconnect hint to run `/phovia:phovia login` (or `/phovia login` if available), while `UserPromptSubmit` stays silent and retries on the next prompt.

## On-demand memory search

The plugin also starts a local stdio MCP server named `phovia-memory`. It exposes one tool:

- `search_memory(query: string, limit?: number)` — searches Phovia long-term memory via `POST {brain}/memory/search` and returns readable fact snippets to Claude.

Use this when Claude needs a specific fact during a conversation, for example "What was the status of that project we discussed before?" This is different from `SessionStart` recall:

- `SessionStart` recall injects a small, stable profile/context summary automatically at the beginning of a session.
- `search_memory` is called on demand during the session for targeted facts that are too specific or too numerous to inject upfront.

The MCP server uses the same local `~/.phovia/auth.json` device tokens as the hooks. If the access token is expired or rejected, it refreshes through `POST <brain-origin>/api/auth/token/refresh` and retries once. If you are not logged in or refresh fails, the tool returns a friendly prompt to run `/phovia login` (or `/phovia:phovia login` if your build namespaces plugin commands) instead of crashing.

Claude Code installs the MCP SDK dependencies into the plugin data directory on first session start and reuses them across plugin updates. The MCP server requires the `node` executable used by Claude Code to be Node.js 18 or newer.

## Configuration

Environment variables:

- `PHOVIA_BRAIN_URL` — override the configured brain URL.
- `PHOVIA_TOKEN_FILE` — override the token file path for development/tests.

The device-auth brain contract is from WO-066. On-demand search depends on brain WO-069 B1 (`/memory/search`) being available.
