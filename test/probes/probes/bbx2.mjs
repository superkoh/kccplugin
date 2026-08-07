/**
 * Round 3 — pushing round 1's block verdicts down to sub-block level.
 *
 * No new task shapes. Round 1 already built a shape per block and measured
 * which ones the ablated arm failed; this round reuses those exact shapes and
 * only changes WHICH slice the arm removes. That is the whole experiment: if
 * shape X broke when the whole block was gone, ablating one half at a time says
 * which half broke it.
 *
 * Only the FAILING shapes are re-run. A shape whose arm passed with the entire
 * block removed cannot start failing when less is removed, so re-running it
 * against a sub-block buys nothing — the same B-first economics that let round 1
 * skip the A arm for its clean sweeps.
 *
 * Probes are cloned from bbxcases.mjs / bbxmaterialize.mjs so prompt, fixture,
 * lockdown and scorer are byte-identical to the run that produced the round-1
 * number. Anything else and the comparison is not a comparison.
 */
import { PROBES as CASES } from "./bbxcases.mjs";
import { PROBES as MAT } from "./bbxmaterialize.mjs";

const SOURCE = [...CASES, ...MAT];
const byId = new Map(SOURCE.map((p) => [p.id, p]));

/**
 * Which round-1 shapes failed, and which sub-blocks could have caused each.
 * Every entry re-runs one measured-failing shape against each half of its
 * parent, so the halves are compared on identical ground.
 */
const SPLITS = [
  // parent shape (round-1 ablated-arm tally) -> sub-blocks to test it against
  { shape: "bx-slugspec-sp", parentTally: "0/5", subs: ["BBX2-slug-write", "BBX2-slug-read"] },
  { shape: "bx-slugspec-ns", parentTally: "1/4", subs: ["BBX2-slug-write", "BBX2-slug-read"] },

  { shape: "bx-redrun-preimpl-ml", parentTally: "0/5", subs: ["BBX2-redrun-degrade", "BBX2-redrun-preimpl", "BBX2-redrun-statuses"] },
  { shape: "bx-redrun-classify-rr2", parentTally: "0/5", subs: ["BBX2-redrun-degrade", "BBX2-redrun-preimpl", "BBX2-redrun-statuses"] },

  { shape: "bx-standup-env-mv", parentTally: "0/5", subs: ["BBX2-standup-isolation", "BBX2-standup-siting", "BBX2-standup-reuse"] },
  { shape: "bx-standup-extend-ml", parentTally: "0/5", subs: ["BBX2-standup-isolation", "BBX2-standup-siting", "BBX2-standup-reuse"] },

  { shape: "bx-report-statusfile-mv", parentTally: "0/5", subs: ["BBX2-report-statusfile", "BBX2-report-surface"] },
  { shape: "bx-report-statusfile-ml", parentTally: "0/5", subs: ["BBX2-report-statusfile", "BBX2-report-surface"] },

  { shape: "bx-preamble-assumed-kw", parentTally: "2/3", subs: ["BBX2-preamble-narration", "BBX2-preamble-gates"] },

  { shape: "bbx-depth-angles-s6", parentTally: "1/4", subs: ["BBX2-depth-tier", "BBX2-depth-default", "BBX2-sweep-angles"] },
  { shape: "bx-depth-missing-nd", parentTally: "0/5", subs: ["BBX2-depth-tier", "BBX2-depth-default", "BBX2-sweep-angles"] },

  { shape: "bx-scope-blocked-sc1", parentTally: "0/5", subs: ["BBX2-scope-blocked", "BBX2-scope-mode"] },
  { shape: "bx-scope-report-sc1", parentTally: "4/1", subs: ["BBX2-scope-blocked", "BBX2-scope-mode"] },

  { shape: "bx-fidelity-oneper-fl1", parentTally: "0/5", subs: ["BBX2-fidelity", "BBX2-lint"] },
  { shape: "bx-fidelity-beyondthen-fl2", parentTally: "4/1", subs: ["BBX2-fidelity", "BBX2-lint"] },
  { shape: "bx-fidelity-boundary-fl2", parentTally: "4/1", subs: ["BBX2-fidelity", "BBX2-lint"] },

  { shape: "bx-implblind-ml", parentTally: "2/3", subs: ["BBX2-implblind-write", "BBX2-implblind-materialize"] },

  { shape: "bbx-oracle-vague-s1", parentTally: "4/1", subs: ["BBX2-oracle-decidable", "BBX2-oracle-targets"] },
];

// A sub-block id is only shortened for the probe id; the `rule` field carries
// it verbatim, because a probe naming a rule the registry does not define is
// how 48 probes died in the first campaign.
const shortId = (sub) => sub.replace(/^BBX2-/, "");

export const PROBES = SPLITS.flatMap(({ shape, parentTally, subs }) => {
  const base = byId.get(shape);
  if (!base) throw new Error(`round-3 references unknown round-1 probe: ${shape}`);
  return subs.map((sub) => ({
    ...base,
    id: `r3-${shortId(sub)}-${shape.replace(/^(bx|bbx)-/, "")}`,
    rule: sub,
    title: `${base.title}  [sub-block ${sub}, parent shape was ${parentTally}]`,
  }));
});

export const UNPROBEABLE = [
  {
    rule: "BBX-reviewer-subagents",
    reason:
      "Every probe disallows the Agent tool, so 'did it spawn a fresh-context reviewer' is " +
      "not observable under this harness. Round 1 registered it and never ran it. Seven " +
      "principles that cannot be shown to change any artifact — a finding in its own right, " +
      "but NOT a measured no-delta, and it must never be reported as one.",
  },
];
