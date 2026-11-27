// hull test: hscli try reads the streamed reply as the API sends it:
// server-sent events with keepalive comments, the thinking apart from the
// answer, and the usage chunk at the end.
import { Trimmed, applyChunk, newStreamed, parseStream, readStream } from "../commands/try.ts";
import type { HttpStream } from "hull:http-client";

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
    test.eq(s.done, true);
});

function stream(chunks: string[], failAtEnd = false) {
    let reads = 0, closed = false;
    const res = {
        async readText() {
            const i = reads++;
            if (i < chunks.length) return chunks[i]!;
            if (failAtEnd) throw new Error("synthetic transport failure");
            return null;
        },
        close() { closed = true; },
    } as unknown as HttpStream;
    return { res, reads: () => reads, closed: () => closed };
}

async function failure(run: () => Promise<void>): Promise<string> {
    try { await run(); } catch (e) { return (e as Error).message; }
    throw new Error("expected rejection");
}

test("try: partial content followed by clean EOF is not a successful reply", async () => {
    const f = stream([ev({ choices: [{ delta: { content: "par" } }] })]);
    const s = newStreamed();
    test.eq(await failure(() => readStream(f.res, s, () => {})), "stream ended before completion");
    test.eq(s.content, "par");
    test.eq(f.closed(), true);
});

test("try: DONE ends reading immediately and ignores later events", async () => {
    const f = stream([ev({ choices: [{ delta: { content: "ok" } }] })
        + "data: [DONE]\n\n" + ev({ error: { code: "late" } })], true);
    const s = newStreamed();
    await readStream(f.res, s, () => {});
    test.eq(s.done, true);
    test.eq(s.error, null);
    test.eq(s.content, "ok");
    test.eq(f.reads(), 1);
    test.eq(f.closed(), true);
    test.eq(parseStream("data: [DONE]\n\n" + ev({ choices: [{ delta: { content: "late" } }] })).content, "");
});

test("try: finish plus EOF is complete and trailing usage is retained", async () => {
    const f = stream([ev({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }),
        ev({ usage: { prompt_tokens: 3, completion_tokens: 2 } })]);
    const s = newStreamed();
    let printed = "";
    await readStream(f.res, s, added => {
        if (added.content) test.eq(f.reads(), 1);
        printed += added.content;
    });
    test.eq(printed, "ok");
    test.eq(s.finish, "stop");
    test.eq(s.completionTokens, 2);
    test.eq(f.closed(), true);
});

test("try: provider error closes without waiting for EOF", async () => {
    const f = stream([ev({ error: { code: "node_lost", message: "gone" } })], true);
    const s = newStreamed();
    await readStream(f.res, s, () => {});
    test.eq(s.error, "node_lost: gone");
    test.eq(f.reads(), 1);
    test.eq(f.closed(), true);
});

test("try: transport and output errors retain their cause and close the stream", async () => {
    for (const outputFails of [false, true]) {
        const f = stream([ev({ choices: [{ delta: { content: "par" } }] })], true);
        const message = await failure(() => readStream(f.res, newStreamed(), () => {
            if (outputFails) throw new Error("synthetic output failure");
        }));
        test.eq(message, outputFails ? "synthetic output failure" : "synthetic transport failure");
        test.eq(f.closed(), true);
    }
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
