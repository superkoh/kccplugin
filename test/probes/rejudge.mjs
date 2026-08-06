#!/usr/bin/env node
/**
 * Re-run the judge over stored records for one probe.
 *
 *   node test/probes/rejudge.mjs --probe w7-concise --out .probe-runs/stage2
 *
 * A rubric is as likely to be wrong as a scorer, and a wrong rubric is
 * expensive to discover late. Deterministic scorers are re-derived from
 * transcripts by report.mjs for free; judge verdicts cannot be, so this
 * re-scores them from the stored reply text without paying for the
 * model runs again — only for the judge.
 */
import { readFile, writeFile, appendFile, rename } from "node:fs/promises";
import path from "node:path";
import { runJudge } from "./lib/judge.mjs";
import { PROBES as S1_PROBES } from "./probes/s1.mjs";
import { PROBES as W_PROBES } from "./probes/w.mjs";
import { PROBES as SUB_PROBES } from "./probes/sub.mjs";

const PROBES = [...S1_PROBES, ...W_PROBES, ...SUB_PROBES];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const probeId = arg("probe");
const outDir = path.resolve(arg("out", ".probe-runs/stage2"));
const probe = PROBES.find((p) => p.id === probeId);
if (!probe?.judge) throw new Error(`probe "${probeId}" is not judge-scored`);

const index = (await readFile(path.join(outDir, "index.jsonl"), "utf-8"))
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const rewritten = [];
for (const row of index) {
  if (row.probe !== probeId || row.invalid) {
    rewritten.push(row);
    continue;
  }
  const file = path.join(outDir, `${row.runId}.json`);
  const record = JSON.parse(await readFile(file, "utf-8"));
  const judge = await runJudge({ rubric: probe.judge.rubric, reply: record.finalText });
  const pass = judge.verdict === "UNPARSEABLE" ? null : judge.verdict === "PASS";

  Object.assign(record, { judge, pass, rejudged: true });
  await writeFile(file, JSON.stringify(record, null, 2));
  rewritten.push({ ...row, judge, pass, rejudged: true });
  console.log(`${pass ? "✓" : pass === null ? "?" : "✗"} ${row.runId}  ${judge.reason.slice(0, 90)}`);
}

const tmp = path.join(outDir, "index.jsonl.tmp");
await writeFile(tmp, rewritten.map((r) => JSON.stringify(r)).join("\n") + "\n");
await rename(tmp, path.join(outDir, "index.jsonl"));
