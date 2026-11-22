// hscli try [PROMPT]: one question to the model, through the API, with the
// key you logged in with: the quickest way to see that the key, the host and
// the model all work, without installing a harness. The answer goes to
// stdout; the timing, the token counts and the node that answered go to
// stderr.
import * as api from "../lib/api.ts";
import type { Ctx } from "../lib/types.ts";

const DEFAULT_PROMPT = "In one short sentence, say hello and tell me which model you are.";
// Room for the model to think before it answers (thinking counts as output).
const DEFAULT_MAX_TOKENS = 2048;
// A reply takes about a second per 50 tokens, after the prompt's prefill.
const TIMEOUT_MS = 300000;

// What a streamed chat completion said, read from its server-sent events.
export interface Streamed {
    content: string;
    reasoning: string;
    finish: string | null;
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
}

interface Chunk {
    model?: string;
    choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
                finish_reason?: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

// Parse a text/event-stream body: each `data: {...}` line is a chunk;
// comment lines (`: keepalive`) and `data: [DONE]` are skipped.
export function parseStream(body: string): Streamed {
    const out: Streamed = { content: "", reasoning: "", finish: null, model: null, promptTokens: null, completionTokens: null };
    for (const line of body.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "" || data === "[DONE]") continue;
        let c: Chunk;
        try { c = JSON.parse(data) as Chunk; } catch (_e) { continue; }
        if (typeof c.model === "string") out.model = c.model;
        for (const ch of c.choices ?? []) {
            const dl = ch.delta ?? {};
            if (typeof dl.content === "string") out.content += dl.content;
            const r = dl.reasoning_content ?? dl.reasoning;
            if (typeof r === "string") out.reasoning += r;
            if (ch.finish_reason) out.finish = ch.finish_reason;
        }
        if (c.usage) {
            if (typeof c.usage.prompt_tokens === "number") out.promptTokens = c.usage.prompt_tokens;
            if (typeof c.usage.completion_tokens === "number") out.completionTokens = c.usage.completion_tokens;
        }
    }
    return out;
}

const USAGE = "usage: hscli try [--thinking] [--max-tokens N] [PROMPT...]\n";

export async function tryIt(ctx: Ctx, args: string[]): Promise<number> {
    let thinking = false;
    let maxTokens: number | null = null;
    const words: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--thinking") { thinking = true; continue; }
        if (a === "--max-tokens") {
            const v = Number(args[++i]);
            if (!Number.isInteger(v) || v < 1) { ctx.stderr.write(USAGE); return 2; }
            maxTokens = v;
            continue;
        }
        if (a === "--") { words.push(...args.slice(i + 1)); break; }
        if (a.startsWith("--")) { ctx.stderr.write(USAGE); return 2; }
        words.push(a);
    }
    const prompt = words.length ? words.join(" ") : DEFAULT_PROMPT;

    api.host(ctx.env);
    const key = api.readKey();
    const d = await api.describe(ctx.env, key);
    const w = api.expiryWarning(d.key.expires);
    if (w) ctx.stderr.write(w + "\n");
    const model = d.models[0]?.id;
    if (!model) throw new api.HscliError("the API lists no model for this key");
    const cap = d.key.limits.max_tokens ?? 16384;
    const limit = Math.min(maxTokens ?? DEFAULT_MAX_TOKENS, cap);

    const t0 = Date.now();
    const r = await api.post(ctx.env, "/chat/completions", key, {
        model, stream: true, max_tokens: limit, stream_options: { include_usage: true },
        messages: [{ role: "user", content: prompt }],
    }, TIMEOUT_MS);
    const secs = (Date.now() - t0) / 1000;
    if (r.status !== 200) throw new api.HscliError(`the API refused the request: ${api.apiError(r)}`);
    const s = parseStream(r.body);

    if (thinking && s.reasoning.trim()) ctx.stderr.write(`thinking:\n${s.reasoning.trim()}\n\n`);
    const answer = s.content.trim();
    if (answer) { ctx.stdout.write(answer + "\n"); ctx.stdout.flush(); }
    const node = r.headers["x-hs-node"];
    const out = s.completionTokens !== null ? `${s.completionTokens} tokens out` : "output not counted";
    ctx.stderr.write(`hscli try: ${s.model ?? model}${node ? ` on ${node}` : ""}: ${s.promptTokens ?? "?"} tokens in, `
        + `${out}, ${secs.toFixed(1)} s\n`);
    if (!answer) {
        if (s.finish === "length") {
            throw new api.HscliError(`the model used all ${limit} tokens thinking and gave no answer: `
                + `try a simpler prompt, or --max-tokens ${Math.min(limit * 2, cap)}`);
        }
        throw new api.HscliError(`the model gave no answer (finish: ${s.finish ?? "none"})`);
    }
    return 0;
}
