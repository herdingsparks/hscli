# Platform gaps

Things hscli needs from Hull that Hull does not provide yet. As in hsctl,
each is worked around here in the narrowest way and reported to Hull
rather than coded around. The numbers are stable: code and docs refer to
them. Found with Hull 0.20.1, 2026-11-17.

## 1. An app can't start another program

hscli's job ends in a harness (Pi, OpenCode, Aider) running with the
configuration hscli made. Hull has no module that starts a program:
`tool.spawn` exists only for Hull's own build tools. So `hscli pi` can't
exist.

**Worked around:** `hscli shell-init` prints shell functions (`hs-pi`, …)
that call `hscli config HARNESS` and then start the harness. The user adds
`eval "$(hscli shell-init)"` to their shell's startup file.

**Asked of Hull:** an exec grant, an allowlist of program names
(`exec: ["pi", "opencode", "aider"]`), resolved on `PATH`, where the app
replaces itself with the program (execve) with arguments and an
environment it chooses. Replacing rather than spawning keeps the terminal,
signals and exit status the harness's own.

## 2. File grants can't reach the user's home

A file grant is a path under the app's state directory (`@state/`) or a
literal path. A harness's own configuration (`~/.pi/agent/`,
`~/.config/opencode/`) can't be named portably, since a literal path holds
one user's home.

**Worked around:** hscli writes every harness file in its own state
directory and points the harness there (Pi's `-e` extension,
`OPENCODE_CONFIG`, Aider's `--model-metadata-file`). The user's own
configuration is never touched, which is the better default anyway.

**Asked of Hull:** a `@home/` root for file grants
(`fs: { write: ["@home/.pi/agent/models.json"] }`), so an app can offer to
merge into a harness's configuration when the user asks.

## 3. A refused host doesn't say it was refused

A request to a host outside the grant, or to `"$HSCLI_API_HOST"` while
the variable is unset, fails with `InternalError: http.fetch: failed to
start request`: the same text as a network failure.

**Worked around:** hscli checks `HSCLI_API_HOST` before any request and
names the variable to set.

**Asked of Hull:** a coded error (`{ code: "denied", host }`), as `hull/ssh`
gives for a host outside its grant.
