#!/bin/sh
# A built hscli runs on this machine: it says its version, and refuses to
# reach anything while HSCLI_API_HOST is unset.
#
# Usage:  sh tests/smoke.sh path/to/hscli [expected-version]
set -u
BIN=$1 WANT=${2:-}
fail=0
check() { if eval "$2"; then echo "  PASS  $1"; else echo "  FAIL  $1"; fail=1; fi; }
STATE=$(mktemp -d "${TMPDIR:-/tmp}/hscli-smoke.XXXXXX"); trap 'rm -rf "$STATE"' EXIT

v=$("$BIN" --version 2>/dev/null)
check "--version prints hscli VERSION" 'case "$v" in "hscli "?*) true;; *) false;; esac'
[ -n "$WANT" ] && check "  and it is $WANT" '[ "$v" = "hscli $WANT" ]'
err=$(env -u HSCLI_API_HOST HULL_STATE_DIR="$STATE" "$BIN" status 2>&1 >/dev/null); rc=$?
check "status without HSCLI_API_HOST: non-zero, names the variable" '[ $rc -ne 0 ] && case "$err" in *HSCLI_API_HOST*) true;; *) false;; esac'
out=$(HULL_STATE_DIR="$STATE" "$BIN" shell-init 2>/dev/null)
check "shell-init prints hs-pi" 'case "$out" in *"hs-pi"*) true;; *) false;; esac'
exit $fail
