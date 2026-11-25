# Terms of use: the Herding Sparks inference API

What you can rely on when you use the API with a key issued to you: what it
serves, the limits of your key, what the errors mean, how fast it is, how
it is maintained, and how your data is handled. Version 4, 2026-11-25. The
operator keeps the authoritative copy; this one is kept in step with it.
Where it says "the host you were sent", that is the API host name that came
with your key (`HSCLI_API_HOST` for hscli).

## 1. The service

- **One hostname:** the host you were sent, with any OpenAI SDK
  pointed at `https://<the host you were sent>/v1`.
- **Three endpoints:** `POST /v1/chat/completions`, `GET /v1/models`, and
  `GET /v1/hs/key`, which reports your key's tier, limits, expiry and
  today's use (per node and in total). Anything else answers
  `404 not_found`.
- **One model:** `qwen3_8-flash-next-fp4-local`, with a context of 262,144 tokens (prompt plus
  output).
- **One key** per third party, sent as `Authorization: Bearer <key>`. The
  key is shown once, when it is issued. If it is lost, ask for a new one;
  the old one is revoked.
- **One tier.** Every key takes prompts of up to 131,072 tokens, with 2
  streams at once per node. (Versions 1 and 2 had a second tier; keys
  issued on it have the same limits.)
- The service runs on two nodes. Each conversation goes to the node that
  already holds its context, which makes later turns faster. If that node
  can't take the request, it goes to the other.

## 2. Limits per key

| Limit | Per key | When it is exceeded |
| --- | --- | --- |
| Streams at once | 2 per node, 4 in all | further requests wait in a queue |
| Queue | 4 per node; a place is held up to 60 s | `429 queue_full` at once when the queue is full; `queue_timeout` after 60 s |
| `max_tokens` (or `max_completion_tokens`) | required, at most 16,384 | `400 max_tokens_required`, `400 max_tokens_exceeded` |
| Prompt | at most 131,072 tokens | `400 prompt_too_long`, naming the count and the limit |
| `n`, `best_of` | 1 or absent | `400 unsupported_n` |
| Request body | 4 MiB | `413 body_too_large` |
| Tokens per day | 80,000,000: 40,000,000 per node; resets at 00:00 UTC | `429 quota_exceeded`, with `Retry-After` the seconds to midnight UTC |
| Key expiry | 90 days from issue | `401 key_expired` after it |

A key is renewed by issuing a new one before the old one expires; the
expiry of an issued key never changes.

Tokens are counted as the model's own usage, prompt plus output, for every
request answered `200`. A request that fails while answering (`502`), or
that you disconnect from, counts its prompt and the output you had
received. A request refused before it runs counts nothing.

**The daily quota is held per node.** Each node allows half of it. Your
requests normally go to one node, and move to the other when its half is
spent, so you can use all of it. While one node is out of service (§6), only
the half held by the node that's serving is available that day.

The service never truncates a prompt, supplies a missing `max_tokens` or
clamps one. It refuses the request and names what to change.

## 3. Requests

- **Every request must stream** (`"stream": true`). A request without it is
  refused with `400 stream_required`. Every OpenAI SDK can stream.
- To receive token usage, send `"stream_options": {"include_usage": true}`.
  The last event before `data: [DONE]` then carries `usage` with an empty
  `choices`. Usage is counted whether you ask for it or not.
- **A stream may contain SSE comment lines** (lines starting with `:`):
  `: queued` while your request waits for a slot, and `: keepalive` every
  15 s while the model is silent, for example during a long prompt's
  prefill. SSE readers ignore them; a hand-written reader must too.
- **A stream may be answered `200` before it is admitted.** From then on
  HTTP status codes can't be sent. A refusal or failure after that arrives
  as an event, `data: {"error": {"message", "type", "param", "code"}}`, and
  the stream ends. OpenAI SDKs raise on it.
- **A stream is complete only when it ends with `data: [DONE]`.** Treat a
  stream that ends any other way as failed, whatever arrived before it.
- **Disconnecting cancels the request.** Its slot or queue place is given
  back at once.

## 4. Errors

Every error is JSON, `{"error": {"message", "type", "param", "code"}}`, or
the same object as an SSE event inside a `200` stream (§3). Act on `code`;
`message` is for people and may change.

