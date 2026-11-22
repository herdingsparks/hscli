// hull test: hscli try reads the streamed reply as the API sends it:
// server-sent events with keepalive comments, the thinking apart from the
// answer, and the usage chunk at the end.
import { parseStream } from "../commands/try.ts";

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
