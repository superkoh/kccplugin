#!/usr/bin/env bash
# kcc one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/superkoh/kccplugin/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --all
#   curl -fsSL .../install.sh | bash -s -- --modules kcc-core,kcc-dev-core
#   curl -fsSL .../install.sh | bash -s -- --check
#
# Install and upgrade are the same command: it reconciles whatever is already
# in this project against what the pinned source ships. Every flag is passed
# straight through to installer/install.mjs (`--help` lists them).
#
# Pin a release with KCC_REF (branch, tag or commit):
#   curl -fsSL .../install.sh | KCC_REF=v0.5.0 bash -s -- --all
#
# Note on interactivity: when this script is piped into bash, stdin is the
# script itself, so the Node installer reads its prompts from /dev/tty. If
# there is no terminal at all (CI), pass --all or --modules explicitly.

set -euo pipefail

KCC_REPO="${KCC_REPO:-superkoh/kccplugin}"
KCC_REF="${KCC_REF:-main}"
KCC_TARGET="${KCC_TARGET:-$PWD}"

say() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"
command -v tar >/dev/null 2>&1 || die "tar is required"
command -v node >/dev/null 2>&1 || die \
  "node is required (>= 18). Install Node, or clone the repo and run installer/install.mjs."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 18 ]; then
  die "node >= 18 required, found $(node -v)"
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/kcc-install.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT INT TERM

say "kcc: fetching ${KCC_REPO}@${KCC_REF}…"
if ! curl -fsSL "https://codeload.github.com/${KCC_REPO}/tar.gz/${KCC_REF}" \
  | tar -xz --strip-components=1 -C "$tmp"; then
  die "could not download ${KCC_REPO}@${KCC_REF} — check the repo name and ref"
fi

[ -f "$tmp/installer/install.mjs" ] || die "downloaded archive has no installer/install.mjs"

exec node "$tmp/installer/install.mjs" \
  --source "$tmp" \
  --target "$KCC_TARGET" \
  --ref "$KCC_REF" \
  "$@"
