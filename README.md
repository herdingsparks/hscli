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
  operator.

## Install and use

On macOS (Apple silicon) or Linux (x86_64, arm64), from the latest
[release](https://github.com/herdingsparks/hscli/releases), checked
against its `SHA256SUMS`, into `~/.local/bin`:

```sh
curl -fsSL https://github.com/herdingsparks/hscli/releases/latest/download/install.sh | sh
```

`HSCLI_VERSION=0.1.0` picks a release, `HSCLI_BIN_DIR` another directory.
Or build it with [Hull](https://gethull.dev) 0.22.2 or later:
`hull build -o hscli .`, then put `hscli` on your PATH.

Then, with the host name and key you were sent:

```sh
export HSCLI_API_HOST=<the host name you were sent>    # in ~/.zshrc or ~/.bashrc too
hscli login                      # paste the key, then Ctrl-D (or: pbpaste | hscli login)
hscli status                     # tier, limits, expiry, today's use
eval "$(hscli shell-init)"       # in ~/.zshrc or ~/.bashrc too
hs-pi                            # Pi, set up for the API
hs-opencode                      # OpenCode
hs-aider                         # Aider
```

| Command | What it does |
| --- | --- |
| `hscli login [--stdin]` | reads the key from stdin, checks it with the API (`/v1/hs/key`), stores it in the state directory, mode 600 |
| `hscli status [--json]` | the key's tier, expiry, limits, and today's use per node and in total |
| `hscli config pi\|opencode\|aider` | generates that harness's files in the state directory from what the API says the key may do, and prints them |
| `hscli shell-init` | prints the shell functions `hs-pi`, `hs-opencode`, `hs-aider` |

Each function regenerates its harness's files and starts it pointed at
them: Pi with `-e <state>/pi-herding-sparks.js` (a Pi extension that
registers the provider), OpenCode with `OPENCODE_CONFIG`, Aider with
`--model-metadata-file` and `--model-settings-file` (the API requires
`max_tokens`, which Aider doesn't send unless told). Your own harness
configuration is never touched, and no generated file holds the key: each
reads it from the key file. The context and output limits come from your
key's tier, so a new tier needs nothing but starting the harness again.

The state directory is `~/.local/state/hscli` (`$XDG_STATE_HOME/hscli` when
set; `$HULL_STATE_DIR` overrides). Hull makes it 0700.

Hull can't start a program or write outside the state directory, and its
terminal input isn't hidden, so a pasted key shows while you type it; see
[PLATFORM_GAPS.md](PLATFORM_GAPS.md).

Tested on 2026-11-17 against the live API with Pi 0.73.1, OpenCode 1.19.6
and Aider 0.86.2: each fixed a bug in a small project; Pi's context
followed the tier (65,536 standard, 131,072 legal), and a turn over the
prompt limit was compacted and retried.

Tests: `bash tests/unit.sh` (the generated files, the host rule);
`sh tests/smoke.sh ./hscli` (a built binary runs). CI runs both on macOS
and Linux; a tag `vX.Y.Z` matching `VERSION` in `app.js` publishes a
release (`.github/workflows/release.yml`).

[`pi/setup.sh`](pi/) is the older Pi-only setup, for a machine without
hscli.

The operator gets a key the same way: `hsctl gateway key client | hscli login --stdin`.

## Licence

hscli is free software under the GNU Affero General Public License,
version 3 or (at your option) any later version (SPDX: `AGPL-3.0-or-later`). See [LICENSE](LICENSE).
