#!/usr/bin/env bash
# Shared helpers for this plugin's hook scripts. Source it; do not run it.
#
# Why this exists: everything below is bash builtins only — no jq, no
# python, not even `sed` or `cat`. These hooks used to shell out to jq and
# degrade to "inject nothing" when it was missing, which is indistinguishable
# from the plugin not being installed at all. That was survivable while the
# plugin only ever landed on the machine of someone who chose to install it.
# It is not survivable once a project vendors the plugin into its repo
# (see install.sh) and it starts running on teammates' and CI machines that
# never opted into anything. Zero dependencies means that failure mode
# cannot happen.
#
# Requires bash 3.2+ (what macOS ships) — no associative arrays, no `${x^^}`.

# Escape a string into a JSON string body (without the surrounding quotes).
#
# Covers the characters JSON requires escaping that can plausibly occur in a
# markdown file. The remaining C0 control characters (0x00-0x1f) would need
# escaping too; handling them here would mean a per-character loop over every
# injection, so instead the shipped context files are asserted free of them
# by tests/unit/hook-encoding.test.mjs. That check belongs at the repo
# boundary, not in the hot path.
kcc_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"   # backslashes FIRST — every later rule adds backslashes
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Print the empty-injection envelope for <event>.
kcc_emit_empty() {
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":""}}\n' "$1"
}

# Print the envelope for <event> carrying the full contents of <file>.
#
# A missing file degrades to the empty envelope: a broken hook must never
# stop a session from starting.
kcc_emit_file() {
  local event="$1"
  local file="$2"
  local content=""
  if [[ ! -f "$file" ]]; then
    kcc_emit_empty "$event"
    return 0
  fi
  # `read -d ''` swallows the whole file — trailing newlines included — and
  # returns non-zero at EOF because it never finds the NUL delimiter.
  IFS= read -r -d '' content <"$file" || true
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
    "$event" "$(kcc_json_escape "$content")"
}

# Extract `.cwd` from a hook's stdin payload without a JSON parser.
#
# Deliberately shallow: the value is a filesystem path, so the first
# `"cwd": "..."` match is the answer, and callers always keep a $PWD
# fallback for the case where this finds nothing.
kcc_json_string_field() {
  local payload="$1"
  local field="$2"
  local re="\"$field\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""
  if [[ "$payload" =~ $re ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# Read this hook's entire stdin payload using only builtins. Claude Code
# closes the hook's stdin after sending it, so this does not hang.
kcc_read_stdin() {
  local payload=""
  IFS= read -r -d '' payload || true
  printf '%s' "$payload"
}
