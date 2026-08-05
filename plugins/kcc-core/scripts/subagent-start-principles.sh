#!/usr/bin/env bash
# kcc-core SubagentStart hook: inject the subagent variant of the
# thinking principles into every spawned subagent's context.
#
# Contract (from Claude Code hooks reference):
#   stdout MUST be a single JSON object of the form
#     {"hookSpecificOutput":
#       {"hookEventName":"SubagentStart","additionalContext":"<text>"}}
#   Exit 0 on success. Non-zero is treated as a failed hook.
#
# Design notes:
#   - Self-location uses bash parameter expansion only (no `dirname`), so
#     the script can run even when PATH has been stripped.
#   - No external commands at all — JSON encoding lives in hook-lib.sh and
#     uses builtins. See the rationale at the top of that file: a vendored
#     plugin runs on machines that never installed anything for it.
#   - A missing context file degrades to exit 0 with an empty
#     additionalContext, so a broken hook never prevents a subagent from
#     starting.

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

# shellcheck source=./hook-lib.sh
. "$script_dir/hook-lib.sh"

kcc_emit_file "SubagentStart" "$plugin_root/context/thinking-principles-subagent.md"
