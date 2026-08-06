#!/usr/bin/env node
/**
 * A/B probe runner: measures the marginal value of one injected rule.
 *
 *   node test/probes/run-probe.mjs --probes s1a-trigger --arms B,A --n 5
 *
 * Arms are deliberately run B-first by default. If the ablated arm
 * passes every run, the rule has no marginal value and arm A never
 * needs to be paid for.
 *
 * Auth: export CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) before
 * invoking — this runner seals HOME, which breaks a keychain read.
 *
 * Results land as one JSON file per run plus an appendable index, so a
 * killed campaign can be resumed and re-aggregated by report.mjs.
 */
import { mkdir, writeFile, appendFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClaude } from "../lib/claude-runner.mjs";
import { extractRun } from "./lib/extract.mjs";
import { makeSealedWorkspace, makePluginVariant } from "./lib/seal.mjs";
import { runJudge } from "./lib/judge.mjs";
import { looksLikeHallucinatedToolUse } from "./lib/score.mjs";
import { caseToProbe } from "./lib/cases.mjs";
import { PROBES as S1_PROBES } from "./probes/s1.mjs";
import { PROBES as W_PROBES } from "./probes/w.mjs";
import { PROBES as SUB_PROBES } from "./probes/sub.mjs";

const BUILTIN_PROBES = [...S1_PROBES, ...W_PROBES, ...SUB_PROBES];

// Candidate cases live in JSON so a screening round can be defined
// without touching code; most candidates are discarded for having no
// red gate, and code churn per discard is not worth paying.
const casesFile = process.argv.includes("--cases")
  ? process.argv[process.argv.indexOf("--cases") + 1]
  : null;
const PROBES = casesFile
  ? [...BUILTIN_PROBES, ...JSON.parse(await readFile(casesFile, "utf-8")).map(caseToProbe)]
  : BUILTIN_PROBES;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const PLUGIN_ROOT = path.join(REPO, "plugins", "kcc-core");
