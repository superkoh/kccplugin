#!/usr/bin/env bash
# kcc-dev-core Stop hook: post-turn test audit.
#
# When the turn ends with uncommitted source-code changes but zero
# touched test files, block the stop ONCE and hand the model a reason
# pointing at kcc-dev-core:write-unit-tests (backfill mode). The model
# either backfills tests or states why unit tests don't apply, then
# stops again — `stop_hook_active` guarantees the second stop passes,
# so no infinite loop is possible.
#
# Contract (from Claude Code hooks reference):
#   stdin  — JSON payload; fields used: .stop_hook_active, .cwd
#   stdout — either nothing (allow stop) or
#            {"decision":"block","reason":"<text>"} to continue the turn
#   exit 0 always; a broken audit must never wedge the session.
#
# Design notes:
#   - "changed" means `git diff HEAD` + untracked files, i.e. the
#     uncommitted state — not strictly "this turn". To keep that from
#     re-firing every turn, audited source paths are recorded in a
#     marker under the git dir; the audit only blocks when a source
#     file appears that is not already in it, and names just those.
#     The marker is pruned to the currently-changed set on every run,
#     so committing a file makes it audit-worthy again next time it
#     changes. No marker (unusual git layout) → every turn fires.
#   - Classification is path-based and deliberately simple: a file is
#     a TEST when a path segment is test/tests/__tests__/spec or its
#     basename matches *.test.* / *.spec.* / *_test.* / test_* / *.bats;
#     a file is SOURCE when its extension is in the code list below and
#     it is not a test. Docs, config, JSON, YAML, lockfiles never fire.
#   - Everything degrades to "allow stop" (exit 0, no output): not a
#     git repo, git missing, jq missing, empty diff.

set -uo pipefail

# --- loop guard: never block a stop that a stop hook already caused ---
stdin_raw=$(cat 2>/dev/null || true)
if command -v jq >/dev/null 2>&1; then
  active=$(printf '%s' "$stdin_raw" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
  cwd=$(printf '%s' "$stdin_raw" | jq -r '.cwd // empty' 2>/dev/null || true)
else
  case "$stdin_raw" in
    *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) active=true ;;
    *) active=false ;;
  esac
  cwd=""
fi
[[ "$active" == "true" ]] && exit 0

[[ -z "$cwd" || ! -d "$cwd" ]] && cwd="${PWD:-}"
[[ -z "$cwd" || ! -d "$cwd" ]] && exit 0
cd "$cwd" 2>/dev/null || exit 0

command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

marker=""
git_dir=$(git rev-parse --absolute-git-dir 2>/dev/null || true)
[[ -n "$git_dir" && -d "$git_dir" ]] && marker="$git_dir/kcc-dev-core-audited-sources"

# Uncommitted changes: tracked (vs HEAD when it exists) + untracked.
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  tracked=$(git diff --name-only HEAD 2>/dev/null || true)
else
  tracked=""
fi
untracked=$(git ls-files --others --exclude-standard 2>/dev/null || true)
changed=$(printf '%s\n%s\n' "$tracked" "$untracked" | sed '/^$/d' | sort -u)
if [[ -z "$changed" ]]; then
  [[ -n "$marker" ]] && rm -f "$marker" 2>/dev/null
  exit 0
fi

is_test_file() {
  local p="$1" base="${1##*/}"
  case "/$p/" in
    */test/*|*/tests/*|*/__tests__/*|*/spec/*) return 0 ;;
  esac
  case "$base" in
    *.test.*|*.spec.*|*_test.*|test_*|*.bats) return 0 ;;
  esac
  return 1
}

is_source_file() {
  local base="${1##*/}"
  case "$base" in
    *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx|*.py|*.go|*.rs|*.java|*.kt|*.kts|\
    *.rb|*.php|*.swift|*.c|*.cc|*.cpp|*.h|*.hpp|*.m|*.mm|*.cs|*.scala|\
    *.ex|*.exs|*.sh) return 0 ;;
  esac
  return 1
}

sources=()
tests=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if is_test_file "$f"; then
    tests=$((tests + 1))
  elif is_source_file "$f"; then
    sources+=("$f")
  fi
done <<<"$changed"

# Keep only marker entries still present in the current source set.
prune_marker() {
  [[ -n "$marker" && -f "$marker" ]] || return 0
  if (( ${#sources[@]} == 0 )); then
    rm -f "$marker" 2>/dev/null || true
    return 0
  fi
  local kept="" line s
  while IFS= read -r line; do
    for s in "${sources[@]}"; do
      if [[ "$line" == "$s" ]]; then
        kept+="$line"$'\n'
        break
      fi
    done
  done <"$marker"
  printf '%s' "$kept" >"$marker" 2>/dev/null || true
}

if (( ${#sources[@]} == 0 )) || (( tests > 0 )); then
  prune_marker
  exit 0
fi

# Only source files not audited yet are worth blocking over.
audited=""
[[ -n "$marker" && -f "$marker" ]] && audited=$(cat "$marker" 2>/dev/null || true)
fresh=()
for s in "${sources[@]}"; do
  printf '%s\n' "$audited" | grep -qxF -- "$s" || fresh+=("$s")
done

if (( ${#fresh[@]} == 0 )); then
  prune_marker
  exit 0
fi

[[ -n "$marker" ]] && printf '%s\n' "${sources[@]}" >"$marker" 2>/dev/null

# Blocking reason: name up to 5 offending files, keep it one paragraph.
sample=""
for ((i = 0; i < ${#fresh[@]} && i < 5; i++)); do
  sample+="${fresh[$i]}, "
done
sample="${sample%, }"
(( ${#fresh[@]} > 5 )) && sample+=", …"

reason="kcc-dev-core stop audit: this turn ends with uncommitted source changes (${sample}) and no test file touched. If any of that code branches, enter kcc-dev-core:write-unit-tests (backfill mode) — that skill decides per unit which ones earn a test, and selecting none is a valid one-line finish, so don't rule it out from the outside. Only a docs-only change or tests the user explicitly deferred skip it outright. This audit will not re-block this stop."

if command -v jq >/dev/null 2>&1; then
  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
else
  # Reason text is plain ASCII by construction except file paths; fall
  # back to a minimal manual encoding, stripping any double quotes.
  printf '{"decision":"block","reason":"%s"}\n' "${reason//\"/}"
fi
exit 0
