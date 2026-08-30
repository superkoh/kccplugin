/**
 * Ablation registry: which slice of an injected doc each rule id owns.
 *
 * `anchor` deletes a whole block (a `- **Rule.**` bullet or a `##`
 * section); `snippet` rewrites an exact clause in place. Both forms
 * throw when they fail to match, so a doc edit that invalidates an
 * ablation surfaces the next time the campaign builds a variant rather
 * than silently producing a B arm identical to A.
 *
 * Snippet text is copied verbatim from the doc, line breaks included.
 *
 * A rule's `doc` is a descriptor, not a bare path: it carries the plugin
 * the document belongs to and how that document reaches the model, so
 * the campaign driver never has to know which plugin a rule lives in.
 *
 *   { plugin, path, deliver: "context" }
 *     the file is already injected by that plugin's SessionStart hook;
 *     ablate it where it sits.
 *
 *   { plugin, path, deliver: "skill", via, skill }
 *     a SKILL.md, which normally reaches the model only when the model
 *     invokes it. The ablated body is written into `via` — the file the
 *     plugin's SessionStart hook already injects — so the model is
 *     subject to the skill text without the Skill tool, which every
 *     probe disallows.
 */

const contextDoc = (plugin, docPath) => ({ plugin, path: docPath, deliver: "context" });

const skillDoc = (name) => ({
  plugin: "kcc-dev-core",
  path: `skills/${name}/SKILL.md`,
  deliver: "skill",
  via: "context/dev-principles.md",
  skill: `kcc-dev-core.${name}`,
});

export const MAIN_DOC = contextDoc("kcc-core", "context/thinking-principles.md");
export const SUBAGENT_DOC = contextDoc("kcc-core", "context/thinking-principles-subagent.md");

export const UNIT_TESTS_SKILL = skillDoc("unit-tests");
export const SPEC_SKILL = skillDoc("spec");
export const BLACKBOX_SKILL = skillDoc("blackbox-tests");

