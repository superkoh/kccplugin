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
 */

export const MAIN_DOC = "context/thinking-principles.md";
export const SUBAGENT_DOC = "context/thinking-principles-subagent.md";

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

};
