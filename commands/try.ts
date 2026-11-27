// hscli try [PROMPT]: one question to the model, through the API, with the
// key you logged in with: the quickest way to see that the key, the host and
// the model all work, without installing a harness. The answer goes to
// stdout as it arrives (the thinking, with --thinking, to stderr); the
// timing, the token counts and the node that answered go to stderr.
import { sseClient } from "hull:sse-client";
import type { HttpStream } from "hull:http-client";
import * as api from "../lib/api.ts";
import type { Ctx } from "../lib/types.ts";

const DEFAULT_PROMPT = "In one short sentence, say hello and tell me which model you are.";
// Room for the model to think before it answers (thinking counts as output).
const DEFAULT_MAX_TOKENS = 2048;
// A reply takes about a second per 50 tokens, after the prompt's prefill.
const TIMEOUT_MS = 300000;

// What a streamed chat completion said, gathered from its server-sent events.
export interface Streamed {
    content: string;
    reasoning: string;
    finish: string | null;
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    error: string | null;
    done: boolean;
}

interface Chunk {
    model?: string;
    choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
                finish_reason?: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
    error?: { code?: string; message?: string } | null;
}

export function newStreamed(): Streamed {
    return { content: "", reasoning: "", finish: null, model: null, promptTokens: null, completionTokens: null, error: null, done: false };
}

// Take one event's data into `out`; unreadable chunks are skipped and [DONE]
// marks completion. Returns the answer and thinking text it added.
export function applyChunk(out: Streamed, data: string): { content: string; reasoning: string } {
    const added = { content: "", reasoning: "" };
    const d = data.trim();
    if (out.done || out.error !== null || d === "") return added;
    if (d === "[DONE]") { out.done = true; return added; }
    let c: Chunk;
    try { c = JSON.parse(d) as Chunk; } catch (_e) { return added; }
    if (c === null || typeof c !== "object") return added;
    if (typeof c.model === "string") out.model = c.model;
    for (const ch of c.choices ?? []) {
        const dl = ch.delta ?? {};
        if (typeof dl.content === "string") added.content += dl.content;
        const r = dl.reasoning_content ?? dl.reasoning;
        if (typeof r === "string") added.reasoning += r;
        if (ch.finish_reason) out.finish = ch.finish_reason;
    }
    out.content += added.content;
    out.reasoning += added.reasoning;
    if (c.usage) {
        if (typeof c.usage.prompt_tokens === "number") out.promptTokens = c.usage.prompt_tokens;
        if (typeof c.usage.completion_tokens === "number") out.completionTokens = c.usage.completion_tokens;
    }
    if (c.error) out.error = `${c.error.code ?? "error"}: ${c.error.message ?? "the stream failed"}`;
    return added;
}

// A whole text/event-stream body at once (the tests'; tryIt reads it as it
// arrives, through sseClient.events).
export function parseStream(body: string): Streamed {
    const out = newStreamed();
    const p = sseClient.parser();
    for (const ev of [...p.feed(body), ...p.finish()]) applyChunk(out, ev.data);
    return out;
}

// A finish reason followed by EOF also completes generation. Keep reading after
// that reason for the optional usage chunk, but stop immediately on [DONE].
// Own cleanup even if parsing or the output callback throws.
export async function readStream(res: HttpStream, out: Streamed,
    onText: (added: { content: string; reasoning: string }) => void): Promise<void> {
    try {
        for await (const ev of sseClient.events(res)) {
            onText(applyChunk(out, ev.data));
            if (out.done || out.error !== null) break;
        }
        if (!out.done && out.finish === null && out.error === null)
            throw new Error("stream ended before completion");
    } finally {
        res.close();
    }
}

// Writes streamed text as it arrives, as the whole text trimmed would read:
// leading whitespace dropped, trailing whitespace held back until more text
// follows it. `head` goes out before the first text; `wrote` says whether
// any text went out.
export class Trimmed {
    private readonly out: Hull.MainOutput;
    private readonly head: string;
    private started = false;
    private held = "";
    constructor(out: Hull.MainOutput, head = "") { this.out = out; this.head = head; }
    add(text: string): void {
        if (!this.started) {
            text = text.replace(/^\s+/, "");
            if (text === "") return;
            this.started = true;
            this.out.write(this.head);
        }
        const body = text.replace(/\s+$/, "");
        if (body === "") { this.held += text; return; }
        this.out.write(this.held + body);
        this.held = text.slice(body.length);
        this.out.flush();
    }
    get wrote(): boolean { return this.started; }
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
    const res = await api.postStream(ctx.env, "/chat/completions", key, {
        model, stream: true, max_tokens: limit, stream_options: { include_usage: true },
        messages: [{ role: "user", content: prompt }],
    }, TIMEOUT_MS);
    if (res.status !== 200) {
        const r = await api.readAll(res);
        throw new api.HscliError(`the API refused the request: ${api.apiError(r)}`);
    }

    // The thinking (with --thinking) and the answer print as they arrive.
    const s = newStreamed();
    const thought = new Trimmed(ctx.stderr, "thinking:\n");
    const answer = new Trimmed(ctx.stdout);
    let cut: string | null = null;
    try {
        await readStream(res, s, added => {
            if (thinking && added.reasoning) thought.add(added.reasoning);
            if (added.content) {
                if (thought.wrote && !answer.wrote) ctx.stderr.write("\n\n");
                answer.add(added.content);
            }
        });
    } catch (e) {
        const x = e as { code?: string; message?: string } | undefined;
        cut = x?.code ? `${x.code}: ${x.message ?? ""}` : String(x?.message ?? e);
    }
    const secs = (Date.now() - t0) / 1000;
    if (answer.wrote) { ctx.stdout.write("\n"); ctx.stdout.flush(); }
    else if (thought.wrote) ctx.stderr.write("\n");

    const node = res.headers["x-hs-node"];
    const out = s.completionTokens !== null ? `${s.completionTokens} tokens out` : "output not counted";
    ctx.stderr.write(`hscli try: ${s.model ?? model}${node ? ` on ${node}` : ""}: ${s.promptTokens ?? "?"} tokens in, `
        + `${out}, ${secs.toFixed(1)} s\n`);
    if (cut !== null) throw new api.HscliError(`the reply stopped part-way: ${cut}`);
    if (s.error !== null) throw new api.HscliError(`the API failed the request part-way: ${s.error}`);
    if (!answer.wrote) {
        if (s.finish === "length") {
            throw new api.HscliError(`the model used all ${limit} tokens thinking and gave no answer: `
                + `try a simpler prompt, or --max-tokens ${Math.min(limit * 2, cap)}`);
        }
        throw new api.HscliError(`the model gave no answer (finish: ${s.finish ?? "none"})`);
    }
    return 0;
}