export const RULES = {
  "S1-whole": {
    doc: MAIN_DOC,
    label: "S1 section (first-principles block, entire)",
    anchor: /^## S1\. First-Principles Visibility/,
    // The conciseness rule name-drops the block; leaving that in would
    // keep cueing the ablated arm about a block it can no longer see.
    snippet: [{ find: " (the\n  🎯 block is never preamble)", with: "" }],
  },

  // Retired in kcc-core 0.6.0: measured no-delta and deleted from the
  // doc, so there is nothing left to ablate. Kept as tombstones so the
  // campaign records under .probe-runs/ stay interpretable, and so a
  // future edit that reintroduces the rule has a definition to reuse.
  "S1-preamble": { doc: MAIN_DOC, label: "S1 precedence line", retired: "0.6.0" },
  "S1-none": { doc: MAIN_DOC, label: 'S1 "none" escape valve', retired: "0.6.0" },
  P0: { doc: MAIN_DOC, label: "reply in the user's language", retired: "0.6.0" },

  "S1-skip": {
    doc: MAIN_DOC,
    label: "S1 skip clause (no block on single-point queries)",
    snippet: {
      find: " **Skip** only\nfor purely informational, unambiguous single-point queries.",
      with: "",
    },
  },

  "S1-contrast": {
    doc: MAIN_DOC,
    label: 'S1 contrastive real-problem phrasing ("A, not B")',
    snippet: {
      find:
        "what's actually being asked, stated as \"A, not\n" +
        ">   B\" — where B is the surface reading or the most likely misreading.\n" +
        ">   The contrast is what makes drift visible.",
      with: "what's actually being asked.",
    },
  },

  // ---- Stage 2: the working rules ------------------------------------
  //
  // Each entry strips its own bullet AND every cross-reference to it
  // elsewhere in the doc; a rule still name-dropped by another rule is
  // not really ablated.

  "W1-groundtruth": { doc: MAIN_DOC, label: "Ground truth before assertion (read the real output first)", retired: "0.7.0" },

  "W1b-assumption": {
    doc: MAIN_DOC,
    label: "the literal `ASSUMPTION:` label for unverified claims",
    snippet: [
      {
        find:
          " **When** you state anything you have not\n" +
          "  verified **→** prefix it with `ASSUMPTION:`. **When** the guess is\n" +
          "  load-bearing or hard to reverse **→** ask instead of guessing.",
        with: "",
      },
      { find: "claims verified or labelled `ASSUMPTION:`, adjacent", with: "claims verified, adjacent" },
    ],
  },

  W2: { doc: MAIN_DOC, label: "Failure escalation (change approach, don't re-tune)", retired: "0.7.0" },

  W3: { doc: MAIN_DOC, label: "Deep analysis shrinks the plan (smallest version first)", retired: "0.7.0" },

  W4: { doc: MAIN_DOC, label: "Surface conflicts, don't average them", retired: "0.7.0" },

  W5: {
    doc: MAIN_DOC,
    label: "Flag adjacent flaws",
    anchor: /^- \*\*Flag adjacent flaws\./,
    snippet: [{ find: ", adjacent\nflaws flagged", with: "" }],
  },

  W6: {
    doc: MAIN_DOC,
    label: "Inline by default (no standalone file unless asked)",
    anchor: /^- \*\*Inline by default\./,
  },

  W7: {
    doc: MAIN_DOC,
    label: "Concise reporting (no preamble, no repeated summary)",
    anchor: /^- \*\*Concise reporting\./,
  },

  D1: {
    doc: MAIN_DOC,
    label: 'the Before "done" self-audit',
    anchor: /^## Before "done"$/,
  },

  // ---- Stage 3: the subagent variant ---------------------------------
  //
  // Same rules, different document: these ablate
  // context/thinking-principles-subagent.md, injected at SubagentStart.
  // The main-session doc stays intact in both arms, so any delta is
  // attributable to what the subagent was told.

  "SUB-S1-whole": {
    doc: SUBAGENT_DOC,
    label: "subagent S1 section (first-principles block, entire)",
    anchor: /^## S1\. First-Principles Visibility/,
    snippet: [{ find: " (the\n  🎯 block is never preamble)", with: "" }],
  },

  "SUB-W5": {
    doc: SUBAGENT_DOC,
    label: "subagent Flag adjacent flaws",
    anchor: /^- \*\*Flag adjacent flaws\./,
    snippet: [{ find: ", adjacent\nflaws flagged", with: "" }],
  },

  // ---- Stage 4: the kcc-dev-core skills ------------------------------
  //
  // One worked entry per skill, not the whole registry: these prove the
  // skill-delivery path end to end. The remaining principles are added
  // as their probes are written.
  //
  // A skill probe's fixture must plant a dev-scene signal (package.json,
  // .git/, Makefile, …) in the sealed project dir — kcc-dev-core's
  // SessionStart hook injects nothing outside a software project, and
  // without the injection every run voids as "arm sentinel absent".

  // Id kept from when the claim shipped as its own `Never paste
  // implementation output` bullet, so records under .probe-runs/ stay
  // interpretable; that bullet was folded into this one.
  "UT-paste": {
    doc: UNIT_TESTS_SKILL,
    label: "hand-derive expected values, never paste implementation output",
    anchor: /^- \*\*Hand-derive every expected value\*\*/,
    // The backfill bullet restates the prohibition verbatim ("never to
    // source expected values"), so leaving it hands arm B the rule back.
    snippet: [{ find: ", never to source expected\n  values.", with: "." }],
  },

  "SPEC-story-fmt": {
    doc: SPEC_SKILL,
    label: "user stories use the strict As-a / I-want / so-that form",
    anchor: /^- \*\*Story format is strict\*\*/,
  },

  "BB-boundary": {
    measuredContent: "the boundary pair — one of the four rules the slim draft dropped for 2.7 points",
    doc: BLACKBOX_SKILL,
    label: "every bounded input earns a case at the cap and one past it",
    anchor: /^- \*\*Boundary pair\*\*/,
  },

  // Id kept from when materializing was its own skill; that SKILL.md was
  // merged into blackbox-tests, so this rule and BB-boundary now ablate
  // two different principles of one document.
  "MAT-one-per-case": {
    doc: BLACKBOX_SKILL,
    label: "exactly one test per automated black-box case",
    anchor: /^- \*\*One test per case\*\*/,
  },

  // ---- Stage 5: the UNCERTAIN principles -----------------------------
  //
  // Every principle the atomize-and-triage pass could argue either way,
  // and the only set this campaign pays to measure. One entry per
  // principle; task shapes are shared across entries, so a probe prompt
  // serves several of these and the arm is which entry got ablated.
  // `UT-paste` above belongs to this set too — it was already registered
  // as the worked example.
  //
  // Two mechanics recur below and are worth knowing before editing:
  //
  //   * spec/ and blackbox-tests/ put one principle on one line, so an
  //     in-place clause rewrite changes no line count and seal.mjs
  //     rejects the arm as a no-op. Where only a clause of a bullet is
  //     under measurement, the bullet is therefore anchored away whole
  //     and the clause that must survive is re-hosted on the neighbour
  //     it belongs to.
  //   * unit-tests/ is hard-wrapped; the ablator ends a block at the
  //     next bullet or heading, so an anchor there takes the
  //     continuation lines with it and needs no help.

  "UT-backfill-branches": {
    doc: UNIT_TESTS_SKILL,
    label: "backfill reads the implementation only to enumerate branches",
    anchor: /^- \*\*Backfill reads code only for branches\*\*/,
  },

  // Joint ablation: both anti-tautology bullets removed at once. Neither
  // measured a delta alone on the 0.10.0 fixtures, which is exactly the case
  // where a pair can still be load-bearing together — arm B of each single
  // ablation still had the other bullet restating the prohibition. `anchor`
  // takes only one first-line (it throws on a multi-line match), so the
  // second bullet comes out by exact snippet instead.
  "UT-paste-pair": {
    doc: UNIT_TESTS_SKILL,
    label: "joint: hand-derive AND backfill-reads-only-for-branches, both removed",
    anchor: /^- \*\*Hand-derive every expected value\*\*/,
    snippet: [
      {
        find:
          "- **Backfill reads code only for branches** — Backfill reads the\n" +
          "  implementation only to enumerate branches, never to source expected\n" +
          "  values.\n",
        with: "",
      },
    ],
  },

  "UT-prove-can-fail": {
    doc: UNIT_TESTS_SKILL,
    label: "umbrella: every test is proven able to fail before it is trusted",
    anchor: /^- \*\*Prove every test can fail\*\*/,
  },

  "UT-mutation-probe": {
    doc: UNIT_TESTS_SKILL,
    label: "backfill breaks the implementation once per unit to prove test power",
    anchor: /^- \*\*Backfill runs a mutation probe\*\*/,
    // The reporting rule asks for the "probe result", which keeps
    // ordering the procedure the ablated arm can no longer read.
    snippet: [
      {
        find: "red → green output, probe result, or repro failure",
        with: "red → green output or repro failure",
      },
    ],
  },

  "UT-double-collaborators": {
    doc: UNIT_TESTS_SKILL,
    label: "network, DB, clock, randomness and filesystem get test doubles",
    anchor: /^- \*\*Double the unpredictable collaborators\*\*/,
  },

  "UT-frontend-pure-units": {
    doc: UNIT_TESTS_SKILL,
    label: "squeeze frontend logic out of components into pure units",
    anchor: /^- \*\*Frontend logic moves to pure units\*\*/,
    // "whatever stays in a component" presupposes the extraction this
    // rule orders, and cues the ablated arm to extract anyway.
    snippet: [
      { find: "Drive whatever\n  stays in a component through", with: "Drive a component through" },
    ],
  },

  "UT-component-behavior": {
    doc: UNIT_TESTS_SKILL,
    label: "drive components through role and label queries, not internal state",
    anchor: /^- \*\*Test components through user-visible behavior\*\*/,
  },

  "UT-report-mode": {
    doc: UNIT_TESTS_SKILL,
    label: "the report names the mode the run used",
    anchor: /^- \*\*Report the mode\*\*/,
  },

  "SP-route-blackbox": {
    doc: SPEC_SKILL,
    label: "black-box case requests belong to another skill",
    anchor: /^- \*\*Black-box cases are elsewhere\*\*/,
  },

  "SP-no-file-brainstorm": {
    doc: SPEC_SKILL,
    label: "pure brainstorming produces no file",
    anchor: /^- \*\*Brainstorming stays in conversation\*\*/,
  },

  "SP-unresolved-assumption": {
    doc: SPEC_SKILL,
    label: "what the ask leaves unresolved becomes an ASSUMPTION in Open Items",
    anchor: /^- \*\*Unresolved becomes ASSUMPTION\*\*/,
  },

  "SP-section-order": {
    doc: SPEC_SKILL,
    label: "the seven headers appear in the listed order",
    anchor: /^- \*\*Sections keep their order\*\*/,
    // The self-check re-reads "headers and order", which reimposes the
    // ordering the arm can no longer see stated.
    snippet: [{ find: "re-check headers and order,", with: "re-check headers," }],
  },

  "SP-us-floor": {
    doc: SPEC_SKILL,
    label: "at least three user stories",
    anchor: /^- \*\*At least three user stories\*\*/,
  },

  "SP-fr-floor": {
    doc: SPEC_SKILL,
    label: "at least five functional requirements",
    anchor: /^- \*\*At least five functional requirements\*\*/,
  },

  "SP-nfr-floor": {
    doc: SPEC_SKILL,
    label: "at least three non-functional requirements",
    anchor: /^- \*\*At least three NFRs\*\*/,
  },

  "SP-reverify": {
    doc: SPEC_SKILL,
    label: "the closing re-verification pass over every rule",
    anchor: /^- \*\*Re-verify every rule\*\*/,
    // "whatever that check finds" both loses its antecedent and still
    // implies a check ran; the fix-in-place disposition survives.
    snippet: [
      {
        find: "Repair whatever that check finds inline",
        with: "Repair any defect you notice inline",
      },
    ],
  },

  "BB-no-invented-endpoints": {
    measuredContent: "the refusal to invent an unpinned surface — one of the three measured wins",
    doc: BLACKBOX_SKILL,
    label: "cases use no invented endpoints",
    anchor: /^- \*\*No invented endpoints\*\*/,
  },

  "BB-vague-oracle-phrases": {
    doc: BLACKBOX_SKILL,
    label: 'the banned oracle phrases "works correctly" / "same as before"',
    anchor: /^- \*\*No vague oracle\*\*/,
    // The same bullet carries a measured keeper — pinning notes are not
    // oracles — which is re-hosted on the decidability rule so only the
    // two-phrase blacklist is actually removed.
    snippet: [
      {
        find:
          "- **Decidable Then** — Every **Then** is pass/fail-decidable in requirement language.",
        with:
          "- **Decidable Then** — Every **Then** is pass/fail-decidable in requirement " +
          'language, and "document the actual behavior" and "pin whatever it does today" ' +
          "are notes, not **Then** clauses.",
      },
    ],
  },

  "BB-locale-oracle": {
    doc: BLACKBOX_SKILL,
    label: "locale oracles assert format rules, not literals",
    anchor: /^- \*\*Locale oracle\*\*/,
  },

  "BB-privilege-oracle": {
    measuredContent: "the vertical-authz oracle, part of the explicitly-named money sweep",
    doc: BLACKBOX_SKILL,
    label: "a privilege case asserts the rejection and that nothing changed",
    anchor: /^- \*\*Privilege oracle\*\*/,
  },

  "BB-text-encoding-angle": {
    doc: BLACKBOX_SKILL,
    label: "sweep unicode homoglyph / BiDi / normalization",
    anchor: /^- \*\*Text-encoding angle\*\*/,
  },

  "BB-localization-angle": {
    doc: BLACKBOX_SKILL,
    label: "sweep i18n expansion and RTL",
    anchor: /^- \*\*Localization angle\*\*/,
  },

  "BB-keyboard-angle": {
    doc: BLACKBOX_SKILL,
    label: "sweep keyboard-only traversal",
    anchor: /^- \*\*Keyboard angle\*\*/,
  },

  "BB-closing-reviewer": {
    doc: BLACKBOX_SKILL,
    label: "close with a fresh-context reviewer subagent over the draft cases",
    anchor: /^- \*\*Closing reviewer\*\*/,
    // "Run it at both depths" has no antecedent once the reviewer bullet
    // is gone, and still orders the subagent; leaving it would measure
    // confusion rather than the rule.
    snippet: [
      {
        find:
          "- **Reviewer at both depths** — Run it at both depths, because a simple " +
          "surface predicts nothing about whether the requirements have holes.\n",
        with: "",
      },
    ],
  },

  "BB-pending-conditional": {
    measuredContent: "`## Pending cases` is where the measured refusal parks an unpinned surface",
    doc: BLACKBOX_SKILL,
    label: "`## Pending cases` appears only when it would be non-empty",
    anchor: /^- \*\*Pending entries\*\*/,
    // Only the "appears only when …" conditional is under measurement;
    // what the section holds, and why materializing skips it, is
    // re-hosted on the rule that fills the section.
    snippet: [
      {
        find: "unpinned moves to `## Pending cases`.",
        with:
          "unpinned moves to `## Pending cases`, which holds sketches with no BB-ID and " +
          "no seven fields — which is why materializing skips them when splitting by `Mode:`.",
      },
    ],
  },

  "MAT-route-whitebox": {
    doc: BLACKBOX_SKILL,
    label: "unit and other white-box tests belong to another skill",
    anchor: /^- \*\*White-box tests are elsewhere\*\*/,
  },

  "MAT-read-in-full": {
    doc: BLACKBOX_SKILL,
    label: "read the cases file in full before materializing anything",
    anchor: /^- \*\*Read it in full\*\*/,
  },

  "MAT-file-group-per-slug": {
    doc: BLACKBOX_SKILL,
    label: "one test file group per feature slug",
    anchor: /^- \*\*One file group per slug\*\*/,
  },

  "MAT-adopt-existing-suite": {
    doc: BLACKBOX_SKILL,
    label: "adopt an isolation-conforming suite the repo already has",
    anchor: /^- \*\*Extend, do not re-scaffold\*\*/,
    // Only the already-has-a-suite half is under measurement; the
    // after-the-first-run half is a keeper and moves onto the first-run
    // rule it qualifies.
    snippet: [
      {
        find: "Ask about test project location and harness only on the first run in a repo.",
        with:
          "Ask about test project location and harness only on the first run in a repo, " +
          "and after that extend the test project it produced instead of standing up a second one.",
      },
    ],
  },

  "MAT-lint-run": {
    doc: BLACKBOX_SKILL,
    label: "run the black-box lint as a separate pass before the suite",
    anchor: /^- \*\*Lint the boundary\*\*/,
    // The lint is name-dropped six more times. The three checks it
    // performs are keepers, so they are restated as invariants — which
    // is exactly the question: does a separate verification pass buy
    // anything over stating the invariant at authoring time?
    snippet: [
      { find: "scaffold → write → lint → review", with: "scaffold → write → review" },
      {
        find:
          "- **No reference into the system under test** — The lint fails on any path " +
          "or module reference from the test project into the system under test.",
        with:
          "- **No reference into the system under test** — No path or module reference " +
          "goes from the test project into the system under test.",
      },
      {
        find:
          "- **No internal clients** — The lint fails on any database client, ORM, or " +
          "internal queue client in setup or cleanup.",
        with:
          "- **No internal clients** — No database client, ORM, or internal queue client " +
          "appears in setup or cleanup.",
      },
      {
        find:
          "- **Exactly one test per BB-ID** — The lint fails when an automated BB-ID has " +
          "no test or carries more than one, and",
        with: "- **Exactly one test per BB-ID** — Every automated BB-ID has exactly one test, and",
      },
      { find: " plus the lint,", with: "," },
      { find: "every lint exception, ", with: "" },
    ],
  },

  "MAT-no-orphan-tests": {
    doc: BLACKBOX_SKILL,
    label: "no test exists without a BB-ID",
    anchor: /^- \*\*Exactly one test per BB-ID\*\*/,
    // Only the orphan half is under measurement; the forward check
    // (every automated BB-ID has exactly one test) is a keeper and moves
    // onto the one-test-per-case rule it enforces.
    snippet: [
      {
        find: "named so that the name carries that case's BB-ID.",
        with:
          "named so that the name carries that case's BB-ID, and the lint fails when an " +
          "automated BB-ID has no test or carries more than one.",
      },
    ],
  },

  "MAT-fix-findings-first": {
    doc: BLACKBOX_SKILL,
    label: "fix every review finding before running the suite",
    anchor: /^- \*\*Fix findings before running\*\*/,
  },

  // Round 4 tried to fold this bullet into `One fresh-context reviewer` and
  // measured the result: on the authoring shape the closing reviewer went
  // from 5/5 to 1/5 (Fisher p≈0.024). Stating the self-review escape hatch
  // once, in the MATERIALIZING half, switched off a reliable behaviour in
  // the WRITING half — so the bullet stays exactly where it is, and its
  // separateness is now measured rather than assumed.
  "MAT-self-review": {
    doc: BLACKBOX_SKILL,
    label: "run the conformance check yourself below the reviewer bar",
    anchor: /^- \*\*Self-review below the bar\*\*/,
  },

  // ---- Stage 6: blackbox-tests, ablated by thematic block -------------
  //
  // The entries above delete one principle each. These delete a whole
  // thematic area of blackbox-tests/SKILL.md at once, and answer a
  // different question: is this area of the skill doing anything at all?
  // Only 3 of that file's 92 principles rest on A/B evidence, so
  // one-at-a-time ablation would mean ~89 entries and ~250 probes for a
  // file whose open question is which areas can be deleted wholesale. A
  // block that measures effective gets subdivided and re-measured; a
  // block that measures no-delta is a bulk deletion.
  //
  // Two blocks are NOT registered, deliberately. The 0.10.0 campaign
  // (commit 9f62037) measured this skill at 20.8 against a no-skill arm's
  // 14.0 and attributed the gap to three things — the emitted file's
  // contract (path, parsed shape, bare `Depth:` tier, `Mode:`, no HTML
  // comments), the per-case `Traces to:` identifiers, and the refusal to
  // invent a surface the requirements never pinned — plus four case-power
  // rules a slim draft dropped at a cost of 2.7 points (the money-angle
  // sweep named explicitly with its oracles, "a Then that cannot fail is
  // not a case", "every Given names the surface that prepares it", and
  // the boundary pair with the empty value). Those 19 principles and the
  // `## Output format` template are measured load-bearing content; no
  // entry below removes or rewrites any of them. Where a surviving
  // measured line name-drops something a block deletes, the dangling
  // reference is accepted and noted on the entry — editing measured text
  // to tidy an arm would corrupt the one result this skill actually has.
  //
  // Ids are the block ids from the partition; each entry's anchor is the
  // block's first member and the snippets are the rest, verbatim, one
  // whole line each. Cross-references from surviving principles are
  // stripped in the same entry, except where the comment says the leak is
  // deliberate — those are constraints on probe design, not oversights.

  "BBX-impl-blindness": {
    doc: BLACKBOX_SKILL,
    label:
      "block: implementation blindness — requirements are the only source, and the " +
      "tests precede the code",
    // Nothing cross-references this block. `Red-first` and
    // `unexpected-green` (BBX-red-run-classify) still imply the suite
    // predates the implementation, so a probe for this block must score
    // whether the implementation was READ, not whether the tests came first.
    // The skill's opening framing line ("the suite that looks black-box
    // while reaching into the implementation") also survives in both arms —
    // it carries measured content, so it is never edited.
    anchor: /^- \*\*Requirements only\*\*/,
    snippet: [
      {
        find:
          "- **Never read implementation** — Never open the implementation the cases " +
          "will be run against, and when the change targets an existing product, that " +
          "product's code is equally off-limits.\n",
        with: "",
      },
      {
        find:
          "- **Before implementation** — Write the test code before any implementation " +
          "of the feature exists.\n",
        with: "",
      },
      {
        find:
          "- **White-box tests are elsewhere** — Unit tests and any other white-box " +
          "tests are written during implementation by `kcc-dev-core.unit-tests`.\n",
        with: "",
      },
    ],
  },

  "BBX-slug-and-sibling-spec": {
    doc: BLACKBOX_SKILL,
    label:
      "block: the cases-file / spec pairing at both ends",
    // The slug survives in `One cases file` and `Persist the status file`, and
    // the `Surface:` field survives in the output template — all deliberate:
    // `One cases file` is measured content and is never edited.
    // 2026-08-07: path literals were removed from the doc (skills carry
    // generic principles; locations are the project's call), so the bullet
    // text below is the genericized wording, not what the campaign measured.
    anchor: /^- \*\*Sibling slug\*\*/,
    snippet: [
      {
        find:
          "- **Coined slug** — With no sibling spec to borrow from, coin a slug " +
          "that is ASCII kebab-case and at most 64 characters.\n",
        with: "",
      },
      {
        find:
          "- **Read the sibling spec** — Read the sibling spec for the surface " +
          "contracts whenever it exists.\n",
        with: "",
      },
      {
        find:
          "- **Surface line is the fallback contract** — Without a spec, each case's " +
          "`Surface:` text is the contract.\n",
        with: "",
      },
    ],
  },

  // Retired in kcc-dev-core 0.10.0: arm B swept every task shape the block
  // was designed for, so all five members were deleted from the doc and
  // there is nothing left to ablate. Campaign 2026-08-07, 4 shapes, arm B
  // (block absent) 20 pass / 0 fail — db 5/0, queue 5/0, blocked 5/0,
  // cleanup 5/0. A clean B sweep caps delta = A − B at ≤ 0, so no A arm
  // could overturn it and none was paid for. Members: Contracted surfaces
  // only, Unpreparable state, Setup dependency, Setup through external
  // surfaces, Cleanup is idempotent. What survives the deletion and still
  // guards the boundary: the two lint bullets of BBX-fidelity-and-lint, and
  // `Given names its surface`.
  "BBX-no-backdoors": {
    doc: BLACKBOX_SKILL,
    label:
      "block: no reaching around the surface to prepare or tear down state",
    retired: "0.10.0",
  },

  "BBX-oracle-quality": {
    doc: BLACKBOX_SKILL,
    label:
      "block: Then clauses are decidable, quantified, and asserted as rules not " +
      "literals",
    // The output template's `**Then** <the NFR's own threshold>` survives —
    // it is measured content. It cues a threshold without saying where the
    // number comes from, so an `Unquantified NFR` probe should score the
    // invented-threshold case, not whether a number appears at all.
    anchor: /^- \*\*Decidable Then\*\*/,
    snippet: [
      {
        find:
          "- **No vague oracle** — \"works correctly\", \"same as before\", \"document " +
          "the actual behavior\", and \"pin whatever it does today\" are notes, not " +
          "**Then** clauses.\n",
        with: "",
      },
      {
        find:
          "- **Unquantified NFR** — An NFR with no number in the spec → Pending, never " +
          "an invented threshold, while a performance **Then** asserts the spec's own " +
          "NFR number.\n",
        with: "",
      },
      {
        find:
          "- **Locale oracle** — Locale oracles assert format rules, not literals.\n",
        with: "",
      },
      {
        find:
          "- **UI target** — UI targets are role plus visible label.\n",
        with: "",
      },
    ],
  },

  // Retired in kcc-dev-core 0.10.0: arm B swept every task shape the block
  // was designed for, so all four members were deleted from the doc and
  // there is nothing left to ablate. Campaign 2026-08-07, 2 shapes, arm B
  // (block absent) 10 pass / 0 fail — traced 5/0, honest 5/0. A clean B
  // sweep caps delta = A − B at ≤ 0, so no A arm could overturn it and none
  // was paid for. Members: Coverage per requirement, Second case, Never
  // fake a trace, Report the uncovered. The measured `Trace identifiers`
  // line survives and still orders a `Traces to:` list of real identifiers.
  "BBX-coverage-accounting": {
    doc: BLACKBOX_SKILL,
    label:
      "block: coverage accounted per requirement, traces honest, gaps declared",
    retired: "0.10.0",
  },

  "BBX-depth-and-extra-sweeps": {
    doc: BLACKBOX_SKILL,
    label:
      "block: depth tier selection and the non-money sweeps only full depth buys",
    // `Depth: focused` / `full` still exist — named by the measured `Depth
    // line` and `Omission sweep` and by the template — so arm B can still
    // emit a tier; what it loses is the rule for choosing one, the default
    // for a missing line, and the three non-money angles. `Report the path`
    // keeps asking for "what triggered it" (BBX-reporting-and-status owns
    // that line); score these two blocks on different task shapes.
    anchor: /^- \*\*Focused depth\*\*/,
    snippet: [
      {
        find:
          "- **Tie-break** — When in doubt, full.\n",
        with: "",
      },
      {
        find:
          "- **Missing depth means full** — A file with no `Depth:` line counts as " +
          "`full`.\n",
        with: "",
      },
      {
        find:
          "- **Text-encoding angle** — Sweep unicode homoglyph / BiDi / normalization on " +
          "free-text inputs.\n",
        with: "",
      },
      {
        find:
          "- **Localization angle** — Sweep i18n expansion and RTL.\n",
        with: "",
      },
      {
        find:
          "- **Keyboard angle** — Sweep keyboard-only traversal.\n",
        with: "",
      },
    ],
  },

  "BBX-reviewer-subagents": {
    doc: BLACKBOX_SKILL,
    label:
      "block: the fresh-context reviewer subagent at both ends",
    // Two cross-references would otherwise keep ordering a reviewer the arm
    // can no longer read about: the `review` phase inside `Pipeline order`
    // and the two reviewer clauses of `Report the exceptions`.
    // Every probe disallows the Agent tool, so "did it spawn a reviewer" is
    // not observable here — only the second-order residue on disk is.
    anchor: /^- \*\*Closing reviewer\*\*/,
    snippet: [
      {
        find:
          "- **Reviewer at both depths** — Run it at both depths, because a simple " +
          "surface predicts nothing about whether the requirements have holes.\n",
        with: "",
      },
      {
        find:
          "- **Conformance review triggers** — The conformance review is required when " +
          "the batch exceeds ~10 tests, when depth is `full`, or when any case involves " +
          "concurrency, money, or permissions.\n",
        with: "",
      },
      {
        find:
          "- **One fresh-context reviewer** — The conformance review is a single " +
          "reviewer subagent spawned with fresh context.\n",
        with: "",
      },
      {
        find:
          "- **Per-test review question** — Ask the reviewer, per test, whether it " +
          "asserts exactly its case's **Then**, prepares exactly its **Given** and " +
          "`Setup:`, tears down exactly its `Cleanup:`, and nothing more or less.\n",
        with: "",
      },
      {
        find:
          "- **Fix findings before running** — Fix every review finding before running " +
          "the suite.\n",
        with: "",
      },
      {
        find:
          "- **Self-review below the bar** — Below the reviewer bar, run the same " +
          "conformance check yourself.\n",
        with: "",
      },
      {
        find:
          " → review → red-run",
        with:
          " → red-run",
      },
      {
        find:
          "- **Report the exceptions** — Report every `deferred` red run, every lint " +
          "exception, every conformance-review finding, and whether the conformance " +
          "reviewer was skipped.",
        with:
          "- **Report the exceptions** — Report every `deferred` red run and every lint " +
          "exception.",
      },
    ],
  },

  "BBX-materialize-scope": {
    doc: BLACKBOX_SKILL,
    label:
      "block: which cases become code and which are handed back unmaterialized",
    // `One test per case` name-drops the scope rule ("one test per `Mode:
    // automated` case"), so its qualifier comes off; the bullet itself
    // belongs to BBX-fidelity-and-lint and survives, neutral.
    // `Exactly one test per BB-ID` keeps saying "an automated BB-ID" on
    // purpose: rewriting it to every BB-ID would ORDER arm B to materialize
    // llm-driven cases, manufacturing the failure instead of measuring it.
    // The measured `Automated mode` and `Pending entries` lines still define
    // `Mode:` and still say materializing splits by it — never edited.
    anchor: /^- \*\*Prefer automated\*\*/,
    snippet: [
      {
        find:
          "- **Automated cases only** — Materialize only the `Mode: automated` cases of " +
          "the reviewed cases file.\n",
        with: "",
      },
      {
        find:
          "- **llm-driven stays in the file** — A `Mode: llm-driven` case is " +
          "deliberately left unmaterialized and stays in the cases file for a human or an " +
          "LLM agent to run.\n",
        with: "",
      },
      {
        find:
          "- **Nothing automated, report only** — A cases file holding no `Mode: " +
          "automated` case skips scaffolding through the red run and produces the report " +
          "alone.\n",
        with: "",
      },
      {
        find:
          "- **Blocked external setup is not materialized** — A case marked " +
          "`[EXTERNAL-SETUP: blocked — <reason>]` is not materialized, listed as blocked " +
          "in the report so the user decides whether to approve a documented fixture " +
          "backdoor.\n",
        with: "",
      },
      {
        find:
          "- **Report the not-materialized** — Report as not materialized every " +
          "`llm-driven` case and every case blocked by `[EXTERNAL-SETUP: blocked — " +
          "<reason>]`, each with the reason it was left behind.\n",
        with: "",
      },
      {
        find:
          "Write exactly one test per `Mode: automated` case, named",
        with:
          "Write exactly one test per case, named",
      },
    ],
  },

  "BBX-run-preamble": {
    doc: BLACKBOX_SKILL,
    label:
      "block: framing, phase order, reading in full, and the gates before any test " +
      "is written",
    // Only two members are trappable headless — `Known-wrong inputs stop the
    // run` (were files written despite an unresolved `[ASSUMED: …]`?) and
    // `Read it in full` (does a 30-case file yield 30 tests?). The three
    // AskUserQuestion members are not observable in a probe; score only the
    // two. `Read it in full` is also owned by the single-rule
    // `MAT-read-in-full` — two entries may touch one bullet, but a block
    // verdict is not a verdict on that rule.
    anchor: /^- \*\*Definition of Done\*\*/,
    snippet: [
      {
        find:
          "- **Pipeline order** — Follow the order read → confirm → scaffold → write → " +
          "lint → review → red-run → report.\n",
        with: "",
      },
      {
        find:
          "- **Read it in full** — Read the cases file in full before materializing " +
          "anything.\n",
        with: "",
      },
      {
        find:
          "- **Confirm with AskUserQuestion** — Confirm the run's unsettled inputs " +
          "through `AskUserQuestion` instead of assuming them.\n",
        with: "",
      },
      {
        find:
          "- **Case review** — Ask on every run whether a human has read the cases, " +
          "because it is a property of these cases, not of the repo.\n",
        with: "",
      },
      {
        find:
          "- **Known-wrong inputs stop the run** — Only unresolved `## Pending cases` or " +
          "`[ASSUMED: …]` markers stop the run, because those are known-wrong inputs " +
          "rather than unreviewed ones.\n",
        with: "",
      },
    ],
  },

  "BBX-test-project-standup": {
    doc: BLACKBOX_SKILL,
    label:
      "block: standing up the test project — where it goes, that it is isolated, and " +
      "that it is reused",
    // `No reference into the system under test` (BBX-fidelity-and-lint) still
    // bans imports into the system under test, so arm B keeps half of
    // isolation by lint. Probe the other half: its own dependency manifest
    // and lockfile, a separate package, and the environment question.
    // `Extend, do not re-scaffold` is also owned by `MAT-adopt-existing-suite`.
    anchor: /^- \*\*First run only\*\*/,
    snippet: [
      {
        find:
          "- **Propose the location** — Propose 1–3 test project locations derived from " +
          "this repo's own conventions — existing test layout, language, build tooling — " +
          "with your recommendation first.\n",
        with: "",
      },
      {
        find:
          "- **Confirm the target environment** — Confirm the target environment as a " +
          "base URL, app entry, and credentials source, or as \"no environment yet\".\n",
        with: "",
      },
      {
        find:
          "- **Isolation is non-negotiable** — Wherever the test project lands, it must " +
          "be an isolated package with its own dependency manifest and lockfile and zero " +
          "imports from implementation source.\n",
        with: "",
      },
      {
        find:
          "- **Extend, do not re-scaffold** — After the first run, and whenever the repo " +
          "already has a suite meeting the isolation constraint, extend it instead of " +
          "standing up a second one.\n",
        with: "",
      },
      {
        find:
          "- **One file group per slug** — Organize the tests as one file group per " +
          "feature slug.\n",
        with: "",
      },
    ],
  },

  "BBX-fidelity-and-lint": {
    doc: BLACKBOX_SKILL,
    label:
      "block: one test per case asserting exactly its Then, and the lint that " +
      "enforces it",
    // The lint is name-dropped in the pipeline, in `Degrade without an
    // environment` and in `Report the exceptions` — the same three strips
    // `MAT-lint-run` makes — and `Per-test review question` restates the
    // correspondence rule verbatim, so it is generalized rather than left to
    // hand arm B the rule back through the reviewer.
    // `One test per case` is also owned by the single-rule `MAT-one-per-case`
    // and `Exactly one test per BB-ID` by `MAT-no-orphan-tests`; a block
    // verdict is not a verdict on either.
    anchor: /^- \*\*One test per case\*\*/,
    snippet: [
      {
        find:
          "- **Assert nothing beyond Then** — A case's **When** becomes the test's " +
          "action and its **Then** the assertions, with nothing asserted beyond them.\n",
        with: "",
      },
      {
        find:
          "- **Oracles from case text** — Every oracle must be decidable from the case " +
          "text alone.\n",
        with: "",
      },
      {
        find:
          "- **Lint the boundary** — Run the black-box lint over the written tests " +
          "before running them.\n",
        with: "",
      },
      {
        find:
          "- **No reference into the system under test** — The lint fails on any path or " +
          "module reference from the test project into the system under test.\n",
        with: "",
      },
      {
        find:
          "- **No internal clients** — The lint fails on any database client, ORM, or " +
          "internal queue client in setup or cleanup.\n",
        with: "",
      },
      {
        find:
          "- **Exactly one test per BB-ID** — The lint fails when an automated BB-ID has " +
          "no test or carries more than one, and no test exists without a BB-ID.\n",
        with: "",
      },
      {
        find:
          " → lint → review",
        with:
          " → review",
      },
      {
        find:
          " plus the lint,",
        with:
          ",",
      },
      {
        find:
          "every lint exception, ",
        with: "",
      },
      {
        find:
          "- **Per-test review question** — Ask the reviewer, per test, whether it " +
          "asserts exactly its case's **Then**, prepares exactly its **Given** and " +
          "`Setup:`, tears down exactly its `Cleanup:`, and nothing more or less.",
        with:
          "- **Per-test review question** — Ask the reviewer, per test, whether the test " +
          "faithfully implements its case.",
      },
    ],
  },

  "BBX-red-run-classify": {
    doc: BLACKBOX_SKILL,
    label:
      "block: red-first, its one annotated green exception, and the classification " +
      "of the red run",
    // `red-run` in the pipeline and `deferred` in `Report the exceptions`
    // both keep ordering what this block defines, so both are neutralized.
    // Two references are deliberately left: the measured `Trace identifiers`
    // line still mentions a `[PRE-IMPL: …]` marker no surviving rule
    // introduces — that line is measured and is never edited — and the
    // status table still has a `status` column with nothing defining the
    // vocabulary. Compensate in the fixture: a repo with real unchanged
    // existing behavior forces the PRE-IMPL decision onto disk.
    anchor: /^- \*\*Red-first\*\*/,
    snippet: [
      {
        find:
          "- **Pre-implementation green** — The one exception is a case pinning " +
          "unchanged existing behavior, marked `[PRE-IMPL: green — existing behavior]`.\n",
        with: "",
      },
      {
        find:
          "- **Carry PRE-IMPL annotations** — Carry `[PRE-IMPL: green — existing " +
          "behavior]` annotations into the test as a comment or metadata so the red-run " +
          "classifier knows what to expect.\n",
        with: "",
      },
      {
        find:
          "- **expected-red** — Every case's red-run outcome is classified, and a case " +
          "that fails because the surface or behavior doesn't exist yet is " +
          "`expected-red`, the healthy state to record.\n",
        with: "",
      },
      {
        find:
          "- **broken-test** — A crash, config error, syntax error, or harness timeout " +
          "is `broken-test`, fixed on the spot and rerun.\n",
        with: "",
      },
      {
        find:
          "- **unexpected-green** — A case that passes before the implementation exists " +
          "is `unexpected-green`, legitimate if and only if that case is annotated " +
          "`[PRE-IMPL: green]`, and otherwise a sign that the assertion is vacuous or " +
          "the case is not testing the new behavior, so investigate it and report what " +
          "you found.\n",
        with: "",
      },
      {
        find:
          "- **Degrade without an environment** — With no environment yet, degrade the " +
          "red run to a compile or dry-run plus the lint, mark the red run `deferred`, " +
          "and make running it the first act of the implementation phase.\n",
        with: "",
      },
      {
        find:
          "review → red-run → report",
        with:
          "review → run the suite → report",
      },
      {
        find:
          "Report every `deferred` red run, every lint exception",
        with:
          "Report every lint exception",
      },
    ],
  },

  "BBX-reporting-and-status": {
    doc: BLACKBOX_SKILL,
    label:
      "block: the persisted status file and the closing report surface",
    // The other two report obligations live with their own blocks by design
    // (`Report the uncovered` with coverage, `Report the not-materialized`
    // with scope), so no probe here may score "is the report complete" —
    // score only this block's items or the three confound each other.
    anchor: /^- \*\*Report the path\*\*/,
    snippet: [
      {
        find:
          "- **Persist the status file** — Write the per-case status table to " +
          "a status file beside the cases file so the execution state survives the " +
          "session.\n",
        with: "",
      },
      {
        find:
          "- **Status table columns** — The status table carries BB-ID, status, and " +
          "reason for each case.\n",
        with: "",
      },
      {
        find:
          "- **Report the table** — Report the status table back at the end of the run.\n",
        with: "",
      },
      {
        find:
          "- **Report the exceptions** — Report every `deferred` red run, every lint " +
          "exception, every conformance-review finding, and whether the conformance " +
          "reviewer was skipped.\n",
        with: "",
      },
      {
        find:
          "- **State the test project path** — State the test project path in the " +
          "report.\n",
        with: "",
      },
    ],
  },

  // ---- Round 2: sub-blocks of the blocks that measured load-bearing ----
  //
  // Round 1 ablated whole blocks. Every block below had at least one task
  // shape whose ablated arm failed, so the block matters — but a block
  // ablation cannot say WHICH members carry the weight. Each seam here is
  // cut where round 1's own shapes already separate: the parent shape that
  // failed points at the members that could have caused it, the shape that
  // passed points away. Priors are recorded so a round-3 result that
  // contradicts one is visible as a contradiction.
  //
  // Plan and evidence: .probe-runs/round2-seams.json

  // BBX-slug-and-sibling-spec — write side vs read side — the cleanest split in the data
  // sibling 5/0 and coined 5/0 are both authoring-time shapes; sp 0/5 and ns 1/4 are both materialize-time shapes. The two halves separate perfectly along which end of the pipeline the shape exercised.
  "BBX2-slug-write": {
    doc: BLACKBOX_SKILL,
    label: "slug-write: Sibling slug / Coined slug",
    // round-1 prior: dead — both write-side shapes passed
    anchor: /^- \*\*Sibling slug\*\*/,
    snippet: [
      { find: "- **Coined slug** — With no sibling spec to borrow from, coin a slug that is ASCII kebab-case and at most 64 characters.\n", with: "" },
    ],
  },

  "BBX2-slug-read": {
    doc: BLACKBOX_SKILL,
    label: "slug-read: Read the sibling spec / Surface line is the fallback contract",
    // round-1 prior: load-bearing — both read-side shapes failed
    anchor: /^- \*\*Read the sibling spec\*\*/,
    snippet: [
      { find: "- **Surface line is the fallback contract** — Without a spec, each case's `Surface:` text is the contract.\n", with: "" },
    ],
  },

  // BBX-red-run-classify — the red-first premise, the three status definitions, and the degraded path
  // degrade 5/0 isolates `Degrade without an environment` as inert. preimpl 0/5 and classify 0/5 fail on different things — one on the PRE-IMPL exception, one on the three-way classification — so those two do not belong together either.
  "BBX2-redrun-degrade": {
    doc: BLACKBOX_SKILL,
    label: "redrun-degrade: Degrade without an environment",
    // round-1 prior: dead — its own shape passed 5/0
    anchor: /^- \*\*Degrade without an environment\*\*/,
  },

  "BBX2-redrun-preimpl": {
    doc: BLACKBOX_SKILL,
    label: "redrun-preimpl: Red-first / Pre-implementation green / Carry PRE-IMPL annotations",
    // round-1 prior: load-bearing — preimpl 0/5
    anchor: /^- \*\*Red-first\*\*/,
    snippet: [
      { find: "- **Pre-implementation green** — The one exception is a case pinning unchanged existing behavior, marked `[PRE-IMPL: green — existing behavior]`.\n", with: "" },
      { find: "- **Carry PRE-IMPL annotations** — Carry `[PRE-IMPL: green — existing behavior]` annotations into the test as a comment or metadata so the red-run classifier knows what to expect.\n", with: "" },
    ],
  },

  "BBX2-redrun-statuses": {
    doc: BLACKBOX_SKILL,
    label: "redrun-statuses: expected-red / broken-test / unexpected-green",
    // round-1 prior: load-bearing — classify 0/5
    anchor: /^- \*\*expected-red\*\*/,
    snippet: [
      { find: "- **broken-test** — A crash, config error, syntax error, or harness timeout is `broken-test`, fixed on the spot and rerun.\n", with: "" },
      { find: "- **unexpected-green** — A case that passes before the implementation exists is `unexpected-green`, legitimate if and only if that case is annotated `[PRE-IMPL: green]`, and otherwise a sign that the assertion is vacuous or the case is not testing the new behavior, so investigate it and report what you found.\n", with: "" },
    ],
  },

  // BBX-test-project-standup — isolation vs siting vs reuse
  // isolation 5/0 while env 0/5 and extend 0/5 fail on two different obligations — confirming the target environment, and extending an existing suite rather than standing up a second.
  "BBX2-standup-isolation": {
    doc: BLACKBOX_SKILL,
    label: "standup-isolation: Isolation is non-negotiable / One file group per slug",
    // round-1 prior: dead — isolation 5/0
    anchor: /^- \*\*Isolation is non-negotiable\*\*/,
    snippet: [
      { find: "- **One file group per slug** — Organize the tests as one file group per feature slug.\n", with: "" },
    ],
  },

  "BBX2-standup-siting": {
    doc: BLACKBOX_SKILL,
    label: "standup-siting: First run only / Propose the location / Confirm the target environment",
    // round-1 prior: load-bearing — env 0/5
    anchor: /^- \*\*First run only\*\*/,
    snippet: [
      { find: "- **Propose the location** — Propose 1–3 test project locations derived from this repo's own conventions — existing test layout, language, build tooling — with your recommendation first.\n", with: "" },
      { find: "- **Confirm the target environment** — Confirm the target environment as a base URL, app entry, and credentials source, or as \"no environment yet\".\n", with: "" },
    ],
  },

  "BBX2-standup-reuse": {
    doc: BLACKBOX_SKILL,
    label: "standup-reuse: Extend, do not re-scaffold",
    // round-1 prior: load-bearing — extend 0/5
    anchor: /^- \*\*Extend, do not re-scaffold\*\*/,
  },

  // BBX-reporting-and-status — the persisted status file vs the closing report surface
  // exceptions 5/0 is the only passing shape and it tests the report's exception list; statusfile-mv 0/5 and statusfile-ml 0/5 both fail on the on-disk status table.
  "BBX2-report-statusfile": {
    doc: BLACKBOX_SKILL,
    label: "report-statusfile: Persist the status file / Status table columns / Report the table",
    // round-1 prior: load-bearing — both statusfile shapes 0/5
    anchor: /^- \*\*Persist the status file\*\*/,
    snippet: [
      { find: "- **Status table columns** — The status table carries BB-ID, status, and reason for each case.\n", with: "" },
      { find: "- **Report the table** — Report the status table back at the end of the run.\n", with: "" },
    ],
  },

  "BBX2-report-surface": {
    doc: BLACKBOX_SKILL,
    label: "report-surface: Report the path / Report the exceptions / State the test project path",
    // round-1 prior: dead — exceptions 5/0
    anchor: /^- \*\*Report the path\*\*/,
    snippet: [
      { find: "- **Report the exceptions** — Report every `deferred` red run, every lint exception, every conformance-review finding, and whether the conformance reviewer was skipped.\n", with: "" },
      { find: "- **State the test project path** — State the test project path in the report.\n", with: "" },
    ],
  },

  // BBX-run-preamble — process narration vs pre-work gates — the 0.10.0 claim tested head-on
  // readfull 5/0 is pure narration; assumed-kw 2/3 is the gate that stops on a known-wrong input. Same block, opposite results, cleanest available replication of 0.10.0's finding that narration is inert and behavioural constraints are not.
  "BBX2-preamble-narration": {
    doc: BLACKBOX_SKILL,
    label: "preamble-narration: Definition of Done / Pipeline order / Read it in full",
    // round-1 prior: dead — readfull 5/0
    anchor: /^- \*\*Definition of Done\*\*/,
    snippet: [
      { find: "- **Pipeline order** — Follow the order read → confirm → scaffold → write → lint → review → red-run → report.\n", with: "" },
      { find: "- **Read it in full** — Read the cases file in full before materializing anything.\n", with: "" },
    ],
  },

  "BBX2-preamble-gates": {
    doc: BLACKBOX_SKILL,
    label: "preamble-gates: Confirm with AskUserQuestion / Case review / Known-wrong inputs stop the run",
    // round-1 prior: load-bearing — assumed-kw 2/3
    anchor: /^- \*\*Confirm with AskUserQuestion\*\*/,
    snippet: [
      { find: "- **Case review** — Ask on every run whether a human has read the cases, because it is a property of these cases, not of the repo.\n", with: "" },
      { find: "- **Known-wrong inputs stop the run** — Only unresolved `## Pending cases` or `[ASSUMED: …]` markers stop the run, because those are known-wrong inputs rather than unreviewed ones.\n", with: "" },
    ],
  },

  // BBX-depth-and-extra-sweeps — tier selection vs the missing-line default vs the three non-money angles
  // focused 5/0 and full 5/0 both exercise choosing a tier; missing 0/5 exercises the default when the line is absent; angles 1/4 exercises the sweeps. Three distinct outcomes, three sub-blocks.
  "BBX2-depth-tier": {
    doc: BLACKBOX_SKILL,
    label: "depth-tier: Focused depth / Tie-break",
    // round-1 prior: dead — focused and full both 5/0
    anchor: /^- \*\*Focused depth\*\*/,
    snippet: [
      { find: "- **Tie-break** — When in doubt, full.\n", with: "" },
    ],
  },

  "BBX2-depth-default": {
    doc: BLACKBOX_SKILL,
    label: "depth-default: Missing depth means full",
    // round-1 prior: load-bearing — missing 0/5
    anchor: /^- \*\*Missing depth means full\*\*/,
  },

  "BBX2-sweep-angles": {
    doc: BLACKBOX_SKILL,
    label: "sweep-angles: Text-encoding angle / Localization angle / Keyboard angle",
    // round-1 prior: load-bearing — angles 1/4
    anchor: /^- \*\*Text-encoding angle\*\*/,
    snippet: [
      { find: "- **Localization angle** — Sweep i18n expansion and RTL.\n", with: "" },
      { find: "- **Keyboard angle** — Sweep keyboard-only traversal.\n", with: "" },
    ],
  },

  // BBX-materialize-scope — the blocked-case refusal vs the mode routing
  // blocked 0/5 isolates the refusal to materialize a case marked [EXTERNAL-SETUP: blocked]; nothing 5/0 and report 4/1 both exercise mode routing and reporting.
  "BBX2-scope-blocked": {
    doc: BLACKBOX_SKILL,
    label: "scope-blocked: Blocked external setup is not materialized",
    // round-1 prior: load-bearing — blocked 0/5
    anchor: /^- \*\*Blocked external setup is not materialized\*\*/,
  },

  "BBX2-scope-mode": {
    doc: BLACKBOX_SKILL,
    label: "scope-mode: Prefer automated / Automated cases only / llm-driven stays in the file / Nothing automated, report only / Report the not-materialized",
    // round-1 prior: dead — nothing 5/0, report 4/1
    anchor: /^- \*\*Prefer automated\*\*/,
    snippet: [
      { find: "- **Automated cases only** — Materialize only the `Mode: automated` cases of the reviewed cases file.\n", with: "" },
      { find: "- **llm-driven stays in the file** — A `Mode: llm-driven` case is deliberately left unmaterialized and stays in the cases file for a human or an LLM agent to run.\n", with: "" },
      { find: "- **Nothing automated, report only** — A cases file holding no `Mode: automated` case skips scaffolding through the red run and produces the report alone.\n", with: "" },
      { find: "- **Report the not-materialized** — Report as not materialized every `llm-driven` case and every case blocked by `[EXTERNAL-SETUP: blocked — <reason>]`, each with the reason it was left behind.\n", with: "" },
    ],
  },

  // BBX-fidelity-and-lint — case-to-test fidelity vs the automated lint that enforces it
  // oneper 0/5 fails on the one-test-per-case correspondence; beyondthen 4/1 and boundary 4/1 are weak. The lint lines were kept together in round 1 because splitting `Lint the boundary` from its checks orphans them; that constraint still holds.
  "BBX2-fidelity": {
    doc: BLACKBOX_SKILL,
    label: "fidelity: One test per case / Assert nothing beyond Then / Oracles from case text",
    // round-1 prior: load-bearing — oneper 0/5
    anchor: /^- \*\*One test per case\*\*/,
    snippet: [
      { find: "- **Assert nothing beyond Then** — A case's **When** becomes the test's action and its **Then** the assertions, with nothing asserted beyond them.\n", with: "" },
      { find: "- **Oracles from case text** — Every oracle must be decidable from the case text alone.\n", with: "" },
    ],
  },

  "BBX2-lint": {
    doc: BLACKBOX_SKILL,
    label: "lint: Lint the boundary / No reference into the system under test / No internal clients / Exactly one test per BB-ID",
    // round-1 prior: untested alone — no round-1 shape isolated the lint from the fidelity rules
    anchor: /^- \*\*Lint the boundary\*\*/,
    snippet: [
      { find: "- **No reference into the system under test** — The lint fails on any path or module reference from the test project into the system under test.\n", with: "" },
      { find: "- **No internal clients** — The lint fails on any database client, ORM, or internal queue client in setup or cleanup.\n", with: "" },
      { find: "- **Exactly one test per BB-ID** — The lint fails when an automated BB-ID has no test or carries more than one, and no test exists without a BB-ID.\n", with: "" },
    ],
  },

  // BBX-impl-blindness — authoring-time blindness vs materialize-time ordering
  // s1, s2 and mv all passed 5/0 and all three exercise the authoring side; ml 2/3 is the only failing shape and it is materialize-time.
  "BBX2-implblind-write": {
    doc: BLACKBOX_SKILL,
    label: "implblind-write: Requirements only / Never read implementation",
    // round-1 prior: dead — three authoring shapes 15/0
    anchor: /^- \*\*Requirements only\*\*/,
    snippet: [
      { find: "- **Never read implementation** — Never open the implementation the cases will be run against, and when the change targets an existing product, that product's code is equally off-limits.\n", with: "" },
    ],
  },

  "BBX2-implblind-materialize": {
    doc: BLACKBOX_SKILL,
    label: "implblind-materialize: Before implementation / White-box tests are elsewhere",
    // round-1 prior: load-bearing — ml 2/3
    anchor: /^- \*\*Before implementation\*\*/,
    snippet: [
      { find: "- **White-box tests are elsewhere** — Unit tests and any other white-box tests are written during implementation by `kcc-dev-core.unit-tests`.\n", with: "" },
    ],
  },

  // BBX-oracle-quality — decidability vs the three target-naming rules
  // vague 4/1 is the only shape with any failure and it tests undecidable wording; uitarget 5/0 and nfr 5/0 both test how a target is named. Weakest evidence of any block — its A arm returned delta +1, `inconclusive`.
  "BBX2-oracle-decidable": {
    doc: BLACKBOX_SKILL,
    label: "oracle-decidable: Decidable Then / No vague oracle",
    // round-1 prior: weak — vague 4/1, A-arm delta +1 inconclusive
    anchor: /^- \*\*Decidable Then\*\*/,
    snippet: [
      { find: "- **No vague oracle** — \"works correctly\", \"same as before\", \"document the actual behavior\", and \"pin whatever it does today\" are notes, not **Then** clauses.\n", with: "" },
    ],
  },

  "BBX2-oracle-targets": {
    doc: BLACKBOX_SKILL,
    label: "oracle-targets: Unquantified NFR / Locale oracle / UI target",
    // round-1 prior: dead — uitarget and nfr both 5/0
    anchor: /^- \*\*Unquantified NFR\*\*/,
    snippet: [
      { find: "- **Locale oracle** — Locale oracles assert format rules, not literals.\n", with: "" },
      { find: "- **UI target** — UI targets are role plus visible label.\n", with: "" },
    ],
  },

  // ---- Round 4: is the reviewer SUBAGENT worth what it costs? ----------
  //
  // `BBX-reviewer-subagents` deletes all seven members at once, which asks
  // "is reviewing worth it". That is not the expensive question. This
  // block's real cost is that it mandates up to two extra fresh-context
  // subagents per skill run, so the question worth paying for is narrower:
  // given that the review happens either way, does DELEGATING it to a
  // fresh context change anything?
  //
  // Arm B therefore keeps every review obligation the doc states and
  // rewrites only the delegation out of them. Both arms are told to close
  // over the draft, told to do it at both depths, given the same
  // conformance triggers, given the same per-test question, and told to fix
  // findings before running; `Pipeline order`'s own `review` phase is
  // untouched in both. The single difference is who holds the pen.
  //
  // Single-rule ablation cannot ask this. Four members independently order
  // a spawn, so removing any one leaves the other three ordering it and the
  // arm spawns anyway — four no-delta verdicts for a mechanism that is
  // demonstrably alive, and a licence to delete all four. Mutually
  // paraphrasing rules are the one shape per-rule ablation reads backwards,
  // which is why the seam here is cut by observable rather than by bullet.
  "BBX4-reviewer-delegation": {
    // ROUND 4 RESULT (claude-opus-5, 25 sealed runs, 0 void):
    //
    //   shape                      A (intact)  B (no delegation)  verdict
    //   S11  authoring, full        5/5         0/5               effective
    //   FL2  materializing, 12 cases 1/5        0/5               inconclusive
    //   FL2  ceiling (max imperative)  1/5      —                 at ceiling
    //
    // Two things came out of it. The authoring half is load-bearing and now
    // has the first hard evidence any member of this block has ever carried.
    // The materializing half is not fixable by wording: an instruction that
    // says "MUST be delegated, never performed by you. Call the Agent tool
    // to spawn exactly one general-purpose subagent" spawned 1/5, exactly
    // what the shipped text spawns. On that shape the model evaluates the
    // trigger correctly, then declines and cites a session rule forbidding
    // subagents that appears nowhere in its context.
    //
    // A follow-up edit folded `Self-review below the bar` into `One
    // fresh-context reviewer` so the doc would stop asserting a mechanism it
    // gets 20% of the time. Verified before shipping, and reverted: the
    // authoring shape fell 5/5 -> 1/5 (Fisher p≈0.024). One escape hatch,
    // stated once in the MATERIALIZING half, switched off a near-deterministic
    // behaviour in the WRITING half. This document is not a set of
    // independent bullets, and an edit that is locally honest can be
    // globally destructive.
    measuredContent:
      "the closing reviewer — 5/5 vs 0/5 on the authoring shape in round 4",
    doc: BLACKBOX_SKILL,
    label:
      "delegation only: arm B still runs the whole review, just not through a subagent",
    snippet: [
      // Authoring side — same closing pass, nobody else to carry it.
      {
        find:
          "- **Closing reviewer** — Close with one fresh-context reviewer subagent " +
          "carrying only the requirements and the draft, ask it what user-visible " +
          "behavior could break with no case going red, and turn its findings into " +
          "cases or Pending entries.",
        with:
          "- **Closing check** — Close by going back over only the requirements and " +
          "the draft, asking what user-visible behavior could break with no case " +
          "going red, and turning the findings into cases or Pending entries.",
      },
      // The bullet name alone would keep cueing a reviewer; the reason
      // clause is the content and stays verbatim.
      {
        find: "- **Reviewer at both depths** — Run it at both depths,",
        with: "- **Check at both depths** — Run it at both depths,",
      },
      // Pure delegation: it says nothing except that the reviewer is a
      // separate context. Nothing of the obligation is lost with it gone.
      {
        find:
          "- **One fresh-context reviewer** — The conformance review is a single " +
          "reviewer subagent spawned with fresh context.\n",
        with: "",
      },
      // Tautological once the review is self-run in every case, and both
      // round-4 shapes sit ABOVE the bar it describes, so no obligation
      // that either shape can exercise is lost.
      {
        find:
          "- **Self-review below the bar** — Below the reviewer bar, run the same " +
          "conformance check yourself.\n",
        with: "",
      },
      // The per-test question survives word for word — only its addressee
      // changes from a delegate to the model itself.
      {
        find: "- **Per-test review question** — Ask the reviewer, per test, whether it asserts",
        with: "- **Per-test check question** — Establish, per test, whether each test asserts",
      },
    ],
  },

  // ---- Round 4 ceiling control — POLARITY IS INVERTED -----------------
  //
  // READ THIS BEFORE USING THE VERDICT. Every other rule in this registry
  // builds arm B by REMOVING something, so B is the weaker arm. Here B is
  // the STRONGER one: it replaces the shipped delegation line with the most
  // imperative version of the same instruction that could be written. There
  // is nothing to delete on the strength of a result here, and `report.mjs`
  // deltas for this id read backwards.
  //
  // It exists because arm A of BBX4-reviewer-delegation did not spawn. Two
  // very different things produce that, and they license opposite actions:
  //
  //   the shipped wording is too weak    a real property of the rule; the
  //                                      block is not buying the mechanism
  //                                      it claims, and may be cut.
  //   `claude -p` suppresses self-       an artifact of the environment.
  //   initiated delegation               The block is UNMEASURED here and
  //                                      must not be cut.
  //
  // If arm B spawns where arm A did not, the environment permits
  // self-initiated delegation and the first reading holds. If neither
  // spawns, this harness cannot see the mechanism at all and the round-4
  // result must be reported as unmeasurable rather than as a no-delta.
  "BBX4-reviewer-ceiling": {
    doc: BLACKBOX_SKILL,
    label:
      "CEILING (inverted): arm B carries a maximally imperative delegation instruction",
    inverted: true,
    snippet: [
      {
        find:
          "- **One fresh-context reviewer** — The conformance review is a single " +
          "reviewer subagent spawned with fresh context.",
        with:
          "- **One fresh-context reviewer** — The conformance review MUST be " +
          "delegated, never performed by you. Call the Agent tool to spawn exactly " +
          "one general-purpose subagent with fresh context, hand it the cases file " +
          "and the tests you wrote, and wait for its reply before the red run. " +
          "Reviewing the tests yourself instead of spawning that subagent does not " +
          "satisfy this skill.",
      },
    ],
  },

  // ------------------------------------------------------------------
  // kcc-pm charter (context/pm-charter.md, injected when the fixture
  // plants a `.kcc-pm.json` marker — every PM probe's fixture must).
  //
  // The charter's iron laws are a NUMBERED list ("1. **…**") and the
  // output-spec bullets are plain "- …" — neither form matches the anchor
  // block boundary (`- **` / heading), so every rule here ablates via a
  // whole-line snippet. A deleted iron law leaves a numbering gap in arm
  // B; the number carries no content, and renumbering would touch lines
  // owned by other rules.
  // ------------------------------------------------------------------

  // Campaign 2026-08-07 (pm-r2, ~330 runs): per-rule A/B on the v1
  // charter across two task shapes. Retired rules met the asymmetric
  // deletion bar (two shapes agreeing on no marginal value); PM-E02 and
  // PM-L11 measured as rule-failures (text drove neither arm) and were
  // rewritten as v2 trigger-style constraints below.
  //
  // CAVEAT: every verdict below was measured against the CHINESE charter
  // text. The charter was translated to English afterwards and the
  // snippets re-synced to it, so the rules are the same rules but the
  // exact strings the campaign ran on no longer exist on disk. Treat the
  // recorded p-values as evidence about the rule, not about this wording.
  ...Object.fromEntries(
    Object.entries({
      "PM-L01": ["iron law 1 CEO of the product",
        "1. **CEO of the product**: own the outcome fully, no excuses; define your own work, don't wait to be told.\n"],
      "PM-L02": ["iron law 2 vet the request before accepting it",
        "2. **Vet the request before you accept it**: what problem does it solve? What happens if we don't? What data backs it? — be a filter, not a translator (applies to the boss's requests as much as to users').\n"],
      "PM-L04": ["iron law 3 Outcome > Output",
        "3. **Outcome > Output**: measure changed user behavior and business results, not how much you shipped.\n"],
      "PM-L05": ["iron law 4 conclusion first, positions in writing",
        "4. **Conclusion first, positions in writing**: lead every deliverable with the conclusion and recommendation, then the evidence; can't write it clearly = haven't thought it through.\n"],
      "PM-L07": ["iron law 5 opportunity-cost thinking",
        "5. **Opportunity-cost thinking**: not \"is this worth doing\", but \"is this the most worth doing right now\"; when you say no, name the opportunity cost.\n"],
      "PM-L08": ["iron law 6 retention before acquisition",
        "6. **Retention before acquisition**: don't scale spend until the retention curve flattens; create user value before you harvest it (returns come later).\n"],
      "PM-L09": ["iron law 7 set the goal and its measurement definition first",
        "7. **Set the goal and its measurement definition before acting**: write down the expected numbers and the success bar before anything ships, and run the four-step retro after (revisit the goal → compare results → dig for root causes → generalize the lesson).\n"],
      "PM-L10": ["iron law 8 granularity and segmentation",
        "8. **Granularity and segmentation**: segment users, never blast everyone; keep 70%+ of what happens knowable and controllable.\n"],
      "PM-L12": ["iron law 10 when execution stalls, check the strategy",
        "10. **When execution stalls, check the strategy first**: most execution problems are strategy problems; pre-mortem anything major (Tigers / Paper Tigers / Elephants).\n"],
      "PM-E04": ["evidence discipline tag evidence with its source type",
        "- **Tag evidence with its source type** (walkthrough / user's own words / survey / data query); \"users want\" and \"everyone thinks\" are banned, only \"M of N users did / said X\".\n"],
      "PM-O01": ["output spec conclusion first + facts separate from assumptions",
        "- Conclusion first; back key judgments with evidence (data, precedent or framework), and label facts separately from assumptions.\n"],
      "PM-O03": ["output spec trade-off and the case against",
        "- Give each option its trade-off and the case against it; attach next actions to any significant recommendation.\n"],
      "PM-O05": ["output spec watch your own anti-patterns",
        "- Watch for your own anti-patterns: feature stacking, vanity metrics, framework collecting, reporting data instead of insight, treating launch as a one-off event.\n"],
      "PM-W03": ["workspace rules strike through corrections, don't delete",
        "- Overturned conclusions are struck through, not deleted, with the basis for the correction noted.\n"],
    }).map(([id, [label, find]]) => [
      id,
      {
        // kcc-pm 0.3.0: the charter merged into the pm-playbook skill so
        // injection scope is the task, not the workspace. NOTE for the
        // next campaign: the plugin now ships NO SessionStart hook, so
        // the skill-delivery route has no injection channel — the arm
        // builder must first plant a delivery hook (hooks.json + a
        // cat-the-via-file script) into the VARIANT copy, or every run
        // will void as `arm sentinel absent`. Extend makeDocVariant (or
        // add a campaign-side fixture hook) before running these.
        doc: {
          plugin: "kcc-pm",
          path: "skills/pm-playbook/SKILL.md",
          deliver: "skill",
          via: "context/pm-pointer.md",
          skill: "kcc-pm.pm-playbook",
        },
        label,
        snippet: { find, with: "" },
      },
    ])
  ),

  // Measured load-bearing (pm-r2 campaign) — re-ablating needs an
  // explicit override; a no-delta from a rerun could only be weaker
  // than the measurement it contradicts.
  "PM-O02": {
    doc: { plugin: "kcc-pm", path: "skills/pm-playbook/SKILL.md", deliver: "skill", via: "context/pm-pointer.md", skill: "kcc-pm.pm-playbook" },
    label: "output spec no correct-but-useless advice + counter-metric",
    measuredContent: "pm-o02: A 5/5 vs B 0/5, Fisher p≈0.004 (2026-08-07)",
    snippet: {
      find: "- No correct-but-useless advice: every recommendation is concrete enough to act on — who, does what, measured how; success metrics must include ≥1 counter-metric.\n",
      with: "",
    },
  },
  "PM-W02": {
    doc: { plugin: "kcc-pm", path: "skills/pm-playbook/SKILL.md", deliver: "skill", via: "context/pm-pointer.md", skill: "kcc-pm.pm-playbook" },
    label: "workspace rules persist facts on the spot",
    measuredContent: "pm-w02: A 9/10 vs B 1/10 @N10, p<0.001 (2026-08-07)",
    snippet: {
      find: "- Newly verified business facts get persisted on the spot into the matching context file, with the discovery date and how it was verified; \"looked for it, it doesn't exist\" is also a fact — record it.\n",
      with: "",
    },
  },
  "PM-L11v2": {
    doc: { plugin: "kcc-pm", path: "skills/pm-playbook/SKILL.md", deliver: "skill", via: "context/pm-pointer.md", skill: "kcc-pm.pm-playbook" },
    label: "iron law 9 a binary choice is a trap (L11 rewrite)",
    measuredContent: "pm3-l11: A 4/5 vs B 0/5, p≈0.048 (2026-08-07; v1 text was 0/5 vs 0/5)",
    snippet: {
      find: "9. **A binary choice is a trap**: when asked for a \"ship it / don't\" or \"should we\" verdict on a single option, first produce a comparison of ≥3 candidates (with opportunity costs and why the rejected ones lost), then conclude — never emit the binary verdict directly.\n",
      with: "",
    },
  },
  "PM-E02v2": {
    doc: { plugin: "kcc-pm", path: "skills/pm-playbook/SKILL.md", deliver: "skill", via: "context/pm-pointer.md", skill: "kcc-pm.pm-playbook" },
    label: "evidence discipline every number states where it came from (E02 rewrite)",
    measuredContent: "pm3-e02: A 9/10 vs B 3/10 @N10, p≈0.01 (2026-08-07; v1 text was 2/5 vs 1/5)",
    snippet: {
      find: "- **Every number states where it came from**: each figure in a report or conclusion must be immediately followed by a parenthetical (source; measurement definition; date); a figure missing any of the three must not be written at all; prefer ratio-type, segmentable metrics and distrust cumulative counts.\n",
      with: "",
    },
  },

  // Retired in kcc-pm 0.2.0 — two task shapes agreed on no marginal
  // value (B-arm ceiling / no-delta), or the rule text measurably drove
  // neither arm (E02, L11 — superseded by the v2 rewrites above).
  "PM-L03": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "iron law user-value formula", retired: "0.2.0" },
  "PM-L06": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "iron law metrics-informed", retired: "0.2.0" },
  "PM-L11": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "iron law multi-option comparison (original text ineffective, v2 rewrite)", retired: "0.2.0" },
  "PM-E01": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "evidence discipline verification order", retired: "0.2.0" },
  "PM-E02": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "evidence discipline no relayed numbers (original text ineffective, v2 rewrite)", retired: "0.2.0" },
  "PM-E03": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "evidence discipline two-path cross-check", retired: "0.2.0" },
  "PM-E05": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "evidence discipline assumption format gate", retired: "0.2.0" },
  "PM-E06": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "evidence discipline when you must guess", retired: "0.2.0" },
  "PM-O04": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "output spec the fixed four-part format", retired: "0.2.0" },
  "PM-ID01": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "identity baseline sentence", retired: "0.2.0" },
  "PM-ID02": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "identity role-fusion sentence", retired: "0.2.0" },
  "PM-W01": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "workspace rules read context before the task", retired: "0.2.0" },
  // W04 told the model to consult the playbook's router before acting;
  // in 0.3.0 the charter merged INTO the playbook, so the rule became a
  // self-reference with nothing left to point at. Structural retirement,
  // not a measured verdict (it was untestable headless throughout).
  "PM-W04": { doc: { plugin: "kcc-pm", path: "context/pm-charter.md", deliver: "context" }, label: "workspace rules consult the router table first", retired: "0.3.0" },

};
