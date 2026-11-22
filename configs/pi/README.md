# Pi with the Herding Sparks API

[Pi](https://pi.dev) is a terminal coding agent. These steps point it at
the Herding Sparks API (model `qwen3_8-flash-next-fp4-local`), for a machine without
[hscli](../../README.md), which does this for you (`hs-pi`). Tested with Pi
0.73.1 on 2026-11-17.

## Setup

You need Node.js 20.6 or later, and the key and the API's host name you
were sent.

```bash
export HSCLI_API_HOST=<the host name you were sent>
bash setup.sh
```

It asks for the key without echoing it, installs Pi if needed, stores the
key in `~/.config/herding-sparks/api-key` (readable only by you), asks the
API what your key may do, adds the provider with those limits to
`~/.pi/agent/models.json`, makes it Pi's default, and sends one short
request to check the key. Run it again if your terms change. Your other Pi providers and settings
are kept; the previous files are saved as `*.bak`.

Then, in any project:

```bash
cd /path/to/project
pi
```

## Things to know

- **Thinking.** The model thinks before answering. `--thinking off`, or
  shift+tab in Pi, turns it off for quick work; `medium` is the default.
- **Context.** Your key can send prompts up to the limit `setup.sh`
  prints (131,072 tokens on the standard terms). Pi is set to compact the
  conversation once it is within about 24,500 tokens of it. If a single
  turn still goes over, the service answers "the prompt is too long", and
  Pi compacts and retries the turn by itself.
- **Busy.** "queue_full" or "queue_timeout" means your key's requests
  already fill its streams on a node (2 on the standard terms); Pi
  retries them. A long first prompt can
  take 30 s or more before the first token.
- **Daily limit.** 20 million tokens a day, reset at 00:00 UTC. Every turn
  resends the conversation, so long sessions count up quickly.
- **Your data.** The content of requests isn't logged or stored; only
  token counts per request are kept.
- The full terms are in the contract you were sent with the key.

## Manual configuration

If you'd rather not run the script, add this to `~/.pi/agent/models.json`,
with `<host>` the host name you were sent,
and put the key in the `HS_API_KEY` environment variable. Set
`contextWindow` and `maxTokens` to your key's limits: the prompt and
output limits in your terms, or what `hscli status` shows (131,072 and
16,384 on the standard terms):

```json
{
  "providers": {
    "herding-sparks": {
      "baseUrl": "https://<host>/v1",
      "api": "openai-completions",
      "apiKey": "HS_API_KEY",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false,
        "supportsStore": false,
        "supportsUsageInStreaming": true,
        "maxTokensField": "max_tokens",
        "thinkingFormat": "qwen-chat-template"
      },
      "models": [
        {
          "id": "qwen3_8-flash-next-fp4-local",
          "name": "Qwen (Herding Sparks)",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 131072,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

and start it with `pi --model herding-sparks/qwen3_8-flash-next-fp4-local`.

Any other OpenAI-compatible client works the same way: base URL
`https://<host>/v1`, the key as the API key, model
`qwen3_8-flash-next-fp4-local`, streaming on, `max_tokens` at most 16,384.

## Feedback

Please report anything odd: errors with their `code`, slow starts, tool
calls that go wrong. The time of the request helps find it in the usage
records.
