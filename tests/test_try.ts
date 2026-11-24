// hull test: hscli try reads the streamed reply as the API sends it:
// server-sent events with keepalive comments, the thinking apart from the
// answer, and the usage chunk at the end.
import { Trimmed, applyChunk, newStreamed, parseStream } from "../commands/try.ts";

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

test("try: the answer, the thinking and the usage, keepalives skipped", () => {
    const body = ": queued\n\n"
        + ev({ model: "m", choices: [{ delta: { reasoning_content: "17*23 = " } }] })
        + ": keepalive\n\n"
        + ev({ model: "m", choices: [{ delta: { reasoning_content: "391." } }] })
        + ev({ model: "m", choices: [{ delta: { content: "\n\n391" } }] })
        + ev({ model: "m", choices: [{ delta: {}, finish_reason: "stop" }] })
        + ev({ model: "m", choices: [], usage: { prompt_tokens: 20, completion_tokens: 9 } })
        + "data: [DONE]\n\n";
    const s = parseStream(body);
    test.eq(s.content, "\n\n391");
    test.eq(s.reasoning, "17*23 = 391.");
    test.eq(s.finish, "stop");
    test.eq(s.model, "m");
    test.eq(s.promptTokens, 20);
    test.eq(s.completionTokens, 9);
});

test("try: a reply cut off while thinking has no answer and finish length", () => {
    const s = parseStream(ev({ choices: [{ delta: { reasoning: "still thinking" } }] })
        + ev({ choices: [{ delta: {}, finish_reason: "length" }] }));
    test.eq(s.content, "");
    test.eq(s.reasoning, "still thinking");
    test.eq(s.finish, "length");
    test.eq(s.completionTokens, null);
});

test("try: CRLF lines and a malformed chunk are tolerated", () => {
    const s = parseStream("data: {not json}\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\r\n\r\n");
    test.eq(s.content, "ok");
});

test("try: each chunk hands back the text it added, as it arrives", () => {
    const s = newStreamed();
    const add = (d: string) => JSON.stringify(applyChunk(s, d));
    test.eq(add(JSON.stringify({ choices: [{ delta: { reasoning: "hm" } }] })), '{"content":"","reasoning":"hm"}');
    test.eq(add(JSON.stringify({ choices: [{ delta: { content: "4" } }] })), '{"content":"4","reasoning":""}');
    test.eq(add("[DONE]"), '{"content":"","reasoning":""}');
    test.eq(add("null"), '{"content":"","reasoning":""}');
    test.eq(s.content, "4");
    test.eq(s.reasoning, "hm");
});

test("try: an error chunk part-way is kept", () => {
    const s = parseStream(ev({ choices: [{ delta: { content: "par" } }] })
        + ev({ error: { code: "node_lost", message: "the node went away" } }));
    test.eq(s.content, "par");
    test.eq(s.error, "node_lost: the node went away");
});

test("try: streamed text prints as the whole text trimmed would", () => {
    let got = "";
    const out = { write: (...d: (string | number | boolean | ArrayBuffer | Uint8Array)[]) => { got += d.join(""); }, flush: () => {} };
    const t = new Trimmed(out as Hull.MainOutput, "head:");
    t.add("\n\n ");
    test.eq(t.wrote, false);
    test.eq(got, "");
    t.add("  39");
    t.add("1 ");
    t.add("\n");
    test.eq(got, "head:391");
    t.add("is it.\n\n");
    test.eq(got, "head:391 \nis it.");
    test.eq(t.wrote, true);
});
