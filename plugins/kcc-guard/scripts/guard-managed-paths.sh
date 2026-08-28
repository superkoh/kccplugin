#!/usr/bin/env bash
# kcc PreToolUse guard: refuse edits to kcc-managed files.
#
# The lockfile says these files are managed and `--check` says so after the
# fact, but neither stops the project's own agent from editing one mid-task —
# and in a repo where an agent edits files all day, that agent is the single
# most likely source of drift. This hook turns "please don't" into "cannot".
#
# Contract (verified against a live CLI):
#   stdin  — JSON; fields used: .tool_name, .tool_input.file_path,
#            .tool_input.command, .cwd
#   stdout — nothing (allow), or a deny decision:
#            {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#             "permissionDecision":"deny","permissionDecisionReason":"<text>"}}
#   exit 0 always — a broken guard must never wedge a session.
#
# A deny here holds even under `--permission-mode bypassPermissions`
# (verified), which is what makes it worth having at all.
#
# Scope and honest limits:
#   - Edit / Write / NotebookEdit are matched exactly, by resolved path.
#     This is the path an agent actually takes, and it is deterministic.
#   - Bash is matched heuristically: the command must mention a managed path
#     AND look like it writes. A determined shell one-liner can still get
#     through (`python -c`, an unusual redirect form). This raises the cost;
#     it is not a sandbox.
#   - Nothing here stops a human in an editor. That is what `--check` is for.
#
# Everything degrades to "allow": no jq, no lockfile, unparseable stdin.

set -uo pipefail

allow() { exit 0; }

command -v jq >/dev/null 2>&1 || allow

stdin_raw=$(cat 2>/dev/null || true)
[[ -z "$stdin_raw" ]] && allow

tool=$(printf '%s' "$stdin_raw" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool" ]] && allow

cwd=$(printf '%s' "$stdin_raw" | jq -r '.cwd // empty' 2>/dev/null || true)
project_root="${CLAUDE_PROJECT_DIR:-$cwd}"
[[ -z "$project_root" || ! -d "$project_root" ]] && allow

lock="$project_root/.claude/kcc/kcc.lock.json"
[[ -f "$lock" ]] || allow

managed=$(jq -r '[.modules[]?.files // {} | keys[]] | .[]' "$lock" 2>/dev/null || true)
[[ -z "$managed" ]] && allow

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
$1 is installed and managed by kcc, and is listed in .claude/kcc/kcc.lock.json. \
Editing it here does not stick: the next installer run overwrites it, and CI's \
\`--check\` fails until it matches again. Change it in the kcc source repository \
and re-run the installer. If you genuinely need a project-local variant, that is \
a decision for the human to make, not an edit to make silently."
}

# --- exact match: the tools an agent uses to edit a file -----------------
case "$tool" in
  Edit | Write | NotebookEdit | MultiEdit)
    target=$(printf '%s' "$stdin_raw" \
      | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)
    [[ -z "$target" ]] && allow
    # Normalize to a project-relative path without requiring the file to exist.
    rel="${target#"$project_root"/}"
    [[ "$rel" == "$target" && "$target" == /* ]] && allow # outside the project
    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      if [[ "$rel" == "$m" ]]; then
        deny "$(reason_for "$m")"
      fi
    done <<<"$managed"
    allow
    ;;
esac

# --- heuristic: a shell command that both names a managed path and writes -
if [[ "$tool" == "Bash" ]]; then
  cmd=$(printf '%s' "$stdin_raw" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
  [[ -z "$cmd" ]] && allow
  case "$cmd" in
    *">"* | *"sed -i"* | *"tee "* | *" mv "* | *" cp "* | *" rm "* | \
    *"truncate"* | *"dd "* | *"chmod"* | *"perl -i"* | *"python -c"*) ;;
    *) allow ;;
  esac
  while IFS= read -r m; do
    [[ -z "$m" ]] && continue
    if [[ "$cmd" == *"$m"* ]]; then
      deny "$(reason_for "$m")"
    fi
  done <<<"$managed"
fi

allow
