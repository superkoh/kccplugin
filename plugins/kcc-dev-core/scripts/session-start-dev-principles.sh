#!/usr/bin/env bash
# kcc-dev-core SessionStart hook: CONDITIONALLY inject the
# development-discipline principles into Claude Code's context, but only
# when the session is operating inside a software project.
#
# Contract (from Claude Code hooks reference):
#   stdout MUST be a single JSON object of the form
#     {"hookSpecificOutput":
#       {"hookEventName":"SessionStart","additionalContext":"<text>"}}
#   Exit 0 on success. Non-zero is treated as a failed hook.
#
# Design notes:
#   - Self-location uses bash parameter expansion only (no `dirname`), so
#     the script can run even when PATH has been stripped — this matters
#     for the L2 bats test that proves graceful degrade when jq is absent.
#   - The script is intentionally tolerant: missing cwd, missing dev
#     signals, missing file, and missing jq all degrade to exit 0 with
#     an empty additionalContext, so a broken hook never prevents the
#     user's session from starting.
#   - Detection is intentionally LOOSE: the presence of any one of many
#     well-known dev-project signals (package.json, Cargo.toml, .git/,
#     Makefile, Dockerfile, ...) within cwd or up to 6 ancestor
#     directories is enough. False positives (injecting dev principles
#     when the user is just browsing) are cheap; false negatives
#     (missing a real dev scene) defeat the whole plugin.
#   - cwd resolution is double-belted: first try to read `.cwd` from the
#     SessionStart hook's stdin JSON, then fall back to $PWD. Either path
#     keeps the hook working whether or not Claude Code's stdin schema
#     lands with that field.
#   - jq -Rs reads the file as a single raw string and JSON-encodes it,
#     which is the only safe way to escape UTF-8 + newlines + quotes +
#     backticks in one step.

set -euo pipefail
shopt -s nullglob

