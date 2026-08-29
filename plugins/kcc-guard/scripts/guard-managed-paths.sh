#!/usr/bin/env bash
# kcc PreToolUse guard: stop an agent from modifying a managed file by
# accident.
#
# ---------------------------------------------------------------------------
# What this is, and what it is deliberately not
#
# It is a guardrail against an agent editing a kcc-managed file *without
# realising it is managed*, in the middle of ordinary work. It is NOT a
# security boundary, and it does not try to be: anyone who wants to get past
# it can, trivially, and that costs nothing — `--check` reports the drift and
# the next install restores the file byte-for-byte, with a backup.
#
# That fallback is what makes the error costs asymmetric, in the opposite
# direction from what a security mindset assumes:
#
#   a miss         → the edit survives until the next upgrade overwrites it.
#                    Cheap, and recoverable by design.
#   a false denial → an agent is blocked mid-task on a legitimate command,
#                    during exactly the daily use this feature protects.
#
# So the deny list is small and unambiguous, and everything else is allowed —
# including commands this script does not recognise. An earlier version
# reasoned the other way ("unknown therefore dangerous") and spent five
# rewrites chasing shell-semantics bypasses that nobody hits by accident,
# while denying `git add <managed>`, `[ -f <managed> ]`, `npm test`, and
# reading a managed file with python. That trade was backwards.
#
# Contract (verified against a live CLI):
#   stdin  — JSON; fields used: .tool_name, .tool_input.file_path,
#            .tool_input.command, .cwd
#   stdout — nothing (allow), or a deny decision:
#            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"deny","permissionDecisionReason":"<text>"}}
#   exit 0 always — a broken guard must never wedge a session.
#
# A deny holds even under `--permission-mode bypassPermissions` (verified),
# which is what makes it worth having for the accidental case at all.
#
# Scope of protection: every path in the lockfile, plus the lockfile itself
# (wholly ours, and deleting it disarms this hook). `.claude/settings.json`
# is deliberately NOT protected — it is the project's file, kcc owns only the
# hook entries inside it, and guarding it would block the team from ever
# adding their own hooks or permissions.
# ---------------------------------------------------------------------------

set -uo pipefail
# Globbing off: normalize_rel word-splits paths on `/`, and a segment holding
# a `*` would otherwise be expanded against the hook's cwd.
set -f

allow() { exit 0; }

command -v jq >/dev/null 2>&1 || allow

stdin_raw=$(cat 2>/dev/null || true)
[[ -z "$stdin_raw" ]] && allow

