# Platform gaps

Things hscli needs from Hull that Hull does not provide yet. As in hsctl,
each is worked around here in the narrowest way and reported to Hull
rather than coded around. The numbers are stable: code and docs refer to
them. Found with Hull 0.20.1, 2026-11-17. Hull 0.23.1 (2026-11-21) addresses 3 and 4,
and hscli uses both. 1 and 2 stay as they are, by decision (2026-11-21):
nothing is asked of Hull for them.

## 1. An app can't start another program (kept, by decision)

hscli's job ends in a harness (Pi, OpenCode, Aider) running with the
configuration hscli made. Hull has no module that starts a program:
`tool.spawn` exists only for Hull's own build tools. So `hscli pi` can't
exist.

**Worked around:** `hscli shell-init` prints shell functions (`hs-pi`, …)
that call `hscli config HARNESS` and then start the harness. The user adds
`eval "$(hscli shell-init)"` to their shell's startup file.

**Decided 2026-11-21: not asked of Hull.** An exec grant would have Hull
start whatever program a name resolves to on `PATH`: an executable Hull
knows nothing about. That is not wanted. The shell functions stay the way a
harness is started.

## 2. File grants can't reach the user's home (kept, by decision)

A file grant is a path under the app's state directory (`@state/`) or a
literal path. A harness's own configuration (`~/.pi/agent/`,
`~/.config/opencode/`) can't be named portably, since a literal path holds
one user's home.

**Worked around:** hscli writes every harness file in its own state
directory and points the harness there (Pi's `-e` extension,
`OPENCODE_CONFIG`, Aider's `--model-metadata-file`). The user's own
configuration is never touched, which is the better default anyway.

**Decided 2026-11-21: not asked of Hull.** The workaround is the better
design: hscli's files live in its own state directory, and a harness's own
configuration is never touched.

## 3. A refused host doesn't say it was refused (addressed in Hull 0.23.1)

A request to a host outside the grant, or to `"$HSCLI_API_HOST"` while
the variable is unset, fails with `InternalError: http.fetch: failed to
start request`: the same text as a network failure.

**Worked around:** hscli checks `HSCLI_API_HOST` before any request and
names the variable to set.

**Asked of Hull:** a coded error (`{ code: "denied", host }`), as `hull/ssh`
gives for a host outside its grant.

**Addressed in Hull 0.23.1:** a host `manifest.hosts` does not admit throws
an `Error` with `code` `"denied"` and `host`, and the message names an unset
`"$VAR"` entry. hscli still checks `HSCLI_API_HOST` first, since its message
also says what to set, and names a `denied` refusal as one (`lib/api.js`).

## 4. Terminal input can't be hidden (addressed in Hull 0.23.1)

`hscli login` reads the key from stdin. Typed or pasted at a terminal, it
shows while it is entered.

**Worked around (until 0.1.4):** the README said to pipe it
(`pbpaste | hscli login`) or paste and press Ctrl-D; it is never in argv.

**Asked of Hull:** a no-echo read for a terminal stdin
(`ctx.stdin.readSecret()`), as `getpass` does.

**Addressed in Hull 0.23.1:** `ctx.stdin.readSecret(prompt)`. `hscli login`
uses it: at a terminal it prompts and the key does not echo; from a pipe it
reads the first line, so `pbpaste | hscli login` works as before.
