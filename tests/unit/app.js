// Run: bash tests/unit.sh (it copies commands/ and lib/ next to this file)
// hscli's harness files are derived from the API's answer, never fixed, and
// never hold the key; the API's host only ever comes from HSCLI_API_HOST.
import { app } from "hull:app";
import { generate } from "./commands/config.js";
import * as api from "./lib/api.js";

app.manifest({ modules: ["hull/http-client@1", "hull/fs@1", "hull/encoding@1"], env: ["HSCLI_API_HOST"],
               hosts: ["$HSCLI_API_HOST"], state: { name: "hscli-unit" } });

const cases = [];
const test = (name, fn) => cases.push([name, fn]);
test.ok = (v) => { if (!v) throw new Error("not ok"); };
test.eq = (a, b) => { if (a !== b) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
test.err = (fn, pattern) => {
    try { fn(); } catch (e) {
        if (pattern && !String(e.message).includes(pattern)) throw new Error(`threw '${e.message}', not '${pattern}'`);
        return;
    }
    throw new Error("did not throw");
};

const KEYFILE = "/home/u/.local/state/hscli/api-key";
const BASE = "https://api.example.test/v1";
const doc = (limits) => ({
    key: { key_id: "0123456789ab", principal: "p", policy: "third-party", expires: null, limits, usage: {} },
    models: [{ id: "qwen38-fp4", max_model_len: 262144 }],
});
const STD = doc({ max_prompt_tokens: 65536, max_tokens: 16384 });
const LEGAL = doc({ max_prompt_tokens: 131072, max_tokens: 16384 });

test("pi: the context and output follow the key's tier", () => {
    const std = generate("pi", STD, BASE, KEYFILE)["pi-herding-sparks.js"];
    const legal = generate("pi", LEGAL, BASE, KEYFILE)["pi-herding-sparks.js"];
    test.ok(std.includes('"contextWindow": 65536') && std.includes('"maxTokens": 16384'));
    test.ok(legal.includes('"contextWindow": 131072'));
    test.ok(std.includes(`baseUrl: "${BASE}"`));
    test.ok(std.includes(`readFileSync("${KEYFILE}"`));
    test.ok(std.includes('"thinkingFormat": "qwen-chat-template"') && std.includes('"maxTokensField": "max_tokens"'));
});

test("no limit in the policy: the model's own context", () => {
    const f = generate("pi", doc({}), BASE, KEYFILE)["pi-herding-sparks.js"];
    test.ok(f.includes('"contextWindow": 262144') && f.includes('"maxTokens": 16384'));
    test.err(() => generate("pi", { ...doc({}), models: [{ id: "m" }] }, BASE, KEYFILE), "no context");
});

test("opencode: a provider reading the key from its file, the model chosen", () => {
    const c = JSON.parse(generate("opencode", STD, BASE, KEYFILE)["opencode.json"]);
    const p = c.provider["herding-sparks"];
    test.eq(p.options.baseURL, BASE);
    test.eq(p.options.apiKey, `{file:${KEYFILE}}`);
    test.eq(p.models["qwen38-fp4"].limit.context, 65536);
    test.eq(p.models["qwen38-fp4"].limit.output, 16384);
    test.eq(c.model, "herding-sparks/qwen38-fp4");
});

test("aider: metadata and max_tokens, which the API requires", () => {
    const f = generate("aider", LEGAL, BASE, KEYFILE);
    const meta = JSON.parse(f["aider-models.json"])["openai/qwen38-fp4"];
    test.eq(meta.max_input_tokens, 131072);
    test.eq(meta.max_output_tokens, 16384);
    test.ok(f["aider-settings.yml"].includes("- name: openai/qwen38-fp4\n  extra_params:\n    max_tokens: 16384\n"));
});

test("no generated file holds a key", () => {
    for (const h of ["pi", "opencode", "aider"]) {
        for (const text of Object.values(generate(h, STD, BASE, KEYFILE))) test.ok(!/hsk_/.test(text));
    }
});

test("an unknown harness is refused", () => {
    test.err(() => generate("vim", STD, BASE, KEYFILE), "no harness");
});

test("the host only from HSCLI_API_HOST, and only a bare host name", () => {
    test.eq(api.host({ HSCLI_API_HOST: "api.example.test" }), "api.example.test");
    test.eq(api.baseUrl({ HSCLI_API_HOST: "api.example.test" }), "https://api.example.test/v1");
    test.err(() => api.host({}), "HSCLI_API_HOST");
    for (const bad of ["https://api.example.test/v1", "api.example.test:443", "api example", "localhost", "-x.test"]) {
        test.err(() => api.host({ HSCLI_API_HOST: bad }), "bare host name");
    }
});

app.main((ctx) => {
    let failed = 0;
    for (const [name, fn] of cases) {
        try { fn(); ctx.stdout.write(`  PASS  ${name}\n`); } catch (e) { failed++; ctx.stdout.write(`  FAIL  ${name}: ${e.message}\n`); }
    }
    ctx.stdout.write(`hscli unit: ${cases.length - failed} passed, ${failed} failed\n`);
    return failed ? 1 : 0;
});
