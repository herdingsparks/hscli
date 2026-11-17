# Pi with the Herding Sparks API

[Pi](https://pi.dev) is a terminal coding agent. These steps point it at
the Herding Sparks API (`https://api.sparks.artalis.io/v1`, model
`qwen38-fp4`). Tested with Pi 0.73.1 on 2026-11-17.

## Setup

You need Node.js 20.6 or later and the key you were sent.

```bash
bash setup.sh
```

It asks for the key without echoing it, installs Pi if needed, stores the
key in `~/.config/herding-sparks/api-key` (readable only by you), adds the
provider to `~/.pi/agent/models.json`, makes it Pi's default, and sends
one short request to check the key. Your other Pi providers and settings
are kept; the previous files are saved as `*.bak`.

Then, in any project:

```bash
cd /path/to/project
pi
```

## Things to know

- **Thinking.** The model thinks before answering. `--thinking off`, or
  shift+tab in Pi, turns it off for quick work; `medium` is the default.
- **Context.** Your key can send prompts up to 65,536 tokens. Pi is set to
  compact the conversation once it passes about 41,000 tokens. If a single
  turn still goes over, the service answers "the prompt is too long", and
  Pi compacts and retries the turn by itself.
- **Busy.** "queue_full" or "queue_timeout" means four of your requests
  are already running on a node; Pi retries them. A long first prompt can
  take 30 s or more before the first token.
- **Daily limit.** 20 million tokens a day, reset at 00:00 UTC. Every turn
  resends the conversation, so long sessions count up quickly.
- **Your data.** The content of requests isn't logged or stored; only
  token counts per request are kept.
- The full terms are in the contract you were sent with the key.

## Manual configuration

If you'd rather not run the script, add this to `~/.pi/agent/models.json`
and put the key in the `HS_API_KEY` environment variable:

```json
{
  "providers": {
    "herding-sparks": {
      "baseUrl": "https://api.sparks.artalis.io/v1",
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
          "id": "qwen38-fp4",
          "name": "Qwen (Herding Sparks)",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 65536,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

and start it with `pi --model herding-sparks/qwen38-fp4`.

Any other OpenAI-compatible client works the same way: base URL
`https://api.sparks.artalis.io/v1`, the key as the API key, model
`qwen38-fp4`, streaming on, `max_tokens` at most 16,384.

## Feedback

Please report anything odd: errors with their `code`, slow starts, tool
calls that go wrong. The time of the request helps find it in the usage
records.
