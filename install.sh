#!/bin/sh
# Install hscli from its GitHub release: the archive for this machine,
# checked against the release's SHA256SUMS, into ~/.local/bin.
#
#   curl -fsSL https://github.com/herdingsparks/hscli/releases/latest/download/install.sh | sh
#
# HSCLI_VERSION=0.1.0 picks a release (default: the latest);
# HSCLI_BIN_DIR picks where hscli goes (default: ~/.local/bin).
set -eu

REPO=herdingsparks/hscli
BIN_DIR=${HSCLI_BIN_DIR:-$HOME/.local/bin}
die() { echo "hscli install: $*" >&2; exit 1; }

case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) target=macos-arm64 ;;
    Linux-x86_64 | Linux-amd64) target=linux-x86_64 ;;
    Linux-aarch64 | Linux-arm64) target=linux-arm64 ;;
    *) die "no hscli build for $(uname -s) $(uname -m) (macOS arm64, Linux x86_64 and arm64); build it with Hull" ;;
esac
if command -v sha256sum >/dev/null 2>&1; then sum() { sha256sum "$1"; }
elif command -v shasum >/dev/null 2>&1; then sum() { shasum -a 256 "$1"; }
else die "needs sha256sum or shasum to check the download"; fi

if [ -n "${HSCLI_VERSION:-}" ]; then
    base="https://github.com/$REPO/releases/download/v${HSCLI_VERSION#v}"
    version=${HSCLI_VERSION#v}
else
    base="https://github.com/$REPO/releases/latest/download"
    tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") \
        || die "can't reach github.com"
    version=${tag##*/v}
    case "$version" in [0-9]*) ;; *) die "can't tell the latest release ($tag)" ;; esac
fi

name="hscli-$version-$target"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/hscli-install.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/$name.tar.gz" "$base/$name.tar.gz" || die "download failed: $base/$name.tar.gz"
curl -fsSL --retry 3 -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" || die "download failed: $base/SHA256SUMS"
want=$(awk -v f="$name.tar.gz" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
[ -n "$want" ] || die "SHA256SUMS has no line for $name.tar.gz"
got=$(sum "$tmp/$name.tar.gz" | cut -d' ' -f1)
[ "$got" = "$want" ] || die "$name.tar.gz does not match SHA256SUMS: not installed"

tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
mkdir -p "$BIN_DIR"
install -m 755 "$tmp/$name/hscli" "$BIN_DIR/hscli"
echo "hscli $version installed: $BIN_DIR/hscli"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "add $BIN_DIR to your PATH" ;; esac
echo "next: export HSCLI_API_HOST=<the host name you were sent>; hscli login; hscli status"
