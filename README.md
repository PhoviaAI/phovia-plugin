# phovia-plugin

Phovia plugin for Claude Code — SessionStart/Stop memory hooks plus a device-auth login helper.

## Install

In Claude Code:

```text
/plugin marketplace add PhoviaAI/phovia-plugin
/plugin install phovia
```

Set the Phovia Brain API URL during install if prompted. The default is `https://brain.phovia.ai/api`. For local brain development, set `PHOVIA_BRAIN_URL` before running Claude Code or pass `--brain` to login. The helper accepts either an API base ending in `/api` or a service origin.

## Login

Run the plugin command:

```text
/phovia login
```

The helper starts the Phovia device authorization flow:

1. `POST <brain-origin>/api/auth/device/start`
2. prints the `user_code` and opens `verification_uri_complete` in your browser
3. polls `POST <brain-origin>/api/auth/device/token`
4. writes `access_token` + `refresh_token` to `~/.phovia/auth.json`

The token file is written with `0600` permissions on POSIX systems; its directory is `0700`.

If your Claude Code version shows plugin commands with namespaces, invoke `/phovia:phovia login`. You can also run the CLI helper from a Bash tool while the plugin is enabled:

```bash
phovia login --brain https://brain.example.com
phovia status
phovia logout
```

## Hooks

- `SessionStart` calls `POST {brain}/insight/recall` with `Authorization: Bearer <access_token>` and injects returned profile/insight text into Claude context.
- `Stop` calls `POST {brain}/insight/ingest` with the last assistant message and a bounded transcript tail.

If a hook receives `401`, it calls `POST <brain-origin>/api/auth/token/refresh` with the refresh token, updates the token file, and retries once. If refresh fails or tokens are missing, hooks exit successfully and show a reconnect hint: run `/phovia login`.

## Configuration

Environment variables:

- `PHOVIA_BRAIN_URL` — override the configured brain URL.
- `PHOVIA_TOKEN_FILE` — override the token file path for development/tests.

The device-auth brain contract is from WO-066 and is expected to be implemented by the brain service.
