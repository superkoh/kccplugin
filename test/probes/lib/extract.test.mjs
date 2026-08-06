import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRun, normalizePath } from "./extract.mjs";

const j = (o) => JSON.stringify(o);
const hookLine = (ctx) =>
  j({
    type: "system",
    subtype: "hook_response",
    hook_event: "SessionStart",
    output: j({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ctx,
      },
    }),
  });
const toolLine = (name, input) =>
  j({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
const resultLine = (over = {}) =>
  j({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "FINAL",
    total_cost_usd: 0.25,
    num_turns: 4,
    permission_denials: [],
    ...over,
  });

const OPTS = { projectDir: "/tmp/proj", configDir: "/tmp/cfg" };

const HAPPY = [
  j({ type: "system", subtype: "init" }),
  hookLine("PRINCIPLES-A"),
  "",
  "{not json",
  j({ type: "assistant", message: { content: [{ type: "thinking", thinking: "…" }] } }),
  toolLine("Read", { file_path: "/private/tmp/proj/a.log" }),
  toolLine("Write", { file_path: "/private/tmp/proj/out.md" }),
  toolLine("Write", { file_path: "/tmp/proj/out.md" }),
  toolLine("Write", { file_path: "/tmp/cfg/memory/note.md" }),
  resultLine(),
].join("\n");

test("reads the final text, cost and turn count off the result event", () => {
  const r = extractRun(HAPPY, OPTS);
  assert.equal(r.finalText, "FINAL");
  assert.equal(r.costUsd, 0.25);
  assert.equal(r.numTurns, 4);
});

// In a multi-turn run the model answers BEFORE it works: the opening
// text block is a different string from the result event's summary.
// Scoring "does the reply open with X" against the result alone reads
// as a flat zero on every tool-using probe.
test("exposes assistant text blocks in order, separately from the result", () => {
  const nd = [
    j({ type: "assistant", message: { content: [{ type: "text", text: "> 🎯 opening" }] } }),
    toolLine("Write", { file_path: "/tmp/proj/a.md" }),
    j({ type: "assistant", message: { content: [{ type: "text", text: "done, summary" }] } }),
    resultLine({ result: "done, summary" }),
  ].join("\n");
  const r = extractRun(nd, OPTS);
  assert.deepEqual(r.assistantTexts, ["> 🎯 opening", "done, summary"]);
  assert.equal(r.finalText, "done, summary");
});

test("collects tool_use blocks in order and ignores thinking blocks", () => {
  const r = extractRun(HAPPY, OPTS);
  assert.deepEqual(
    r.toolCalls.map((c) => c.name),
    ["Read", "Write", "Write", "Write"]
  );
  assert.equal(r.toolCalls[0].input.file_path, "/private/tmp/proj/a.log");
});

test("written paths dedupe across the /private alias and exclude the config dir", () => {
  const r = extractRun(HAPPY, OPTS);
  assert.deepEqual(r.writtenPaths, ["/tmp/proj/out.md"]);
});

test("exposes the injected hook context keyed by hook event", () => {
  const r = extractRun(HAPPY, OPTS);
  assert.equal(r.hookInjections.SessionStart, "PRINCIPLES-A");
});

test("a clean run is scoreable", () => {
  const r = extractRun(HAPPY, OPTS);
  assert.equal(r.permissionDenials, 0);
  assert.equal(r.invalid, false);
});

test("skips malformed and blank lines and still reads the good ones", () => {
  const r = extractRun("\n{oops\n\n" + resultLine(), OPTS);
  assert.equal(r.finalText, "FINAL", "garbage before a valid line must not swallow it");
});

test("a permission denial invalidates the run", () => {
  const nd = [hookLine("X"), resultLine({ permission_denials: [{ tool_name: "Write" }] })].join("\n");
  const r = extractRun(nd, OPTS);
  assert.equal(r.permissionDenials, 1);
  assert.equal(r.invalid, true, "a denied tool call makes the arm unmeasurable, not a failure");
});

test("a missing result event invalidates the run", () => {
  const r = extractRun([hookLine("X"), toolLine("Read", {})].join("\n"), OPTS);
  assert.equal(r.finalText, "");
  assert.equal(r.invalid, true);
});

test("an errored result invalidates the run", () => {
  const nd = [hookLine("X"), resultLine({ is_error: true, subtype: "error_max_budget_usd" })].join("\n");
  assert.equal(extractRun(nd, OPTS).invalid, true);
});

// A locked-out tool the model *tried* is not an escape: the call was
// refused and nothing ran. Only a call that actually executed means the
// run measured something other than the probe.
const WITH_RESULTS = [
  j({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
    },
  }),
  j({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "t1",
          is_error: true,
          content: "<tool_use_error>No such tool available: Bash",
        },
      ],
    },
  }),
  j({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: "t2", name: "Monitor", input: { command: "ls" } }],
    },
  }),
  j({
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: "t2", content: "Monitor started" }],
    },
  }),
  j({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "t3", name: "Read", input: {} }] },
  }),
  resultLine(),
].join("\n");

// A subagent's answer comes back as the Agent call's tool_result. Its
// text is the observable for subagent probes — reading it off the
// payload avoids trusting the orchestrator to relay it faithfully.
test("a tool call carries its result text", () => {
  const r = extractRun(WITH_RESULTS, OPTS);
  assert.equal(r.toolCalls[1].result, "Monitor started");
  assert.equal(r.toolCalls[2].result, "", "no result yet means empty, not undefined");
});

test("a refused tool call is marked as not having run", () => {
  const r = extractRun(WITH_RESULTS, OPTS);
  assert.equal(r.toolCalls[0].name, "Bash");
  assert.equal(r.toolCalls[0].ok, false);
});

test("a tool call with a non-error result is marked as having run", () => {
  const r = extractRun(WITH_RESULTS, OPTS);
  assert.equal(r.toolCalls[1].name, "Monitor");
  assert.equal(r.toolCalls[1].ok, true);
});

test("a tool call with no result at all is unknown, not assumed to have run", () => {
  const r = extractRun(WITH_RESULTS, OPTS);
  assert.equal(r.toolCalls[2].name, "Read");
  assert.equal(r.toolCalls[2].ok, null);
});

test("normalizePath collapses the macOS /private aliases only", () => {
  assert.equal(normalizePath("/private/tmp/a"), "/tmp/a");
  assert.equal(normalizePath("/private/var/x"), "/var/x");
  assert.equal(normalizePath("/tmp/a"), "/tmp/a");
  assert.equal(normalizePath("/private/other/a"), "/private/other/a");
});
