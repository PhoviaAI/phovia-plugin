---
description: Run Phovia account commands such as login, status, and logout.
disable-model-invocation: true
argument-hint: "login|status|logout [--brain URL]"
allowed-tools: Bash(phovia *)
---

Run the Phovia CLI helper for this plugin.

- If no arguments are provided, run `phovia --help`.
- Otherwise run `phovia $ARGUMENTS` exactly.
- Do not print or expose access tokens or refresh tokens.
- After the command finishes, briefly report whether it succeeded.

Arguments: `$ARGUMENTS`
