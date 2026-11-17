# hscli

The Herding Sparks client: what a user of the Herding Sparks inference API
runs on their own machine. It holds only the user's API key, and reaches
nothing but the API: `https://$HSCLI_API_HOST/v1`.

`HSCLI_API_HOST` is the API's host name, sent with the key. It is never
built in: hscli's only host grant is `"$HSCLI_API_HOST"`, so Hull refuses
every other host, and refuses all of them when it's unset.

The repositories:

- **herding-sparks** provisions the nodes and runs the gateway on them;
- **hsctl** is the operator's control application;
- **hscli** (this one) is the client, for third parties and for the
  operator (`hsctl run HARNESS` hands off to it).

## Today

- [`pi/`](pi/): a setup script and guide for the Pi coding agent. Moved
  from herding-sparks `clients/pi` (#232, #235) on 2026-11-17.

## Planned (herding-sparks `docs/third-party-serving.md` §16, P7)

A [Hull](https://gethull.dev) application, like hsctl: one signed binary
per platform, on GitHub releases.

| Command | What it does |
| --- | --- |
| `hscli login` | asks for the key, checks it, stores it in `~/.config/herding-sparks/api-key` (mode 600) |
| `hscli status` | tier, expiry, limits, today's use per node and in total |
| `hscli config HARNESS` | generate the harness's files in hscli's state directory from the key's own limits, and print them |
| `hscli shell-init` | print shell functions (`hs-pi`, `hs-opencode`, `hs-aider`) that launch each harness with that configuration, for `eval "$(hscli shell-init)"` |

Hull can't start another program or write outside the app's state
directory, so the shell functions launch the harnesses and the user's own
harness configuration is never touched. See [PLATFORM_GAPS.md](PLATFORM_GAPS.md).

Claude Code and Codex follow after a spike (§16.3).
