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
import { screenRun } from "./lib/score.mjs";
import { caseToProbe } from "./lib/cases.mjs";
import { PROBES as S1_PROBES } from "./probes/s1.mjs";
import { PROBES as W_PROBES } from "./probes/w.mjs";
import { PROBES as SUB_PROBES } from "./probes/sub.mjs";
import { PROBES as SPEC_PROBES } from "./probes/spec.mjs";
import { PROBES as UT_PROBES } from "./probes/unittests.mjs";
import { PROBES as BB_PROBES } from "./probes/blackboxtests.mjs";
import { PROBES as BBXC_PROBES } from "./probes/bbxcases.mjs";
import { PROBES as BBXM_PROBES } from "./probes/bbxmaterialize.mjs";
import { PROBES as BBX2_PROBES } from "./probes/bbx2.mjs";

const BUILTIN_PROBES = [
  ...S1_PROBES,
  ...W_PROBES,
  ...SUB_PROBES,
  ...SPEC_PROBES,
  ...UT_PROBES,
  ...BB_PROBES,
  ...BBXC_PROBES,
  ...BBXM_PROBES,
  ...BBX2_PROBES,
];

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
// Which plugin a run loads is the rule's own business, not this file's:
// each rule's doc names its plugin, so a kcc-core rule and a
// kcc-dev-core skill rule go through the same driver unchanged.
const PLUGINS_DIR = path.join(REPO, "plugins");
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

// Auth comes from the CLI wrapper named by CLAUDE_CLI (the campaign points it
// at .probe-runs/ccd-shim, which picks an account with quota headroom and
// supplies its token), so nothing here handles a credential. The wrapper still
// needs the real home to reach the login keychain, because the sealed HOME
// below is an empty directory and `security` resolves through $HOME.
const REAL_HOME = process.env.HOME;

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
    pluginsDir: PLUGINS_DIR,
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
    // 5 minutes suits the kcc-core probes, which are short reasoning tasks.
    // The kcc-dev-core skill probes are full authoring runs — a spec probe has
    // to produce a seven-section spec.md with a Mermaid diagram — and on Opus
    // they overran it, getting SIGKILLed mid-stream with no `result` event and
    // landing as invalid at $0.000. Per-probe override, generous default.
    timeoutMs: probe.timeoutMs ?? 1_200_000,
    cwd: ws.projectDir,
    env: { ...ws.env, KCC_REAL_HOME: REAL_HOME },
  });

  const run = extractRun(res.stdout, {
    projectDir: ws.projectDir,
    configDir: ws.configDir,
  });

  // The void-don't-score gate (arm attribution off the hook payload,
  // lockdown escapes, hallucinated tool use) lives in the kcc-ablation
  // plugin's screenRun; a voided run is re-run, never scored.
  const screen = screenRun(run, {
    sentinel: variant.sentinel,
    expectedTools: probe.expectedTools ?? [],
  });

  let pass = null;
  let judge = null;
  let judgeDidNotRun = false;
  if (!screen.invalid) {
    if (probe.judge) {
      // Subagent probes judge the delegated reply, not the orchestrator's
      // one-word acknowledgement.
      const reply = probe.judgeText ? probe.judgeText(run) : run.finalText;
      judge = await runJudge({ rubric: probe.judge.rubric, reply, realHome: REAL_HOME });
      pass = judge.verdict === "PASS";
      if (judge.verdict === "UNPARSEABLE") pass = null;
      // UNPARSEABLE at zero cost means the judge process never produced a
      // reply at all — no auth, a timeout, a crash. That is an infrastructure
      // fault, not a judgement, so it must void the run and be re-run rather
      // than sit in the results as an unscored record. Left as a plain
      // UNPARSEABLE it reads, in any per-probe tally, exactly like a rule that
      // does nothing.
      judgeDidNotRun = judge.verdict === "UNPARSEABLE" && !judge.costUsd;
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
    invalid: screen.invalid || judgeDidNotRun,
    invalidReason:
      screen.reason ??
      (judgeDidNotRun
        ? "judge produced no reply (zero cost) — infrastructure, not a verdict"
        : null),
    unexpectedTools: screen.unexpectedTools,
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
        // A thrown task must land as INVALID, never as a valid failing run:
        // `valid` only screens on `invalid` and `pass`, so a bare {error}
        // record satisfies both and an infrastructure fault would be counted
        // as "the arm failed the probe" — a wrong number, confidently.
        out[i] = await tasks[i]().catch((e) => {
          console.error(`! run threw: ${e?.stack ?? e}`);
          return { error: String(e), invalid: true, invalidReason: `runner threw: ${e}`, pass: null };
        });
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
