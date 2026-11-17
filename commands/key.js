// hscli login: store the key, after the API accepts it. hscli status: what
// the key may do and has done today, from the API (GET /v1/hs/key).
import { fs } from "hull:fs";
import * as api from "../lib/api.js";

export async function login(ctx, args) {
    if (args.length > 1 || (args.length === 1 && args[0] !== "--stdin")) {
        ctx.stderr.write("usage: hscli login [--stdin]   (the key is read from stdin: paste it, then Ctrl-D, or pipe it)\n");
        return 2;
    }
    api.host(ctx.env);
    const key = String((await ctx.stdin.read("a")) ?? "").trim();
    if (!api.KEY_RE.test(key)) throw new api.HscliError("that is not a Herding Sparks key (hsk_<12 hex>_<43 characters>)", 2);
    const d = await api.describe(ctx.env, key);
    fs.write(api.KEY_FILE, key + "\n", { private: true });
    ctx.stderr.write(`key ${d.key.key_id} stored (policy ${d.key.policy}, expires ${d.key.expires ?? "never"})\n`);
    const w = api.expiryWarning(d.key.expires);
    if (w) ctx.stderr.write(w + "\n");
    return 0;
}

function n(x) {
    if (x === undefined || x === null) return "-";
    return String(Math.trunc(Number(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export async function status(ctx, args) {
    const json = args.includes("--json");
    if (args.some((a) => a !== "--json")) { ctx.stderr.write("usage: hscli status [--json]\n"); return 2; }
    api.host(ctx.env);
    const key = api.readKey();
    const d = await api.describe(ctx.env, key);
    const w = api.expiryWarning(d.key.expires);
    if (w) ctx.stderr.write(w + "\n");
    if (json) { ctx.stdout.write(JSON.stringify(d) + "\n"); return 0; }
    const k = d.key, l = k.limits, u = k.usage;
    const out = [
        `API          ${api.baseUrl(ctx.env)}`,
        `key          ${k.key_id} (${k.principal}), policy ${k.policy}, expires ${k.expires ?? "never"}`,
        `models       ${d.models.map((m) => `${m.id}${m.max_model_len ? ` (context ${n(m.max_model_len)})` : ""}`).join(", ")}`,
        `prompt       at most ${n(l.max_prompt_tokens)} tokens; output at most ${n(l.max_tokens)}`,
        `streams      ${n(l.max_concurrent_streams)} at once per node, queue ${n(l.queue)}${l.require_stream ? "; streaming required" : ""}`,
        `today (UTC)  ${n(u.tokens)} tokens used` + (u.remaining !== undefined ? `, ${n(u.remaining)} left of ${n(l.tokens_per_day ?? l.node_tokens_per_day)}` : "")
            + `; resets ${u.resets}`,
    ];
    for (const x of u.nodes ?? []) {
        out.push(`  ${x.node.padEnd(10)} ${x.state === "ok" ? `${n(x.tokens)} used${x.remaining !== undefined ? `, ${n(x.remaining)} left` : ""}` : x.state}`);
    }
    if (u.complete === false) out.push("  (a node didn't answer: today's total leaves it out)");
    ctx.stdout.write(out.join("\n") + "\n");
    return 0;
}
