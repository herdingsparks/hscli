# hscli: Hull's type gate, then the build.
#
#   make            hull check --types, then hscli (the binary)
#   make check      hull check --types alone
#   make types      (re)install Hull's TypeScript declarations into types/
#   make toolchain  fetch the Hull release HULL_VERSION pins into toolchain/
#   make from-source            toolchain, then all, with that hull
#   make from-source-no-types   toolchain, then hull build alone (no Node.js)
#
# Hull erases the types when it builds and does not check them; `hull check
# --types` is its gate. It runs TypeScript's compiler (node_modules/.bin/tsc,
# pinned in package.json) over tsconfig.json and tests/tsconfig.json, then
# validates the manifest and imports, runs `hull test` (tests/test_*.ts), and
# runs `hull verify`, which skips an unsigned app.
# Then a loopback-only streaming CLI test covers completion and interruption.

HULL ?= hull
TSC  := node_modules/.bin/tsc
# The Hull release this repository builds with: CI and `make toolchain` read it.
HULL_PIN := $(shell cat HULL_VERSION)

.PHONY: all check types clean toolchain from-source from-source-no-types

all: hscli

hscli: check
	$(HULL) build -o hscli .

check: types $(TSC)
	$(HULL) check --types .
	node tests/stream.mjs "$(HULL)"

# The declarations match the hull that builds: regenerated from it each time
# (types/ is not committed). `-o` keeps hull types from writing tsconfig files
# of its own (ours are committed).
types:
	$(HULL) types . -o types >/dev/null

$(TSC): package.json package-lock.json
	npm ci --no-audit --no-fund
	@touch $@

# gethull.dev's installer checks the download against the release's SHA-256
# manifest. Fetched again when HULL_VERSION changes.
toolchain: toolchain/bin/hull

toolchain/bin/hull: HULL_VERSION
	mkdir -p toolchain/bin
	curl -fsSL https://gethull.dev/install.sh | HULL_VERSION=$(HULL_PIN) HULL_PREFIX=$(CURDIR)/toolchain/bin HULL_FORCE=1 sh
	@touch $@

from-source: toolchain
	$(MAKE) all HULL=$(CURDIR)/toolchain/bin/hull

from-source-no-types: toolchain
	toolchain/bin/hull build -o hscli .

clean:
	rm -f hscli