const DEFAULT_MODEL = "claude-opus-5";
const CONCURRENCY = Number(
  process.argv.includes("--concurrency")
    ? process.argv[process.argv.indexOf("--concurrency") + 1]
    : 3
);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function runOnce(probe, arm, i, outDir) {
  const runId = `${probe.id}-${arm}-${i}`;
  // Outside the repo, always: CLAUDE.md discovery walks up from cwd, so a
  // workspace under .probe-runs/ would hand the model this repo's CLAUDE.md
  // and .claude/skills/ — measured once as a 3-minute tool spiral.
  const runDir = path.join(tmpdir(), "kcc-probes", runId);
  await rm(runDir, { recursive: true, force: true });
  await mkdir(runDir, { recursive: true });

  const ws = await makeSealedWorkspace(runDir);
  for (const [rel, content] of Object.entries(probe.fixture ?? {})) {
    const dest = path.join(ws.projectDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, rel.endsWith(".sh") ? { mode: 0o755 } : undefined);
  }
  const variant = await makePluginVariant(runDir, {
    pluginRoot: PLUGIN_ROOT,
    ruleId: probe.rule,
    arm,
  });

  const res = await runClaude({
    prompt: probe.prompt,
    pluginDirs: [variant.pluginDir],
    model: arg("model", DEFAULT_MODEL),
    disallowedTools: probe.disallowedTools,
    maxBudgetUsd: probe.maxBudgetUsd ?? 0.5,
    outputFormat: "stream-json",
    includeHookEvents: true,
    timeoutMs: 300_000,
    cwd: ws.projectDir,
    env: ws.env,
  });

  const run = extractRun(res.stdout, {
    projectDir: ws.projectDir,
    configDir: ws.configDir,
  });

  // Arm attribution, read off the hook payload — never off the model.
  // Which hook carries it depends on the doc under test: the main-session
  // principles arrive at SessionStart, the subagent variant at
  // SubagentStart, so accept the sentinel from either.
  const armProven = Object.values(run.hookInjections).some((text) =>
    text.includes(variant.sentinel)
  );

  // A tool call outside the probe's declared set means the model routed
  // around the lockdown; that run measured something other than the
  // probe and is voided rather than scored.
  const expected = new Set(probe.expectedTools ?? []);
  const unexpectedTools = [
    ...new Set(
      run.toolCalls.filter((c) => c.ok === true && !expected.has(c.name)).map((c) => c.name)
    ),
  ];

  const faked = looksLikeHallucinatedToolUse(run.finalText, run.toolCalls);

  let pass = null;
  let judge = null;
  if (!run.invalid && armProven && unexpectedTools.length === 0 && !faked) {
    if (probe.judge) {
      // Subagent probes judge the delegated reply, not the orchestrator's
      // one-word acknowledgement.
      const reply = probe.judgeText ? probe.judgeText(run) : run.finalText;
      judge = await runJudge({ rubric: probe.judge.rubric, reply });
      pass = judge.verdict === "PASS";
      if (judge.verdict === "UNPARSEABLE") pass = null;
    } else {
      pass = probe.score(run);
    }
  }

  const record = {
    runId,
    probe: probe.id,
    rule: probe.rule,
    arm,
    pass,
    invalid: run.invalid || !armProven || unexpectedTools.length > 0 || faked,
    invalidReason: run.invalid
      ? `permissionDenials=${run.permissionDenials}, noResultOrError`
      : !armProven
        ? "arm sentinel absent from injected context"
        : unexpectedTools.length
          ? `escaped the lockdown via ${unexpectedTools.join(",")}`
          : faked
            ? "narrated a tool call it never made"
            : null,
    unexpectedTools,
    removedLines: variant.removedLines,
    costUsd: run.costUsd,
    numTurns: run.numTurns,
    exitCode: res.exitCode,
    stderrTail: res.stderr.slice(-400),
    judge,
    finalText: run.finalText,
    toolNames: run.toolCalls.map((c) => c.name),
  };

  await writeFile(path.join(outDir, `${runId}.json`), JSON.stringify(record, null, 2));
  // Raw transcript kept as evidence: every number in the report must be
  // re-derivable from it without re-running the campaign.
  await writeFile(path.join(outDir, `${runId}.ndjson`), res.stdout);
  await appendFile(
    path.join(outDir, "index.jsonl"),
    JSON.stringify({ ...record, finalText: undefined }) + "\n"
  );
  await rm(runDir, { recursive: true, force: true });

  const mark = record.invalid ? "!" : pass === null ? "?" : pass ? "✓" : "✗";
  console.log(
    `${mark} ${runId.padEnd(24)} $${(run.costUsd ?? 0).toFixed(3)}` +
      (record.invalidReason ? `  (${record.invalidReason})` : "")
  );
  return record;
}

async function pool(tasks, limit) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]().catch((e) => ({ error: String(e) }));
      }
    })
  );
  return out;
}

const ids = (arg("probes", "") || PROBES.map((p) => p.id).join(",")).split(",");
const arms = arg("arms", "B,A").split(",");
const n = Number(arg("n", "5"));
// Offset for the run index, so replacement runs for voided ones land
// under fresh ids instead of overwriting the originals.
const start = Number(arg("start", "0"));
const outDir = path.resolve(arg("out", path.join(REPO, ".probe-runs", "stage1")));
await mkdir(outDir, { recursive: true });

const selected = PROBES.filter((p) => ids.includes(p.id));
if (selected.length !== ids.length) {
  const missing = ids.filter((id) => !PROBES.some((p) => p.id === id));
  throw new Error(`unknown probe id(s): ${missing.join(", ")}`);
}

for (const arm of arms) {
  for (const probe of selected) {
    console.log(`\n── ${probe.id} arm ${arm} × ${n} — ${probe.title}`);
    const records = await pool(
      Array.from({ length: n }, (_, i) => () => runOnce(probe, arm, start + i, outDir)),
      CONCURRENCY
    );
    const valid = records.filter((r) => r && !r.invalid && r.pass !== null);
    const passed = valid.filter((r) => r.pass).length;
    console.log(`   ${passed}/${valid.length} pass (${records.length - valid.length} unusable)`);
  }
}
