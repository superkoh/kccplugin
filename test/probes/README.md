# Behavior probes — measuring what an injected rule is worth

L1–L4 answer "does the plugin load and behave". This directory answers a
different question: **is each individual rule in an injected prompt
earning its tokens?**

A rule is worth keeping only if deleting it makes the model measurably
worse. That is a *marginal* claim, so the comparison is never
"injected vs not injected" — it is:

| arm | document |
|---|---|
| **A** | the full doc, unchanged |
| **B** | the full doc **minus exactly one rule** |

Same prompt, same model, same sealed environment, N runs each.

## Why arm B runs first

If the ablated arm passes every run, the rule has no marginal value —
the base model (or another rule) already covers it — and arm A never
needs to be paid for. Running B first roughly halves the cost of a
campaign whose main output is "these rules are dead weight".

## Reading a verdict

`lib/score.mjs` encodes the screening rule:

| delta (A − B) | verdict | meaning |
|---|---|---|
| `< 0` | `harmful` | the rule makes behavior worse |
| `0` | `no-delta` | dead weight; candidate for deletion |
| `0 < d < n−1` | `inconclusive` | real but under-powered at this N |
| `>= n−1` | `effective` | at N=5 that is 5-vs-1, Fisher p≈0.048 |

This is **screening, not significance testing**. Power comes from probe
design — each probe is a forced choice the ablated arm should fail
near-deterministically — not from large N. A probe whose B arm passes
easily is a bad probe, not evidence of a good rule.

## The evidence bar is asymmetric

`effective` and `no-delta` are not equally cheap claims:

- **`effective`** needs one significant difference. The rule visibly
  changed behavior; one task shape is enough to establish that.
- **`no-delta`** is a negative claim that licenses an **irreversible
  deletion**, and a single task shape cannot support it. A rule reads
  as dead weight whenever the chosen task happens to sit in the corner
  the base model already handles.

Measured, three times, in one campaign: S1's skip clause, `Flag
adjacent flaws`, and `Inline by default` each scored a clean 5/5 vs 5/5
on their first task shape — and then failed 0/5 or 1/5 on a second
shape, where the intact arm recovered to 4/5 or 5/5 (p≈0.02). The most
striking was `Inline by default`: asked for an incident write-up, the
ablated arm actually called Write to create a `.md` file in 4 of 5 runs.
The original probe (compare three options) could never have seen it,
because that task shape does not tempt the model to create a file at all.

**So: require 2–3 distinct task shapes before deleting on a `no-delta`
verdict.** Acting on the first shape alone would have deleted two rules
that were doing real work.

## Ablating a skill instead of a context doc

Each rule's `doc` names its own plugin, so `kcc-core`'s injected
principles and `kcc-dev-core`'s skills go through the same driver.

A SKILL.md normally reaches the model only when the model invokes the
skill, and every probe disallows the `Skill` tool. A skill rule
therefore declares `deliver: "skill"`, and the arm builder strips the
YAML frontmatter, ablates the body, and writes it into the file the
plugin's `SessionStart` hook already injects (`via`) behind a
both-arms-identical "skill in effect" preamble. `skills/` is deleted
from the variant in the same step: a SKILL.md left on disk hands arm B
the intact rule back through a `Read` or a `Grep`, and the delta
collapses to noise.

Consequence worth knowing: kcc-dev-core's `SessionStart` hook injects
nothing outside a software project, so **a skill probe's fixture must
plant a dev-scene signal** (`package.json`, `Makefile`, …) in the
sealed project dir. Without one the injection is empty and every run
voids as `arm sentinel absent from injected context`.

## Sealing

Everything the model can reach that is not the variant is contamination:

- `CLAUDE_CONFIG_DIR` → fresh empty dir (blocks user plugins/settings)
- `HOME` → fresh empty dir (blocks `~/.claude` if the model shells out)
- cwd → a throwaway dir **under `os.tmpdir()`, never inside this repo**;
  `CLAUDE.md` discovery walks up from cwd, and a workspace under
  `.probe-runs/` handed one probe this repo's `CLAUDE.md` plus its
  project skills — measured as a 3-minute tool spiral instead of an
  answer
- `Agent` / `Skill` / `ToolSearch` are disallowed in every probe: a
  probe measures one model's reasoning, and a subagent both muddies
  attribution and burns budget
- arm identity is read off the `SessionStart` `hook_response` event
  (each arm carries a unique sentinel), never off model narration

`--bare` is deliberately **not** used: it refuses OAuth tokens, and the
sealed env above achieves the same isolation without requiring an API key.

## Auth

The keychain read must happen **before** `HOME` is sealed — `security`
resolves the login keychain through `$HOME`. Export the token in the
parent process:

```bash
CLAUDE_CODE_OAUTH_TOKEN=... node test/probes/run-probe.mjs --probes s1a-trigger
```

## Usage

```bash
node test/probes/run-probe.mjs --probes s1f-trap --arms B,A --n 5   # campaign
node test/probes/report.mjs --out .probe-runs/stage1                # verdict table
```

Per-run records, raw transcripts and `index.jsonl` land in
`.probe-runs/<name>/` (gitignored). Every number in a report is
re-derivable from the raw transcripts without re-running anything.

## Layout

| path | role |
|---|---|
| `rules.mjs` | ablation registry: which document, plugin and lines each rule id owns |
| `probes/*.mjs` | probe definitions: prompt, tool lockdown, scorer or judge rubric |
| `lib/ablate.mjs` | builds an arm; **throws** rather than silently no-op |
| `lib/seal.mjs` | sealed workspace + plugin variant |
| `lib/extract.mjs` | stream-json → observables |
| `lib/score.mjs` | deterministic scorers + delta classifier |
| `lib/judge.mjs` | blinded rubric judging for semantic observables |

`lib/` carries its own unit tests (`node --test 'test/probes/lib/*.test.mjs'`)
— they are offline and free. A bug in the ablator or the extractor
produces confident wrong numbers, which is worse than no campaign.
