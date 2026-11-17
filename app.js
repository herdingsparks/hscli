// hscli - the Herding Sparks client: configures agent harnesses (Pi,
// OpenCode, Aider) from what the API says the user's key may do.
//
// It holds the user's API key and nothing else, and reaches nothing but the
// API, at https://$HSCLI_API_HOST/v1: the host is never built in (README.md).
// Its state directory (Hull's @state/: $XDG_STATE_HOME/hscli, else
// ~/.local/state/hscli, or $HULL_STATE_DIR) holds the key (mode 600) and the
// generated harness files.
import { app } from "hull:app";
import * as paths from "./lib/paths.js";
import * as api from "./lib/api.js";
import * as key from "./commands/key.js";
import * as config from "./commands/config.js";

const GENERATED = Object.values(config.FILES).flat().map((f) => `@state/${f}`);

app.manifest({
    modules: ["hull/http-client@1", "hull/fs@1", "hull/encoding@1"],
    env: ["HSCLI_API_HOST", "HULL_STATE_DIR", "XDG_STATE_HOME", "HOME"],
    hosts: ["$HSCLI_API_HOST"],
    state: { name: "hscli" },
    fs: {
        read: ["@state/api-key"],
        write: ["@state/api-key", ...GENERATED],
    },
});

const VERSION = "0.1.0";

const COMMANDS = {
    login: { fn: key.login, help: "Store your API key, read from stdin, once the API accepts it" },
    status: { fn: key.status, help: "Your key's tier, limits, expiry and today's use" },
    config: { fn: config.config, help: "Generate a harness's configuration (pi, opencode, aider) and print it" },
    "shell-init": { fn: config.shellInit, help: "Shell functions hs-pi, hs-opencode, hs-aider: eval \"$(hscli shell-init)\"" },
};

function usage(out) {
    out.write("usage: hscli <command> [args]\n\ncommands:\n");
    for (const [name, c] of Object.entries(COMMANDS)) out.write(`  ${name.padEnd(11)} ${c.help}\n`);
    out.write(`\nThe API: https://$HSCLI_API_HOST/v1. State (api-key, harness files): ${paths.stateDir()}\n`);
}

app.main(async (ctx) => {
    paths.init(ctx.env);
    const [cmd, ...rest] = ctx.args;
    if (cmd === undefined) { usage(ctx.stderr); return 2; }
    if (cmd === "-h" || cmd === "--help" || cmd === "help") { usage(ctx.stdout); return 0; }
    if (cmd === "--version" || cmd === "version") { ctx.stdout.write(`hscli ${VERSION}\n`); return 0; }
    if (!Object.hasOwn(COMMANDS, cmd)) { ctx.stderr.write(`hscli: unknown command '${cmd}'\n\n`); usage(ctx.stderr); return 2; }
    try {
        return await COMMANDS[cmd].fn({ args: rest, env: ctx.env, stdin: ctx.stdin, stdout: ctx.stdout, stderr: ctx.stderr }, rest);
    } catch (e) {
        if (e instanceof api.HscliError) { ctx.stderr.write(`hscli ${cmd}: ${e.message}\n`); return e.rc; }
        throw e;
    }
});
