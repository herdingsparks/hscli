#!/usr/bin/env bash
# Set up the Pi coding agent (https://pi.dev) to use the Herding Sparks API.
#
#   HSCLI_API_HOST=<host> bash setup.sh            asks for the key (input hidden)
#   HSCLI_API_HOST=<host> HS_API_KEY=... bash setup.sh
#
# HSCLI_API_HOST is the API's host name, sent with your key; the API is
# https://$HSCLI_API_HOST/v1.
#
# What it does:
#   1. installs Pi with npm if `pi` isn't on PATH (needs Node >= 20.6);
#   2. stores the key in ~/.config/herding-sparks/api-key, readable only by you;
#   3. adds a "herding-sparks" provider to ~/.pi/agent/models.json and makes
#      it Pi's default in ~/.pi/agent/settings.json, keeping everything else
#      in both files (the old files are kept as *.bak);
#   4. sends one short request to check the key.
# Run it again to replace the key or repair the configuration.
set -euo pipefail

MODEL="qwen38-fp4"
KEY_DIR="$HOME/.config/herding-sparks"
KEY_FILE="$KEY_DIR/api-key"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

die() { echo "setup: $*" >&2; exit 1; }

host="${HSCLI_API_HOST:-}"
[ -n "$host" ] || die "set HSCLI_API_HOST to the API's host name (sent with your key)"
case "$host" in
  */*|*:*|*" "*) die "HSCLI_API_HOST is a bare host name, not a URL or host:port: $host" ;;
esac
BASE_URL="https://$host/v1"

command -v node >/dev/null || die "Node.js >= 20.6 is needed: https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a==20&&b>=6)?0:1)' \
  || die "Node.js >= 20.6 is needed; this is $(node --version)"

if ! command -v pi >/dev/null; then
  echo "Installing Pi (npm install -g @mariozechner/pi-coding-agent)"
  npm install -g @mariozechner/pi-coding-agent
fi

key="${HS_API_KEY:-}"
if [ -z "$key" ]; then
  read -r -s -p "Herding Sparks API key: " key; echo
fi
key="$(printf '%s' "$key" | tr -d '[:space:]')"
[ -n "$key" ] || die "no key given"

umask 077
mkdir -p "$KEY_DIR" "$PI_DIR"
printf '%s\n' "$key" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

# Merge into Pi's JSON files with Node, which Pi needs anyway.
KEY_FILE="$KEY_FILE" PI_DIR="$PI_DIR" BASE_URL="$BASE_URL" MODEL="$MODEL" node <<'EOF'
const fs = require("fs"), path = require("path");
const { KEY_FILE, PI_DIR, BASE_URL, MODEL } = process.env;

function update(name, change) {
  const file = path.join(PI_DIR, name);
  let data = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    try { data = JSON.parse(text); }
    catch (e) { console.error(`setup: ${file} isn't valid JSON; fix or move it and run again`); process.exit(1); }
    fs.writeFileSync(file + ".bak", text, { mode: 0o600 });
  }
  change(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  console.log(`wrote ${file}`);
}

update("models.json", (m) => {
  m.providers = m.providers || {};
  m.providers["herding-sparks"] = {
    baseUrl: BASE_URL,
    api: "openai-completions",
    // Read at each request, so the key never sits in this file.
    apiKey: `!cat '${KEY_FILE}'`,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStore: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
      thinkingFormat: "qwen-chat-template",
    },
    models: [{
      id: MODEL,
      name: "Qwen (Herding Sparks)",
      reasoning: true,
      input: ["text"],
      // The key may send prompts up to 65,536 tokens and ask for up to
      // 16,384 output tokens; Pi must stay inside both.
      contextWindow: 65536,
      maxTokens: 16384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
  };
});

update("settings.json", (s) => {
  s.defaultProvider = "herding-sparks";
  s.defaultModel = MODEL;
  if (!s.defaultThinkingLevel) s.defaultThinkingLevel = "medium";
  // Compact once the conversation passes 65,536 - 24,576 = 40,960 tokens,
  // leaving room for a turn's tool output before the prompt limit.
  s.compaction = Object.assign({ enabled: true, keepRecentTokens: 20000 }, s.compaction, { reserveTokens: 24576 });
});
EOF

echo "Checking the key..."
if out="$(PI_OFFLINE=1 pi --no-session --model "herding-sparks/$MODEL" --thinking off -p "Reply with the single word: ready" 2>&1)"; then
  echo "Pi answered: $out"
  echo "Done. Start Pi in a project with: cd /path/to/project && pi"
else
  echo "$out" >&2
  die "the check failed; see the message above"
fi
