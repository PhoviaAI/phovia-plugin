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

- `SessionStart` calls `POST {brain}/insight/recall` with `Authorization: Bearer <access_token>` and injects returned profile/insight text into Claude context. It also runs a throttled, fail-safe stale-version check (see [Staying up to date](#staying-up-to-date)).
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

## Staying up to date

A cached, out-of-date plugin can keep running a broken code path long after a fix
ships. Two layers shrink that window:

**Auto-update (recommended).** Let Claude Code pull new plugin versions for you by
enabling auto-update on the Phovia marketplace. Either toggle it in the UI
(`/plugin` → **Marketplaces** → **phovia** → enable auto-update) or set the
marketplace policy in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "phovia": {
      "source": { "source": "github", "repo": "PhoviaAI/phovia-plugin" },
      "autoUpdate": true
    }
  }
}
```

With this on, Claude Code refreshes the marketplace and updates installed plugins
at startup, so a returning user lands on the latest version without running
`claude plugin update phovia` manually.

**Stale-version detection (self-heal).** The `SessionStart` hook also compares the
installed plugin version against the latest published manifest. If the installed
version is behind, it surfaces a loud, actionable `systemMessage` with the exact
update commands. This check is throttled (at most once per `PHOVIA_VERSION_CHECK_TTL_MS`,
default 6h) via a small `~/.phovia/version-check.json` cache and **always fails
safe** — any network or parse error is swallowed and never blocks the session or
suppresses memory recall.

> Auto-update only *shrinks* the stale window — it does not close the deploy
> ordering race where the backend ships a breaking change before clients update.
> It must be paired with contract tests that prevent shipping drift and with
> backward-compatible server contract evolution (accept old + new during a
> migration window).

To update manually from a terminal:

```bash
claude plugin update phovia
```

Then restart Claude Code so the newly installed plugin process is loaded.

## Configuration

Environment variables:

- `PHOVIA_BRAIN_URL` — override the configured brain URL.
- `PHOVIA_TOKEN_FILE` — override the token file path for development/tests.
- `PHOVIA_DISABLE_VERSION_CHECK` — set to `1` to disable stale-version detection.
- `PHOVIA_VERSION_MANIFEST_URL` — override the published-version manifest URL
  (defaults to the plugin manifest on the marketplace repo's default branch).
- `PHOVIA_VERSION_CHECK_TTL_MS` — minimum interval between version checks
  (default `21600000`, i.e. 6h).
- `PHOVIA_VERSION_CHECK_TIMEOUT_MS` — network timeout for the manifest fetch
  (default `2000`; keep this low so SessionStart stays fail-safe).
- `PHOVIA_VERSION_CACHE_FILE` — override the version-check cache path.

The device-auth brain contract is from WO-066. On-demand search depends on brain WO-069 B1 (`/memory/search`) being available.
