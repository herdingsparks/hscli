// hull test: hscli's harness files are derived from the API's answer, never
// fixed, and never hold the key; the API's host only ever comes from
// HSCLI_API_HOST. Runs with `hull check --types` (make check); the built
// binary is covered by tests/smoke.sh.
import { generate } from "../commands/config.ts";
import * as api from "../lib/api.ts";
import type { Description, Limits } from "../lib/types.ts";

const KEYFILE = "/home/u/.local/state/hscli/api-key";
const BASE = "https://api.example.test/v1";
const doc = (limits: Limits): Description => ({
    key: { key_id: "0123456789ab", principal: "p", policy: "third-party", expires: null, limits, usage: {} },
    models: [{ id: "qwen3_8-flash-next-fp4-local", max_model_len: 262144 }],
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
    test.eq(p.models["qwen3_8-flash-next-fp4-local"].limit.context, 65536);
    test.eq(p.models["qwen3_8-flash-next-fp4-local"].limit.output, 16384);
    test.eq(c.model, "herding-sparks/qwen3_8-flash-next-fp4-local");
});

test("aider: metadata and max_tokens, which the API requires", () => {
    const f = generate("aider", LEGAL, BASE, KEYFILE);
    const meta = JSON.parse(f["aider-models.json"])["openai/qwen3_8-flash-next-fp4-local"];
    test.eq(meta.max_input_tokens, 131072);
    test.eq(meta.max_output_tokens, 16384);
    test.ok(f["aider-settings.yml"].includes("- name: openai/qwen3_8-flash-next-fp4-local\n  extra_params:\n    max_tokens: 16384\n"));
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

test("a key expiring within 14 days is warned of, with the date and days left", () => {
    const now = Date.parse("2027-02-01T12:00:00Z");
    const w = api.expiryWarning("2027-02-15T00:00:00+0000", now);
    test.ok(w && w.includes("2027-02-15") && w.includes("in 14 days") && w.includes("hscli login"));
    test.ok((api.expiryWarning("2027-02-02T00:00:00+0000", now) ?? "").includes("in 1 day:"));
    test.eq(api.expiryWarning("2027-02-16T00:00:00+0000", now), null);   // 15 days: not yet
    test.eq(api.expiryWarning("2027-01-31T00:00:00+0000", now), null);   // already past: the API says key_expired
    test.eq(api.expiryWarning(null, now), null);
    test.eq(api.expiryWarning("soon", now), null);
});
