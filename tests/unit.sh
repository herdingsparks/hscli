#!/usr/bin/env bash
# hscli's unit cases (tests/unit/app.js) as a small Hull app. Hull resolves
# imports only inside the app's directory, so commands/ and lib/ are copied
# next to it first.
#
# Usage:  bash tests/unit.sh      (HULL=/path/to/hull to pick a hull)
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HULL=${HULL:-hull}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/hscli-unit.XXXXXX"); trap 'rm -rf "$WORK"' EXIT
cp -R "$ROOT/commands" "$ROOT/lib" "$WORK/"
cp "$ROOT/tests/unit/app.js" "$WORK/app.js"
HULL_STATE_DIR="$WORK/state" "$HULL" "$WORK/app.js" 2>&1 | grep -v -E '^[0-9]{2}:[0-9]{2}:[0-9]{2} (INFO|DEBUG|WARN)'
exit "${PIPESTATUS[0]}"
