#!/usr/bin/env node
/**
 * Aggregate a campaign's per-run records into the verdict table.
 *
 *   node test/probes/report.mjs --out .probe-runs/stage1
 *
 * Reports pass counts per arm, the delta, and the screening verdict
 * from lib/score.mjs. Unusable runs (permission denial, budget kill,
 * unparseable judge, wrong arm sentinel) are counted separately and
 * never silently folded into a failure — an arm with too few usable
 * runs is reported as such rather than scored.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { classify, looksLikeHallucinatedToolUse } from "./lib/score.mjs";
import { caseToProbe } from "./lib/cases.mjs";
import { extractRun } from "./lib/extract.mjs";
import { PROBES as S1_PROBES } from "./probes/s1.mjs";
import { PROBES as W_PROBES } from "./probes/w.mjs";
import { PROBES as SUB_PROBES } from "./probes/sub.mjs";
import { PROBES as SPEC_PROBES } from "./probes/spec.mjs";
import { PROBES as UT_PROBES } from "./probes/unittests.mjs";
import { PROBES as BB_PROBES } from "./probes/blackboxtests.mjs";
import { PROBES as BBXC_PROBES } from "./probes/bbxcases.mjs";
import { PROBES as BBXM_PROBES } from "./probes/bbxmaterialize.mjs";
import { PROBES as BBX2_PROBES } from "./probes/bbx2.mjs";
import { PROBES as BBXR_PROBES } from "./probes/bbxreviewer.mjs";

// Must stay the same set run-probe.mjs runs. A probe missing here is not a
// missing row: its expectedTools lookup returns undefined, every successful
// tool call reads as a lockdown escape, and the whole campaign is dropped as
// unusable — a silent empty table rather than an error.
const BUILTIN = [
  ...S1_PROBES,
  ...W_PROBES,
  ...SUB_PROBES,
  ...SPEC_PROBES,
  ...UT_PROBES,
  ...BB_PROBES,
  ...BBXC_PROBES,
  ...BBXM_PROBES,
  ...BBX2_PROBES,
  ...BBXR_PROBES,
];
const casesFile = process.argv.includes("--cases")
  ? process.argv[process.argv.indexOf("--cases") + 1]
  : null;
const PROBES = casesFile
  ? [...BUILTIN, ...JSON.parse(await readFile(casesFile, "utf-8")).map(caseToProbe)]
  : BUILTIN;
import { RULES } from "./rules.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const outDir = path.resolve(arg("out", ".probe-runs/stage1"));
const raw = await readFile(path.join(outDir, "index.jsonl"), "utf-8");
const records = raw
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// Lockdown escapes are re-derived from the raw transcripts rather than
// trusted from the record, so records written before the rule existed
// are judged by it too, identically in both arms. A tool the model
// merely *tried* does not count: a refused call executed nothing. Only
// a call that returned a non-error result means the run measured
// something other than the probe.
for (const r of records) {
  const expected = new Set(PROBES.find((p) => p.id === r.probe)?.expectedTools ?? []);
  let transcript;
  try {
    transcript = await readFile(path.join(outDir, `${r.runId}.ndjson`), "utf-8");
  } catch {
    continue;
  }
  const run = extractRun(transcript, {});
  const escaped = [
    ...new Set(
      run.toolCalls.filter((c) => c.ok === true && !expected.has(c.name)).map((c) => c.name)
    ),
  ];
  if (escaped.length) {
    r.invalid = true;
    r.invalidReason ??= `escaped the lockdown via ${escaped.join(",")}`;
  }
  if (looksLikeHallucinatedToolUse(run.finalText, run.toolCalls)) {
    r.invalid = true;
    r.invalidReason ??= "narrated a tool call it never made";
  }

  // Deterministic verdicts are re-derived from the transcript rather
  // than trusted from the record, so a corrected scorer re-scores the
  // whole campaign for free. Judge verdicts stay as recorded — those
  // cannot be recomputed without paying for the judge again.
  const probe = PROBES.find((p) => p.id === r.probe);
  if (probe?.score && !r.invalid) r.pass = probe.score(run);
}

const byProbe = new Map();
for (const r of records) {
  if (!byProbe.has(r.probe)) byProbe.set(r.probe, []);
  byProbe.get(r.probe).push(r);
}

let totalCost = 0;
const rows = [];

for (const probe of PROBES) {
  const rs = byProbe.get(probe.id) ?? [];
  if (rs.length === 0) continue;
  const arm = (a) => {
    const all = rs.filter((r) => r.arm === a);
    const usable = all.filter((r) => !r.invalid && r.pass !== null);
    return { n: all.length, usable: usable.length, pass: usable.filter((r) => r.pass).length };
  };
  const b = arm("B");
  const a = arm("A");
  totalCost += rs.reduce((s, r) => s + (r.costUsd ?? 0) + (r.judge?.costUsd ?? 0), 0);

  const verdict =
    a.usable === 0
      ? b.usable > 0 && b.pass === b.usable
        ? "B-arm ceiling"
        : "incomplete"
      : classify({ bPass: b.pass, bN: b.usable, aPass: a.pass, aN: a.usable });

  rows.push({
    probe: probe.id,
    rule: probe.rule,
    label: RULES[probe.rule]?.label ?? probe.rule,
    b: `${b.pass}/${b.usable}`,
    a: a.usable ? `${a.pass}/${a.usable}` : "—",
    delta:
      a.usable && b.usable
        ? `${Math.round((a.pass / a.usable - b.pass / b.usable) * 100)}pt`
        : "—",
    verdict,
    dropped: rs.filter((r) => r.invalid || r.pass === null).length,
  });
}

const pad = (s, w) => String(s).padEnd(w);
console.log(
  `\n${pad("probe", 16)}${pad("rule", 14)}${pad("B(ablated)", 12)}${pad("A(intact)", 11)}${pad("Δ", 7)}${pad("verdict", 14)}dropped`
);
console.log("-".repeat(86));
for (const r of rows) {
  console.log(
    pad(r.probe, 16) + pad(r.rule, 14) + pad(r.b, 12) + pad(r.a, 11) + pad(r.delta, 7) +
      pad(r.verdict, 14) + r.dropped
  );
}
console.log(`\ntotal measured cost: $${totalCost.toFixed(2)}  (${records.length} runs)`);