# One jq spawn. The separator is US (\x1f), not a tab: tab is IFS
# *whitespace*, so `read` collapses runs of it and an empty field silently
# shifts every later one — which once put the command in the wrong variable
# and disabled Bash guarding entirely. `read -d ''` so a newline inside a
# command cannot truncate the record.
fields=$(printf '%s' "$stdin_raw" | jq -j '
  [ .tool_name // ""
  , .cwd // ""
  , (.tool_input.file_path // .tool_input.notebook_path // "")
  , (.tool_input.command // "")
  ] | join("\u001f")' 2>/dev/null) || allow
[[ -z "$fields" ]] && allow

IFS=$'\037' read -r -d '' tool cwd target cmd <<<"$fields" || true
[[ -z "${tool:-}" ]] && allow

project_root="${CLAUDE_PROJECT_DIR:-${cwd:-}}"
[[ -z "$project_root" || ! -d "$project_root" ]] && allow

lock="$project_root/.claude/kcc/kcc.lock.json"
[[ -f "$lock" ]] || allow

managed=$(jq -r '[.modules[]?.files // {} | keys[]] | .[]' "$lock" 2>/dev/null || true)
[[ -z "$managed" ]] && allow
managed=$(printf '%s\n.claude/kcc/kcc.lock.json\n' "$managed")

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

reason_for() {
  printf '%s' "\
$1 is installed and managed by kcc, and is covered by .claude/kcc/kcc.lock.json. \
Editing it here does not stick: the next installer run overwrites it, and CI's \
\`--check\` fails until it matches again. Change it in the kcc source repository \
and re-run the installer. If you genuinely need a project-local variant, that is \
a decision for the human to make, not an edit to make silently."
}

# Collapse `.` and `x/..` segments. Non-zero when the path still escapes
# upward, which cannot be compared against a project-relative managed path.
normalize_rel() {
  local p="$1" seg
  local -a out=()
  local IFS=/
  for seg in $p; do
    case "$seg" in
      "" | ".") continue ;;
      "..")
        (( ${#out[@]} == 0 )) && return 1
        unset 'out[${#out[@]}-1]'
        ;;
      *) out+=("$seg") ;;
    esac
  done
  (( ${#out[@]} == 0 )) && return 1
  printf '%s' "${out[*]}"
}

# --- the file-editing tools: exact, and the path an agent actually takes --
case "$tool" in
  Edit | Write | NotebookEdit | MultiEdit)
    [[ -z "${target:-}" ]] && allow
    # A relative file_path is relative to the tool call's cwd, not the project
    # root — an edit issued from a subdirectory would otherwise sail past.
    [[ "$target" != /* ]] && target="${cwd:-$project_root}/$target"
    target="/$(normalize_rel "$target")" || allow

    # The root may be reachable under more than one spelling (on macOS a temp
    # dir is both /var/… and /private/var/…), so try each prefix.
    root_real=$(cd "$project_root" 2>/dev/null && pwd -P) || root_real="$project_root"
    rel=""
    for root in "$root_real" "$project_root"; do
      root="/$(normalize_rel "$root")"
      if [[ "$target" == "$root"/* ]]; then
        rel="${target#"$root"/}"
        break
      fi
    done
    [[ -z "$rel" ]] && allow # outside the project

    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      [[ "$rel" == "$m" ]] && deny "$(reason_for "$m")"
    done <<<"$managed"
    allow
    ;;
  Bash) ;;
  *) allow ;;
esac

# --- Bash: only the unambiguous ways a file gets written by accident -----
[[ -z "${cmd:-}" ]] && allow

# A trailing comment is not part of the command.
cmd_code=$(printf '%s\n' "$cmd" | sed 's/[[:space:]]#[^"'"'"']*$//')

mentioned=()
while IFS= read -r m; do
  [[ -z "$m" ]] && continue
  [[ "$cmd_code" == *"$m"* ]] && mentioned+=("$m")
done <<<"$managed"
(( ${#mentioned[@]} == 0 )) && allow

# 1. A managed path as the target of an output redirect. `<` is a read and is
#    deliberately not matched.
for m in "${mentioned[@]}"; do
  if [[ "$cmd_code" =~ \>\>?[[:space:]]*\"?\'?[^[:space:]\"\']*"$m" ]]; then
    deny "$(reason_for "$m")"
  fi
done

# 2. A managed path in the same segment as a command that writes files.
#    Everything not on this list is allowed — the list is meant to cover what
#    an agent reaches for while tidying up or bulk-editing, not to be
#    exhaustive over everything a shell can do.
writes_files() {
  case "${1##*/}" in
    rm | mv | cp | tee | truncate | ln | install | dd | shred | chmod | chown) return 0 ;;
  esac
  return 1
}

# In-place editing, in every spelling: -i, -i.bak, --in-place, --in-place=…,
# and clustered short forms such as -pi.
edits_in_place() {
  local lead="${1##*/}"
  shift
  case "$lead" in
    sed | gsed | perl | ruby) ;;
    *) return 1 ;;
  esac
  local w
  for w in "$@"; do
    case "$w" in
      --in-place | --in-place=*) return 0 ;;
      -i | -i.* | -i=*) return 0 ;;
      --*) continue ;;
      -*i | -*i.*) return 0 ;;
    esac
  done
  return 1
}

normalized=${cmd_code//&&/$'\n'}
normalized=${normalized//||/$'\n'}
normalized=${normalized//;/$'\n'}
normalized=${normalized//|/$'\n'}
normalized=${normalized//&/$'\n'}

while IFS= read -r segment; do
  hit=""
  for m in "${mentioned[@]}"; do
    [[ "$segment" == *"$m"* ]] && { hit="$m"; break; }
  done
  [[ -z "$hit" ]] && continue

  read -r -a words <<<"$segment"
  (( ${#words[@]} == 0 )) && continue

  for w in "${words[@]}"; do
    writes_files "$w" && deny "$(reason_for "$hit")"
    # `git checkout`/`git restore` overwrite a working-tree file.
    if [[ "${w##*/}" == "checkout" || "${w##*/}" == "restore" ]] &&
       [[ "$segment" == *git* ]]; then
      deny "$(reason_for "$hit")"
    fi
  done
  edits_in_place "${words[@]}" && deny "$(reason_for "$hit")"
done <<<"$normalized"

allow
