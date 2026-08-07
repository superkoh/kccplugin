/**
 * Turn `claude -p --output-format stream-json --verbose
 * --include-hook-events` stdout into the observables a probe scores on.
 *
 * Contract
 * --------
 * extractRun(ndjson, { projectDir, configDir })
 *
 * Returns:
 *   finalText          `.result` of the last result event, "" if none.
 *   assistantTexts     every assistant text block, in emission order —
 *                      in a multi-turn run the model answers before it
 *                      works, so the opening block is a different string
 *                      from the result event's summary.
 *   toolCalls          [{ id, name, input, ok, result }] in emission
 *                      order, from assistant `tool_use` blocks; `ok` is
 *                      true/false once a tool_result pairs up, null when
 *                      none ever did.
 *   writtenPaths       normalized, deduped file_path values of
 *                      Write/Edit/NotebookEdit calls that land inside
 *                      projectDir. Paths under configDir are dropped —
 *                      the agent writing its own memory file is not a
 *                      probe artifact.
 *   hookInjections     { [hook_event]: additionalContext } parsed out of
 *                      system/hook_response events. This is how an arm
 *                      is identified: deterministically, off the hook
 *                      payload, never off model narration.
 *   permissionDenials  length of the result event's permission_denials.
 *   costUsd, numTurns  from the result event, null when absent.
 *   invalid            true when the run must not be scored: no result
 *                      event, is_error, or any permission denial.
 *
 * Malformed or blank NDJSON lines are skipped, never thrown on — a
 * truncated tail is normal when a run hits its budget cap.
 *
 * macOS reports the same file as /tmp/x and /private/tmp/x; both
 * normalize to /tmp/x here so one write is counted once.
 */

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

export function extractRun(ndjson, { projectDir = "", configDir = "" } = {}) {
  const proj = normalizePath(projectDir);
  const cfg = normalizePath(configDir);

  const toolCalls = [];
  const assistantTexts = [];
  const hookInjections = {};
  let result = null;

  for (const line of String(ndjson ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (ev?.type === "assistant") {
      for (const block of ev.message?.content ?? []) {
        if (block?.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input ?? {},
            ok: null,
            result: "",
          });
        } else if (block?.type === "text" && typeof block.text === "string") {
          assistantTexts.push(block.text);
        }
      }
    } else if (ev?.type === "user") {
      for (const block of ev.message?.content ?? []) {
        if (block?.type !== "tool_result") continue;
        const call = toolCalls.find((c) => c.id && c.id === block.tool_use_id);
        if (!call) continue;
        call.ok = block.is_error !== true;
        call.result =
          typeof block.content === "string"
            ? block.content
            : (block.content ?? [])
                .map((p) => (typeof p === "string" ? p : (p?.text ?? "")))
                .join("");
      }
    } else if (ev?.type === "system" && ev.subtype === "hook_response") {
      try {
        const payload = JSON.parse(ev.output ?? ev.stdout ?? "");
        const spec = payload?.hookSpecificOutput ?? {};
        if (typeof spec.additionalContext === "string") {
          hookInjections[ev.hook_event ?? spec.hookEventName] = spec.additionalContext;
        }
      } catch {
        // A hook that printed non-JSON injected nothing; nothing to record.
      }
    } else if (ev?.type === "result") {
      result = ev;
    }
  }

  const writtenPaths = [];
  for (const call of toolCalls) {
    if (!WRITE_TOOLS.has(call.name)) continue;
    const raw = call.input?.file_path ?? call.input?.notebook_path ?? "";
    if (!raw) continue;
    const p = normalizePath(raw);
    if (cfg && p.startsWith(`${cfg}/`)) continue;
    if (proj && !p.startsWith(`${proj}/`)) continue;
    if (!writtenPaths.includes(p)) writtenPaths.push(p);
  }

  const denials = Array.isArray(result?.permission_denials)
    ? result.permission_denials.length
    : Number(result?.permission_denials ?? 0);

  return {
    finalText: typeof result?.result === "string" ? result.result : "",
    assistantTexts,
    toolCalls,
    writtenPaths,
    hookInjections,
    permissionDenials: denials,
    costUsd: typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null,
    numTurns: typeof result?.num_turns === "number" ? result.num_turns : null,
    invalid: !result || result.is_error === true || denials > 0,
  };
}

/** Collapse macOS's /private/{tmp,var} aliases onto their short form. */
export function normalizePath(p) {
  return typeof p === "string" ? p.replace(/^\/private(\/(?:tmp|var)\/)/, "$1") : p;
}
