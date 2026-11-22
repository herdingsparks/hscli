# hscli: Hull's type gate, then the build.
#
#   make            hull check --types, then hscli (the binary)
#   make check      hull check --types alone
#   make types      (re)install Hull's TypeScript declarations into types/
#
# Hull erases the types when it builds and does not check them; `hull check
# --types` is its gate. It runs TypeScript's compiler (node_modules/.bin/tsc,
# pinned in package.json) over tsconfig.json and tests/tsconfig.json, then
# validates the manifest and imports, runs `hull test` (tests/test_*.ts), and
# runs `hull verify`, which skips an unsigned app.

HULL ?= hull
TSC  := node_modules/.bin/tsc

.PHONY: all check types clean

all: hscli

hscli: check
	$(HULL) build -o hscli .

check: types $(TSC)
	$(HULL) check --types .

# The declarations match the hull that builds: regenerated from it each time
# (types/ is not committed). `-o` keeps hull types from writing tsconfig files
# of its own (ours are committed).
types:
	$(HULL) types . -o types >/dev/null

$(TSC): package.json package-lock.json
	npm ci --no-audit --no-fund
	@touch $@

clean:
	rm -f hscli
