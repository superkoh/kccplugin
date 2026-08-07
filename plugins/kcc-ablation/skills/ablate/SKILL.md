---
description: Use when the user asks to 做消融测试 / 消融实验 / A/B 消融 / 测这条规则值不值 / 有据裁剪 prompt / 优化注入的 prompt / run a prompt ablation / measure what a prompt rule is worth / A/B test an injected prompt or skill / trim a system prompt with evidence — and proactively before deleting or rewriting any injected rule on intuition alone. Runs a sealed A/B ablation campaign — full doc (arm A) vs doc minus exactly one rule (arm B) — with forced-choice probes, B-first ordering, void-don't-score run screening, Fisher-exact verdicts, and an asymmetric evidence bar before any deletion. Portable mechanics ship in this skill's scripts/ directory; the Claude Code sealed-run recipe is references/sealed-run.md. Standalone capability — no workflow, no orchestration, no team.
---
# Prompt ablation campaigns

The failure this skill exists to prevent is the confident wrong number — a harness bug, a contaminated arm, or an under-evidenced "no-delta" licensing the deletion of a rule that was doing real work, with a measurement attached.

## Principles

- **Marginal value, not vibes** — A rule earns its tokens only if deleting it makes the model measurably worse, so the comparison is always the full document (arm A) against the full document minus exactly one rule (arm B), same prompt and model and sealed environment, never "injected vs not injected".
- **One rule per probe** — Each probe ablates exactly one rule, so a measured delta is attributable to it.
- **Registry, not ad-hoc edits** — Ablations live in a registry mapping each rule id to its document plus an anchor (whole block) or verbatim snippet (exact clause), and an anchor or snippet matching zero or several places is a hard error, never a silent no-op that would leave arm B identical to A.
- **Strip cross-references too** — A rule still name-dropped elsewhere in the document is not really ablated, so its registry entry also rewrites every cross-reference.
- **Forced-choice probes** — Design each probe as a task the ablated arm should fail near-deterministically; statistical power comes from probe design, not from large N.
- **Probes never name the rule** — The probe prompt never quotes the rule or its vocabulary, so what is measured is internalised behavior, not instruction-following.
- **Red-gate every probe** — A probe whose B arm passes easily is a bad probe, not evidence of a good rule; discard it and design a sharper temptation.
- **Smoke the harness first** — Before the full campaign, one cheap-model run must prove the pipeline end to end (fixture lands, sentinel attributes the arm, extractor and screener classify correctly), because a harness bug produces confident wrong numbers at full price.
- **B runs first** — If the ablated arm passes every run the rule has no marginal value and arm A never needs to be paid for, which roughly halves a campaign whose main output is "dead weight".
- **Seal everything** — Anything the model can reach that is not the variant is contamination, so every run gets a fresh config dir, a fresh home, and a throwaway working directory outside any repository (recipe and known leaks: `references/sealed-run.md`).
- **Deterministic arm attribution** — Each arm carries a unique sentinel token, and arm identity is read off the injected-context payload in the transcript, never off model narration.
- **Lock delegation down** — Disallow every tool that hands work to another model or reaches outside the sealed workspace (`scripts/lockdown.mjs`), because a subagent muddies attribution and burns budget.
- **Void, don't score** — A run with a permission denial, an executed tool outside the probe's expected set, an unattributable arm, or a narrated-but-never-made tool call is invalid and gets re-run, never counted as a failure of the rule (`screenRun` in `scripts/score.mjs`).
- **Headless denies writes by default** — Non-interactive `claude -p` refuses file writes under the default permission mode, so probes must bypass permissions inside the sealed throwaway workspace or both arms burn their whole budget fighting denials and return zero information.
- **Interactive rules are untestable headless** — A rule whose observable needs an interactive tool (such as `AskUserQuestion`) cannot be probed in headless mode and is recorded as untestable, not faked.
- **Score the opening, not the summary** — In a multi-turn run the model answers before it works, so an "opens with X" observable reads the first assistant text block, never the closing result summary.
- **Blind the judge** — A semantic observable goes to a separate judge model with a binary rubric and no plugins, arm names, or rule text in sight, and an unparseable judge reply is its own outcome, never folded into FAIL.
- **Judge silence is infrastructure** — A judge verdict that cost nothing means the judge never ran, which voids the run instead of landing in the tally looking exactly like "the rule does nothing".
- **Verdicts are screening** — Compare pass rates, not counts, with a one-tailed Fisher exact test (`classify` in `scripts/score.mjs`): `effective` or `harmful` at p < 0.05, `no-delta` on equal rates, `inconclusive` otherwise.
- **Asymmetric evidence bar** — `effective` is established by one significant task shape, but `no-delta` licenses an irreversible deletion, so a rule is deleted only after two or three distinct task shapes all read no-delta.
- **A second shape sees different corners** — A rule reads as dead weight whenever the chosen task happens to sit where the base model already behaves, so between shapes vary the temptation the rule resists, not just the wording.
- **Raw transcripts are the record** — Keep every run's transcript and per-run record, so each number in the report is re-derivable without re-running anything.
- **Resumable by construction** — Results land as one file per run plus an appendable index, so a killed campaign resumes, and replacement runs for voided ones get fresh run ids instead of overwriting evidence.
- **Reuse unchanged baselines** — An arm whose document did not change keeps its prior runs as the baseline, and only the changed arm is re-run.
- **Budget-cap every run** — Every probe carries a per-run spend cap and a generous timeout, and a capped or killed run lands invalid, not failed.
- **Guard measured rules** — A rule a prior campaign measured as load-bearing must not be re-ablated by accident, so its registry entry carries the measurement and re-ablating it requires an explicit override.
- **Tombstone retired rules** — A deleted rule keeps its registry entry marked retired, so past campaign records stay interpretable and a reintroduced rule has a definition to reuse.
- **Skills are delivered, not invoked** — A SKILL.md under test reaches the model as its frontmatter-stripped body injected through the document the plugin's hook already delivers, behind a both-arms-identical preamble, with `skills/` deleted from the variant so no second route hands arm B the intact text (`makeDocVariant` in `scripts/seal.mjs`).
- **Fixtures plant the trigger** — A conditionally-injected document needs its trigger planted in the sealed fixture (a `package.json` for a dev-scene hook), or every run voids as unattributable.
- **Test the harness offline** — The arm builder, extractor, screener, classifier and judge parser carry unit tests that run free and offline, because a bug in any of them is worse than no campaign.

