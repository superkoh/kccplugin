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
# What is protected
#
# Every path in the lockfile, plus `.claude/kcc/kcc.lock.json` itself — the
# lock is wholly ours, and deleting it disarms this guard in one command.
#
# `.claude/settings.json` is deliberately NOT protected. It is the project's
# file; the installer owns only the hook entries inside it, and guarding the
# whole file would permanently block the team from adding their own hooks,
# permissions or env. Drift in our entries there is `--check`'s job.
#
# Bash policy: deny by default once a managed path is named, and judge the
# WHOLE command, not the segment the path happens to sit in.
#
# Asking "does this look like a write?" lost repeatedly: `rm -rf <managed>`
# passed because a pattern needed a leading space; `find <managed> -delete`
# and `sort -o <managed>` passed because both were on a read-only list;
# `sed --in-place` and `perl -pi` passed because the probe matched a literal
# " -i"; `sed -n 'w <managed>'` and `perl -e 'open(...)'` write with no flag
# at all. Reasoning about what each command *can* do is a losing game.
#
# Judging per segment lost too: `echo <managed> | xargs rm` launders the path
# — the segment naming it is a harmless `echo`, and the segment that deletes
# never mentions it.
#
# So the rule is: if a command names a managed path, EVERY command in it must
# be one that cannot write a file — no exceptions for flags, no per-segment
# reasoning. Unknown commands deny. `sed`, `perl`, `ruby`, `python`, `node`
# and `xargs` are not on the list precisely because they take a program.
#
# Honest limits: a managed path built up at runtime (`p=.claude/...; rm $p`)
# is invisible here, and nothing stops a human in an editor. This raises the
# cost and states the intent — it is not a sandbox. `--check` is the backstop.
# ---------------------------------------------------------------------------
#
# Everything degrades to "allow": no jq, no lockfile, unparseable stdin.

set -uo pipefail
# Globbing off for the whole script: normalize_rel splits paths on `/` with
# word splitting, and a segment containing `*` would otherwise be expanded
# against the hook's cwd, turning a path into a directory listing.
set -f

allow() { exit 0; }

command -v jq >/dev/null 2>&1 || allow

stdin_raw=$(cat 2>/dev/null || true)
[[ -z "$stdin_raw" ]] && allow

# One jq spawn for everything we need. This is the hottest path in a session
# — it runs before every Edit, Write and Bash — against a 5s hook timeout.
#
# The separator is US (\x1f), not a tab: tab is IFS *whitespace*, so `read`
# collapses runs of it and an empty field silently shifts every later one.
# With a file_path-less Bash call that put the command in the wrong variable
# and disabled Bash guarding entirely. `read -d ''` so an embedded newline in
# a command does not truncate the record.
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
# The lockfile arms this guard, and the lockfile never lists itself.
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

