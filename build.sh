#!/bin/sh
# Build hscli from source with Hull, on a machine that has neither: run it
# from a clone of this repository.
#
#   ./build.sh                 the type check, then the build: ./hscli
#   ./build.sh --no-types      the build alone (no Node.js needed)
#   HULL=/path/to/hull ./build.sh    use a hull you already have
#
# It fetches the Hull release this repository pins (HULL_VERSION) into
# ./toolchain/ with gethull.dev's installer, which checks the download
# against the release's SHA-256 manifest, then runs `make` with it: Hull's
# type gate (hull check --types: the TypeScript compiler pinned in
# package-lock.json, the manifest, imports and hull test) and hull build.
# Nothing is installed outside this directory; Hull keeps its caches in
# ~/.hull. The same steps are `make from-source` (`make from-source-no-types`).
set -eu
cd "$(dirname "$0")"
die() { echo "build.sh: $*" >&2; exit 1; }

types=1
for a in "$@"; do
    case "$a" in
        --no-types) types=0 ;;
        -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "unknown option $a (see --help)" ;;
    esac
done

command -v make >/dev/null 2>&1 || die "needs make"
if [ -z "${HULL:-}" ]; then
    command -v curl >/dev/null 2>&1 || die "needs curl to fetch Hull (or set HULL to a hull you have)"
    make toolchain
    HULL=toolchain/bin/hull
fi
if [ "$types" = 1 ]; then
    command -v npm >/dev/null 2>&1 \
        || die "the type check needs Node.js 20 or later and npm; install them, or run ./build.sh --no-types"
    make HULL="$HULL"
else
    "$HULL" build -o hscli .
fi
echo "build.sh: built ./hscli with $("$HULL" version 2>/dev/null)"