## Bundled mechanics

- **`scripts/ablate.mjs`** — `buildVariant` / `stripFrontmatter`: builds one arm's document; throws on no-op, ambiguity, or a deleted sentinel.
- **`scripts/seal.mjs`** — `makeSealedWorkspace` / `makeDocVariant`: fresh project + config + home triple with pre-accepted trust, and the per-arm plugin variant.
- **`scripts/extract.mjs`** — `extractRun`: stream-json transcript → observables (final text, assistant texts, tool calls with executed/refused state, written paths, hook injections, cost, validity).
- **`scripts/score.mjs`** — `screenRun` (void-don't-score gate), `looksLikeHallucinatedToolUse`, `usedAnyTool`, `fisherOneTailed`, `classify` (the verdict vocabulary).
- **`scripts/judge.mjs`** — `buildJudgePrompt` / `parseVerdict`: blinded binary-rubric judging, with UNPARSEABLE as its own outcome.
- **`scripts/lockdown.mjs`** — `NO_DELEGATION` / `FULL_LOCKDOWN`: the deny-by-default tool lists every probe starts from.
- **`references/sealed-run.md`** — the Claude Code sealed-run recipe: exact CLI flags, environment sealing, auth ordering, stream-json event shapes, the measured-leak checklist, and cost calibration.

<!-- kcc-ablation-ablate-sentinel: v1 -->
