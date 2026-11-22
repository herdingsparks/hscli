// Types shared across hscli: what a command is handed, and the API's answers
// as hscli reads them. Types only: this module erases to nothing.

// The declared environment variables that are set (manifest `env`).
export type Env = Record<string, string>;

// What app.ts hands each command: app.main's context, its args after the
// command name.
export interface Ctx {
    args: string[];
    env: Env;
    stdin: Hull.MainInput;
    stdout: Hull.MainOutput;
    stderr: Hull.MainOutput;
}

// A command: its exit status.
export type CommandFn = (ctx: Ctx, args: string[]) => number | Promise<number>;

// GET /v1/hs/key: the key's policy limits. Every limit is optional; an absent
// one is not enforced for this key.
export interface Limits {
    max_prompt_tokens?: number;
    max_tokens?: number;
    max_concurrent_streams?: number;
    queue?: number;
    require_stream?: boolean;
    tokens_per_day?: number;
    node_tokens_per_day?: number;
}

// One node's share of today's use.
export interface NodeUsage {
    node: string;
    state: string;
    tokens?: number;
    remaining?: number;
}

export interface Usage {
    tokens?: number;
    remaining?: number;
    resets?: string;
    complete?: boolean;
    nodes?: NodeUsage[];
}

export interface KeyReport {
    key_id: string;
    principal: string;
    policy: string;
    expires: string | null;
    limits: Limits;
    usage: Usage;
}

// GET /v1/models: one entry of `data`.
export interface Model {
    id: string;
    max_model_len?: number;
}

// The key's report and the models it may use (api.describe).
export interface Description {
    key: KeyReport;
    models: Model[];
}

// The API's error body.
export interface ApiErrorBody {
    error?: { code: string; message: string };
}
