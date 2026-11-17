# hscli

The Herding Sparks client: what a user of the Herding Sparks inference API
runs on their own machine. It holds only the user's API key. It never
reaches the nodes except through the public API (`https://api.sparks.artalis.io/v1`).

The repositories:

- **herding-sparks** provisions the nodes and runs the gateway on them;
- **hsctl** is the operator's control application;
- **hscli** (this one) is the client, for third parties and for the
  operator (`hsctl run HARNESS` hands off to it).

## Today

- [`pi/`](pi/): a setup script and guide for the Pi coding agent. Moved
  from herding-sparks `clients/pi` (#232, #235) on 2026-11-17.

## Planned (herding-sparks `docs/third-party-serving.md` §16, P7)

An npm package, `hscli`:

| Command | What it does |
| --- | --- |
| `hscli login` | asks for the key, checks it, stores it in `~/.config/herding-sparks/api-key` (mode 600) |
| `hscli status` | tier, expiry, limits, today's use per node and in total |
| `hscli pi`, `opencode`, `aider` | configure the harness from the key's own limits, then launch it |
| `hscli config HARNESS` | print the configuration for any other tool |

Claude Code and Codex follow after a spike (§16.3).
