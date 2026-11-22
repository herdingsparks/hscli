// Where hscli's state directory is, as a path a harness can use. Hull
// resolves and grants the directory itself (manifest `state`); hscli reaches
// it as "@state/...". This repeats Hull's rule (HULL_STATE_DIR, else
// $XDG_STATE_HOME/hscli, else ~/.local/state/hscli), as hsctl's lib/paths.ts
// does, because the generated harness files must name real paths.
import type { Env } from "./types.ts";

let dir: string | null = null;

export function init(env: Env): void {
    const abs = (v: string | undefined): v is string => typeof v === "string" && v.startsWith("/");
    const trim = (v: string) => v.replace(/\/+$/, "");
    if (abs(env.HULL_STATE_DIR)) dir = trim(env.HULL_STATE_DIR);
    else if (abs(env.XDG_STATE_HOME)) dir = `${trim(env.XDG_STATE_HOME)}/hscli`;
    else if (abs(env.HOME)) dir = `${trim(env.HOME)}/.local/state/hscli`;
}

export function stateDir(): string | null { return dir; }

// The real path of "@state/<rel>".
export function real(rel: string): string { return `${dir}/${rel}`; }

// One single-quoted shell word.
export function shq(s: string): string { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
