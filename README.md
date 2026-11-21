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

## Getting started

You will have been sent two things, over a secure channel: the **API host
name** and your **API key** (`hsk_...`). [TERMS.md](TERMS.md) says what the
API serves, your key's limits, what each error means, how maintenance is
announced, and how your data is handled. The key is shown only once, when it
is issued, so keep it in your password manager. Don't paste it into chat,
email or a ticket. hscli runs on macOS (Apple silicon) and Linux (x86_64 and
arm64; Ubuntu 24.04, Debian 13, Fedora 39 or newer).

**1. Install hscli.** From the latest
[release](https://github.com/herdingsparks/hscli/releases), into
`~/.local/bin`, checked against the release's `SHA256SUMS`:

```sh
curl -fsSL https://github.com/herdingsparks/hscli/releases/latest/download/install.sh | sh
hscli --version
```

If `hscli` isn't found, add `~/.local/bin` to your `PATH`.

**2. Tell it the host.** Add this line to `~/.zshrc` or `~/.bashrc`, then
open a new terminal:

```sh
export HSCLI_API_HOST=<the host name you were sent>
```

hscli talks to that host only. It has no host built in, and while the
variable is unset it reaches nothing.

**3. Log in.** Copy the key from your password manager, then:

```sh
pbpaste | hscli login            # macOS
wl-paste | hscli login           # Linux, Wayland (xclip -o -selection clipboard on X11)
```

Or run `hscli login` and paste the key at the prompt, then press Enter.
The key does not show while you paste it, and it never goes into your
shell's history. hscli checks the key with the API before keeping it, in
`~/.local/state/hscli/api-key` (mode 600). It is the only copy on your
machine. Clear your clipboard afterwards.

**4. Check.**

```sh
hscli status
```

This shows your key's tier and expiry, the model and its limits (prompt,
output, streams), and how many of today's tokens you have used. A refused
key says why (see *When something goes wrong* below).

**5. Add the harness commands.** Add this line to `~/.zshrc` or `~/.bashrc`,
after the `export`:

```sh
eval "$(hscli shell-init)"
```

It defines `hs-pi`, `hs-opencode` and `hs-aider`.

**6. Work.** Install the harness you want once:
[Pi](https://github.com/badlogic/pi-mono) with
`npm install -g @mariozechner/pi-coding-agent` (Node 20.6 or newer),
[OpenCode](https://opencode.ai) or [Aider](https://aider.chat), each from
its own install page. Then start it inside your project:

```sh
cd ~/src/my-project
hs-pi                            # or hs-opencode, hs-aider
```

Each command writes that harness's settings from what your key may do, and
starts it with them. Your own configuration of the harness is left as it
is. Any arguments go to the harness, so `hs-pi --help` shows Pi's.

## What to expect

- **One model**, `qwen3_8-flash-next-fp4-local`. `hscli status` shows the prompt limit of your
  tier.
- **Keep a conversation going.** The API sends every turn of a conversation
  to the node that already holds its context, so later turns start fast:
  about a second, even with 64k tokens of context. A new long
  prompt takes about a second per 2,000 tokens before the first token
  comes. Output runs at about 50 tokens a second.
- **Long sessions get compacted.** When a conversation reaches the prompt
  limit, the API answers `prompt too long` and Pi summarizes the session
  and carries on. That takes a minute or two, and some detail is lost. For
  a new task, start a new session.
- **Parallel work is limited per key.** Extra requests wait in a short
  queue. If the queue is full, they are refused; harnesses retry.
- **A daily token quota** counts prompt and output tokens. A prompt counts
  each time it is sent, so agent work uses millions a day. `hscli status`
  shows what is left. The quota resets at 00:00 UTC.
- **Keys expire** after 90 days. In the last 14 days, `hscli status`,
  `hscli login` and every `hs-` command print a warning with the date. Ask
  for a new key before then, and log in with it. The old key is revoked.
- **Maintenance** moves you to the other node; requests already running
  finish first.

## When something goes wrong

hscli and the harnesses show the API's error code. The usual ones:

| You see | It means | Do |
| --- | --- | --- |
| `set HSCLI_API_HOST to the API's host name` | the shell has no host | the `export` in step 2, in this shell too |
| `401 invalid_api_key` | the key is mistyped, or it has been revoked | `hscli login` again with the key from your password manager; if it still fails, ask the operator |
| `401 key_expired` | the key's 90 days are up | ask for a new key |
| `403 fleet_only` | the request went to a node directly, not to the host you were sent | use the host you were sent, and only that host |
| `429 quota_exceeded` | today's tokens are used up | wait until 00:00 UTC (`Retry-After` gives the seconds) |
| `429 queue_full`, `queue_timeout` | more requests at once than your tier allows | retry; run fewer things in parallel |
| `400 prompt_too_long` | the conversation is over the prompt limit | Pi compacts by itself; with another tool, start a new session |
| `400 max_tokens_required` | the tool didn't say how long an answer may be | use the `hs-` commands, which set it |
| `503 draining` | maintenance on that node | retry in a moment |
| `cannot reach https://...` | no network, or the host is mistyped | check `HSCLI_API_HOST` and your connection |

**If your key may have leaked** (pasted somewhere, a laptop lost), tell
the operator at once. They revoke it and send you a new one.

## Updating

hscli doesn't update itself. To get the latest release, run the installer
again; your key and settings stay as they are:

```sh
curl -fsSL https://github.com/herdingsparks/hscli/releases/latest/download/install.sh | sh
hscli --version
```

The [releases](https://github.com/herdingsparks/hscli/releases) page says
what changed.

## Removing hscli

```sh
rm ~/.local/bin/hscli
rm -rf ~/.local/state/hscli      # your key and the generated settings
```

Then delete the two lines from `~/.zshrc` or `~/.bashrc`.

## Reference

`HSCLI_VERSION=0.1.0` makes `install.sh` install that release, and
`HSCLI_BIN_DIR` installs to another directory. Or build hscli with
[Hull](https://gethull.dev) 0.23.1 or later: `hull build -o hscli .`, then
put `hscli` on your PATH.

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

hscli never starts a program and never writes outside its state directory:
the `hs-` shell functions start the harness, and each harness is pointed at
the files hscli made, so your own harness configuration is left alone.

Tested on 2026-11-17 against the live API with Pi 0.73.1, OpenCode 1.19.6
and Aider 0.86.2: each fixed a bug in a small project; Pi's context
followed the tier, and a turn over the prompt limit was compacted and
retried. The same day, hscli 0.1.1 from its release took Pi through a
seven-turn coding session (87 requests, the context up to 64k tokens).

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