| Status | `code` | Meaning | What to do |
| --- | --- | --- | --- |
| 400 | `stream_required`, `max_tokens_required`, `max_tokens_exceeded`, `max_tokens_over_budget`, `prompt_too_long`, `unsupported_n`, `invalid_json`, `invalid_max_tokens`, `invalid_stream`, `missing_model` | the request breaks a limit or isn't valid | fix the request; don't retry it unchanged |
| 401 | `invalid_api_key` | the key is unknown or revoked | check the key |
| 401 | `key_expired` | the key's expiry has passed | ask for a new key |
| 403 | `model_not_permitted` | the key may not use that model | use `qwen3_8-flash-next-fp4-local` |
| 404 | `model_not_found`, `not_found` | no such model or path | |
| 413 | `body_too_large` | the body is over 4 MiB | |
| 429 | `queue_full`, `queue_timeout` | every slot is busy | retry after `Retry-After` |
| 429 | `quota_exceeded` | today's tokens are used | retry after `Retry-After` (midnight UTC) |
| 502 | `upstream_incomplete`, `upstream_invalid`, `upstream_unavailable`, `upstream_status` | the model failed while answering | retry; it counts its prompt and the output you received |
| 503 | `no_node_available` | neither node could take the request just now | retry after `Retry-After` |
| 503 | `service_unavailable`, `prompt_count_unavailable` | the model isn't available on that node now | retry after `Retry-After` |

The service never retries a request on your behalf once any of its answer
has been sent. Before that, it tries the other node on its own.

## 5. Speed

These figures are measured, not promised.

- One stream alone: about 37 tokens per second of output.
- Each node: about 287 tokens per second in total with 8 streams.
- A long prompt is slow to start: its prefill takes about 33 s at 64k
  tokens and 67 s at 128k while seven other streams run.
- **Long prompts slow everyone down while they prefill.** Long prompts
  are prefilled one after another, and a request that arrives meanwhile
  waits for every one queued ahead of it: about 7 s behind a 16k prompt,
  29 s behind 64k, 60 s behind 128k (the longest any third-party key may
  send). Measured: up to 76 s behind four 64k prompts sent together, and
  86 s behind two 128k prompts. Streams already running slow to 10–20% of
  their speed meanwhile, but still get a token at least every 5 s. A
  stream that waits receives `: keepalive` comments, so it isn't cut
  off.

## 6. Availability and maintenance

- **Availability: best effort.** The aim is 99% a month (about 7 hours
  down), not counting announced windows. There are no service credits.
- **Planned work** takes one node out of service at a time. Its running
  requests finish first, and new conversations go to the other node, so
  planned work on one node fails no request. Capacity is halved while it
  lasts, and so is the day's quota (§2).
- **Releases** reach the nodes one at a time. Each node goes back into
  service only after it passes its acceptance checks.
- **Both nodes out at once:** some experiments need both nodes, and the
  service is then unavailable. Such a window is announced by email at least
  24 hours ahead, lasts at most 4 hours, and they total at most 8 hours a
  month.
- **Unplanned outages:** an outside probe checks each node and the hostname
  every minute and alerts the operator. Response is best effort: within
  4 hours during working hours (Central European Time), otherwise the next
  working day.
- **Changes:** the model, its context or the limits above change only with
  14 days' notice. A key that has leaked or is being abused is revoked at
  once, without notice.

## 7. Your data

- **The content of requests and answers is never logged or stored.** It
  passes through the gateway to the model on the node and back.
- **Usage is kept for 400 days:** per request, the key, the model, the
  status, the token counts and the time. Never content. It is the basis of
  any usage report.
- The gateway's request log, in the node's system journal, holds the same
  metadata and no content. It is kept until the journal rotates it,
  typically some weeks.
- **Path:** TLS from you to Cloudflare, then Cloudflare to the node through
  a Cloudflare Tunnel. Cloudflare terminates TLS, so it carries the content
  in transit; it doesn't store it for this service.
- The nodes also run other workloads. Your traffic shares their memory and
  network.
- **Terms:** the service is free during evaluation and provided as is,
  without warranty. Either side may end it with 7 days' notice.