# Collapse `.` and `x/..` segments. Returns non-zero when the path still
# escapes upward after collapsing, because such a path cannot be compared
# against a project-relative managed path and must not be silently rewritten
# into one that happens to match nothing.
normalize_rel() {
  local p="$1" seg
  local -a out=()
  local IFS=/
  for seg in $p; do
    case "$seg" in
      "" | ".") continue ;;
      "..")
        if (( ${#out[@]} == 0 )); then
          return 1 # escapes above the base
        fi
        unset 'out[${#out[@]}-1]'
        ;;
      *) out+=("$seg") ;;
    esac
  done
  (( ${#out[@]} == 0 )) && return 1
  printf '%s' "${out[*]}"
}

# --- exact match: the tools an agent uses to edit a file -----------------
case "$tool" in
  Edit | Write | NotebookEdit | MultiEdit)
    [[ -z "${target:-}" ]] && allow
    # A relative file_path is relative to the tool call's cwd, which is not
    # necessarily the project root — an Edit issued from a subdirectory would
    # otherwise sail straight past the comparison.
    [[ "$target" != /* ]] && target="${cwd:-$project_root}/$target"
    # Collapse the absolute path BEFORE comparing. `<root>/../<root-basename>/x`
    # literally starts with `<root>/`, so a prefix test alone would hand back a
    # relative path that still walks out and back in, matching nothing.
    target="/$(normalize_rel "$target")" || allow

    # The root may be reachable under more than one spelling (on macOS a temp
    # dir is both /var/... and /private/var/...), so try each prefix.
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

    rel=$(normalize_rel "$rel") || allow
    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      [[ "$rel" == "$(normalize_rel "$m")" ]] && deny "$(reason_for "$m")"
    done <<<"$managed"
    allow
    ;;
  Bash) ;;
  *) allow ;;
esac

# --- Bash: deny by default once a managed path is named ------------------
[[ -z "${cmd:-}" ]] && allow

# A trailing comment is not part of the command, and treating it as one both
# denies harmless commands and tells the user nothing useful.
cmd_code=$(printf '%s\n' "$cmd" | sed 's/[[:space:]]#[^"'"'"']*$//')

mentioned=()
while IFS= read -r m; do
  [[ -z "$m" ]] && continue
  [[ "$cmd_code" == *"$m"* ]] && mentioned+=("$m")
done <<<"$managed"
(( ${#mentioned[@]} == 0 )) && allow

# Commands with no way to modify a file they are given as an argument.
#
# `find` and `sort` are deliberately NOT here: `find <path> -delete` and
# `sort -o <path>` both write. Nor is anything that takes a script (`python`,
# `node`, `xargs`) — the argument is not the whole story for those.
# Commands that cannot write a file, whatever arguments they are given.
#
# `sed`, `perl`, `ruby`, `python`, `node` and `xargs` are deliberately absent:
# each takes a program, so no flag inspection can decide what it will do.
# `find` and `sort` are absent for the same reason in miniature (`-delete`,
# `-o`). The shell test builtins are present because an agent checking whether
# a managed file exists is doing exactly what this guard wants to allow.
is_read_only_cmd() {
  case "$1" in
    cat | bat | head | tail | less | more | nl | od | xxd | strings | \
    grep | egrep | fgrep | rg | ag | ack | \
    wc | diff | cmp | stat | ls | file | realpath | dirname | basename | \
    cut | column | fold | \
    jq | yq | md5 | md5sum | shasum | sha1sum | sha256sum | cksum | \
    echo | printf | test | true | false | pwd | "[" | "[[") return 0 ;;
    git) return 3 ;;
  esac
  return 1
}

# `add` is here because the installer's own closing line tells the user to
# commit the payload; staging cannot modify the working-tree file.
is_read_only_git() {
  case "$1" in
    add | diff | log | show | status | blame | ls-files | cat-file | \
    rev-parse | describe | grep | shortlog | check-ignore) return 0 ;;
  esac
  return 1
}

# A managed path immediately following a redirect operator is a write, full
# stop, regardless of which command leads the segment.
for m in "${mentioned[@]}"; do
  if [[ "$cmd_code" =~ (\>\>?|\<\>)[[:space:]]*\"?\'?[^[:space:]\"\']*"$m" ]]; then
    deny "$(reason_for "$m")"
  fi
done

# Split into segments. Command substitutions become segments of their own —
# `echo $(rm <managed>)` leads with a read-only `echo`, but the body is the
# part that matters.
normalized=${cmd_code//&&/$'\n'}
normalized=${normalized//||/$'\n'}
normalized=${normalized//;/$'\n'}
normalized=${normalized//|/$'\n'}
normalized=${normalized//\$\(/$'\n'}
normalized=${normalized//\`/$'\n'}
normalized=${normalized//)/$'\n'}

# Every command in the whole line must be read-only. Which segment holds the
# managed path is irrelevant — that is exactly how a pipe launders it.
while IFS= read -r segment; do
  read -r -a words <<<"$segment"
  (( ${#words[@]} == 0 )) && continue
  lead=""
  lead_idx=0
  for w in "${words[@]}"; do
    lead_idx=$((lead_idx + 1))
    case "$w" in
      *=*) continue ;;
      sudo | command | time | nohup | env | exec | builtin) continue ;;
      *) lead="${w##*/}"; break ;;
    esac
  done
  [[ -z "$lead" ]] && continue

  is_read_only_cmd "$lead"
  case $? in
    0) continue ;;
    3)
      sub=""
      for w in "${words[@]:$lead_idx}"; do
        [[ "$w" == -* || "$w" == *=* ]] && continue
        sub="$w"; break
      done
      is_read_only_git "$sub" && continue
      deny "$(reason_for "${mentioned[0]}")"
      ;;
    *) deny "$(reason_for "${mentioned[0]}")" ;;
  esac
done <<<"$normalized"

allow
