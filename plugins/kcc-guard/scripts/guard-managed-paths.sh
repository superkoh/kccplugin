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
# ---------------------------------------------------------------------------
# Bash policy: deny by default once a managed path is named.
#
# The first version of this guard asked "does the command look like it
# writes?" and got the answer wrong in both directions — `rm -rf <managed>`
# was allowed (the pattern required a leading space) while `cat <managed> |
# grep x > /tmp/o` was denied (any `>` counted as a write). Enumerating the
# ways a shell can mutate a file is a losing game.
#
# So the rule is inverted: if a command names a managed path, it is denied
# unless every segment that names one *leads with a known read-only command*
# and no managed path is the target of a redirect. Unknown commands deny.
# The failure mode is a rejected read, which the agent can rephrase; the
# alternative failure mode was a destroyed file.
#
# Honest limits: a managed path built up at runtime (`p=.claude/...; rm $p`)
# is invisible here, and nothing stops a human in an editor. This raises the
# cost and states the intent — it is not a sandbox. `--check` is the backstop.
# ---------------------------------------------------------------------------
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
      [[ "$rel" == "$m" ]] && deny "$(reason_for "$m")"
    done <<<"$managed"
    allow
    ;;
  Bash) ;;
  *) allow ;;
esac

# --- Bash: deny by default once a managed path is named ------------------
cmd=$(printf '%s' "$stdin_raw" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[[ -z "$cmd" ]] && allow

# Which managed paths does this command mention at all?
mentioned=()
while IFS= read -r m; do
  [[ -z "$m" ]] && continue
  [[ "$cmd" == *"$m"* ]] && mentioned+=("$m")
done <<<"$managed"
(( ${#mentioned[@]} == 0 )) && allow

# Commands that cannot modify a file they are given. Anything not on this
# list is treated as capable of writing.
is_read_only_cmd() {
  case "$1" in
    cat | bat | head | tail | less | more | nl | od | xxd | strings | \
    grep | egrep | fgrep | rg | ag | ack | \
    wc | diff | cmp | stat | ls | file | find | realpath | dirname | basename | \
    cut | sort | uniq | tr | column | fold | \
    jq | yq | md5 | md5sum | shasum | sha1sum | sha256sum | cksum | \
    echo | printf | test | true | false | pwd) return 0 ;;
    # `sed`/`awk`/`perl` only when they are not editing in place.
    sed | awk | gawk | perl) return 2 ;;
    git) return 3 ;;
  esac
  return 1
}

# git subcommands that only read.
is_read_only_git() {
  case "$1" in
    diff | log | show | status | blame | ls-files | cat-file | rev-parse | \
    describe | grep | shortlog | check-ignore | config) return 0 ;;
  esac
  return 1
}

# A managed path immediately following a redirect operator is a write, full
# stop, regardless of which command leads the segment.
for m in "${mentioned[@]}"; do
  if [[ "$cmd" =~ (\>\>?|\<\>)[[:space:]]*\"?\'?[^[:space:]\"\']*"$m" ]]; then
    deny "$(reason_for "$m")"
  fi
done

# Split into segments on ; && || | and newlines, then judge each segment that
# names a managed path by its leading word.
normalized=${cmd//&&/$'\n'}
normalized=${normalized//||/$'\n'}
normalized=${normalized//;/$'\n'}
normalized=${normalized//|/$'\n'}

while IFS= read -r segment; do
  seg_hits=()
  for m in "${mentioned[@]}"; do
    [[ "$segment" == *"$m"* ]] && seg_hits+=("$m")
  done
  (( ${#seg_hits[@]} == 0 )) && continue

  # Leading word, skipping env assignments and `sudo`/`command`/`time`.
  read -r -a words <<<"$segment"
  lead=""
  for w in "${words[@]}"; do
    case "$w" in
      *=*) continue ;;
      sudo | command | time | nohup | env | exec | builtin) continue ;;
      *) lead="${w##*/}"; break ;;
    esac
  done
  [[ -z "$lead" ]] && continue

  is_read_only_cmd "$lead"
  case $? in
    0) continue ;;                                   # definitely read-only
    2) [[ "$segment" == *" -i"* ]] && deny "$(reason_for "${seg_hits[0]}")"; continue ;;
    3)
      sub=""
      for w in "${words[@]}"; do
        [[ "$w" == git || "$w" == */git || "$w" == -* || "$w" == *=* ]] && continue
        sub="$w"; break
      done
      is_read_only_git "$sub" && continue
      deny "$(reason_for "${seg_hits[0]}")"
      ;;
    *) deny "$(reason_for "${seg_hits[0]}")" ;;      # unknown ⇒ assume it writes
  esac
done <<<"$normalized"

allow
