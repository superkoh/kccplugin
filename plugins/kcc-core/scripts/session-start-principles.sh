#!/usr/bin/env bash
# kcc-core SessionStart hook: inject the top-level thinking & communication
# principles into Claude Code's context before the first user turn.
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
#   - The script is intentionally tolerant: missing file or missing jq
#     both degrade to exit 0 with an empty additionalContext, so a
#     broken hook never prevents the user's session from starting.
#   - jq -Rs reads the file as a single raw string and JSON-encodes it,
#     which is the only safe way to escape UTF-8 + newlines + quotes +
#     backticks in one step.

set -euo pipefail

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
text_file="$plugin_root/context/thinking-principles.md"

emit_empty() {
  printf '%s\n' \
    '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}'
}

if [[ ! -f "$text_file" ]]; then
  emit_empty
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "kcc-core session-start hook: jq not found on PATH, skipping injection" >&2
  emit_empty
  exit 0
fi

jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}}' \
  <"$text_file"
