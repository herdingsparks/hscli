// Where hscli's state directory is, as a path a harness can use. Hull
// resolves and grants the directory itself (manifest `state`); hscli reaches
// it as "@state/...". This repeats Hull's rule (HULL_STATE_DIR, else
// $XDG_STATE_HOME/hscli, else ~/.local/state/hscli), as hsctl's lib/paths.js
// does, because the generated harness files must name real paths.
let dir = null;

export function init(env) {
    const abs = (v) => typeof v === "string" && v.startsWith("/");
    if (abs(env?.HULL_STATE_DIR)) dir = env.HULL_STATE_DIR.replace(/\/+$/, "");
    else if (abs(env?.XDG_STATE_HOME)) dir = `${env.XDG_STATE_HOME.replace(/\/+$/, "")}/hscli`;
    else if (abs(env?.HOME)) dir = `${env.HOME.replace(/\/+$/, "")}/.local/state/hscli`;
}

export function stateDir() { return dir; }

// The real path of "@state/<rel>".
export function real(rel) { return `${dir}/${rel}`; }

// One single-quoted shell word.
export function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