# Resolve script path to an absolute form using builtins only. Claude
# Code invokes hooks with an absolute path (via ${CLAUDE_PLUGIN_ROOT}),
# so $0 normally already starts with /. We still handle the relative
# case for robustness.
if [[ "$0" = /* ]]; then
  script_path="$0"
else
  script_path="${PWD:-.}/$0"
fi
script_dir="${script_path%/*}"
plugin_root="${script_dir%/*}"
text_file="$plugin_root/context/dev-principles.md"

emit_empty() {
  printf '%s\n' \
    '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}'
}

# ---------------------------------------------------------------------
# Step A: resolve cwd. Prefer the `.cwd` field from the hook's stdin
# JSON; fall back to $PWD. Either one alone is enough.
# ---------------------------------------------------------------------
cwd=""
if command -v jq >/dev/null 2>&1; then
  # `cat` blocks until stdin closes. Claude Code closes the hook's
  # stdin after sending the payload, so this does not hang.
  stdin_raw=$(cat 2>/dev/null || true)
  if [[ -n "$stdin_raw" ]]; then
    cwd=$(printf '%s' "$stdin_raw" | jq -r '.cwd // empty' 2>/dev/null || true)
  fi
fi
if [[ -z "$cwd" ]]; then
  cwd="${PWD:-}"
fi
if [[ -z "$cwd" ]] || [[ ! -d "$cwd" ]]; then
  emit_empty
  exit 0
fi

# ---------------------------------------------------------------------
# Step B: loose "is this a dev scene?" detection.
#
# Walk from $cwd upward, checking each ancestor directory for any known
# dev-project signal. Stop at the filesystem root or after 7 levels
# (cwd + 6 ancestors), whichever comes first. The signal list is
# deliberately broad — covers every mainstream VCS, package manager,
# build system, and IDE hint file I could think of. Extending is a
# one-line PR.
# ---------------------------------------------------------------------
is_dev_scene() {
  local dir="$1"
  local depth=0
  local f
  while [[ -n "$dir" ]] && (( depth < 7 )); do
    # VCS
    [[ -d "$dir/.git" ]] && return 0
    [[ -d "$dir/.hg" ]] && return 0
    [[ -d "$dir/.svn" ]] && return 0
    # Node / TS / Deno / Bun
    [[ -f "$dir/package.json" ]] && return 0
    [[ -f "$dir/pnpm-lock.yaml" ]] && return 0
    [[ -f "$dir/yarn.lock" ]] && return 0
    [[ -f "$dir/bun.lockb" ]] && return 0
    [[ -f "$dir/deno.json" ]] && return 0
    [[ -f "$dir/deno.jsonc" ]] && return 0
    [[ -f "$dir/tsconfig.json" ]] && return 0
    # Rust
    [[ -f "$dir/Cargo.toml" ]] && return 0
    # Python
    [[ -f "$dir/pyproject.toml" ]] && return 0
    [[ -f "$dir/setup.py" ]] && return 0
    [[ -f "$dir/setup.cfg" ]] && return 0
    [[ -f "$dir/requirements.txt" ]] && return 0
    [[ -f "$dir/Pipfile" ]] && return 0
    # Go
    [[ -f "$dir/go.mod" ]] && return 0
    # JVM
    [[ -f "$dir/pom.xml" ]] && return 0
    [[ -f "$dir/build.gradle" ]] && return 0
    [[ -f "$dir/build.gradle.kts" ]] && return 0
    [[ -f "$dir/settings.gradle" ]] && return 0
    # Ruby
    [[ -f "$dir/Gemfile" ]] && return 0
    # PHP
    [[ -f "$dir/composer.json" ]] && return 0
    # C / C++ / build systems
    [[ -f "$dir/CMakeLists.txt" ]] && return 0
    [[ -f "$dir/meson.build" ]] && return 0
    [[ -f "$dir/configure.ac" ]] && return 0
    [[ -f "$dir/Makefile" ]] && return 0
    [[ -f "$dir/makefile" ]] && return 0
    # Elixir / Erlang
    [[ -f "$dir/mix.exs" ]] && return 0
    [[ -f "$dir/rebar.config" ]] && return 0
    # Haskell
    [[ -f "$dir/stack.yaml" ]] && return 0
    # Containers / DevOps
    [[ -f "$dir/Dockerfile" ]] && return 0
    [[ -f "$dir/docker-compose.yml" ]] && return 0
    [[ -f "$dir/docker-compose.yaml" ]] && return 0
    # Repo hints
    [[ -f "$dir/.editorconfig" ]] && return 0
    [[ -f "$dir/CLAUDE.md" ]] && return 0
    # .NET — glob expansions (nullglob set at the top makes this safe
    # when no file matches)
    for f in "$dir"/*.sln "$dir"/*.csproj "$dir"/global.json; do
      [[ -f "$f" ]] && return 0
    done
    # Haskell cabal projects
    for f in "$dir"/*.cabal; do
      [[ -f "$f" ]] && return 0
    done

    # Stop walking once we've checked the filesystem root.
    if [[ "$dir" == "/" ]]; then
      break
    fi
    # Move up one directory. `${dir%/*}` collapses to empty string for
    # a top-level path like "/foo", so we normalize back to "/" so the
    # root check runs once.
    local parent="${dir%/*}"
    if [[ -z "$parent" ]]; then
      parent="/"
    fi
    dir="$parent"
    depth=$((depth + 1))
  done
  return 1
}

if ! is_dev_scene "$cwd"; then
  emit_empty
  exit 0
fi

# ---------------------------------------------------------------------
# Step C: read the principles file and inject.
# ---------------------------------------------------------------------
if [[ ! -f "$text_file" ]]; then
  emit_empty
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "kcc-dev-core session-start hook: jq not found on PATH, skipping injection" >&2
  emit_empty
  exit 0
fi

jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}}' \
  <"$text_file"
