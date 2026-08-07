import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVariant, stripFrontmatter } from "./ablate.mjs";

const DOC = [
  "# T",
  "",
  "## Working rules",
  "",
  "- **Alpha.** first line",
  "  continuation of alpha",
  "- **Beta.** second rule",
  "- **Gamma.** third rule",
  "",
  '## Before "done"',
  "",
  "body",
  "",
  "<!-- kcc-core-sentinel: kcc-core-thinking-principles-v10 -->",
  "",
].join("\n");

test("deletes the anchored rule including its continuation lines", () => {
  const { text, removedLines } = buildVariant(DOC, {
    anchor: /^- \*\*Alpha\./,
    sentinel: "probe-b-alpha",
    label: "alpha",
  });
  assert.equal(removedLines, 2);
  assert.ok(!text.includes("**Alpha.**"), "anchor line must be gone");
  assert.ok(!text.includes("continuation of alpha"), "continuation must be gone");
  assert.ok(text.includes("- **Beta.** second rule"), "sibling rules stay");
  assert.ok(text.includes("- **Gamma.** third rule"), "sibling rules stay");
});

test("a section's last rule stops at the next heading and keeps one separator", () => {
  const { text, removedLines } = buildVariant(DOC, {
    anchor: /^- \*\*Gamma\./,
    sentinel: "probe-b-gamma",
    label: "gamma",
  });
  assert.equal(removedLines, 1);
  assert.ok(!text.includes("third rule"));
  assert.ok(
    text.includes('- **Beta.** second rule\n\n## Before "done"'),
    "exactly one blank line must remain at the seam"
  );
});

// The last section of a doc runs to EOF, and the sentinel comment sits
// there. Without treating the comment as a block boundary, ablating that
// section deletes the arm's own identity marker and every run of that
// arm is unattributable.
test("the trailing sentinel comment bounds the last section", () => {
  const { text, removedLines } = buildVariant(DOC, {
    anchor: /^## Before "done"$/,
    sentinel: "probe-b-lastsection",
    label: "last-section",
  });
  assert.equal(removedLines, 3, "heading + blank + body, not the sentinel");
  assert.ok(!text.includes("body"));
  assert.ok(text.includes("<!-- kcc-core-sentinel: probe-b-lastsection -->"));
});

test("throws if an ablation would delete the sentinel line", () => {
  const noBoundary = '# T\n\n## Tail\n\nbody\n\n<!-- kcc-core-sentinel: x -->\n';
  assert.throws(
    () =>
      buildVariant(noBoundary, {
        snippet: [{ find: "<!-- kcc-core-sentinel: x -->", with: "" }],
        sentinel: "probe-b",
        label: "self-destructing",
      }),
    /sentinel/i,
    "an arm with no sentinel cannot be attributed and must fail loudly"
  );
});

test("a null anchor is the A arm: body untouched, sentinel still swapped", () => {
  const { text, removedLines } = buildVariant(DOC, {
    anchor: null,
    sentinel: "probe-a",
    label: "control",
  });
  assert.equal(removedLines, 0);
  assert.equal(
    text.replace("probe-a", "kcc-core-thinking-principles-v10"),
    DOC,
    "A arm must differ from the source only in the sentinel token"
  );
});

test("substitutes the arm sentinel and drops the original token", () => {
  const { text } = buildVariant(DOC, {
    anchor: null,
    sentinel: "probe-a1",
    label: "control",
  });
  assert.ok(text.includes("<!-- kcc-core-sentinel: probe-a1 -->"));
  assert.ok(!text.includes("kcc-core-thinking-principles-v10"));
});

test("throws when the anchor matches nothing, naming the rule", () => {
  assert.throws(
    () =>
      buildVariant(DOC, {
        anchor: /^- \*\*Delta\./,
        sentinel: "probe-b",
        label: "delta",
      }),
    /delta/,
    "a silent no-op would make the B arm identical to A"
  );
});

test("throws when the anchor is ambiguous", () => {
  assert.throws(
    () =>
      buildVariant(DOC, {
        anchor: /^- \*\*/,
        sentinel: "probe-b",
        label: "any-rule",
      }),
    /ambiguous|multiple/i
  );
});

test("a snippet ablation rewrites an exact clause in place", () => {
  const { text, removedLines } = buildVariant(DOC, {
    snippet: { find: "first line\n  continuation of alpha", with: "first line" },
    sentinel: "probe-b-clause",
    label: "alpha-clause",
  });
  assert.equal(removedLines, 1, "one line's worth of text disappeared");
  assert.ok(text.includes("- **Alpha.** first line\n- **Beta.**"), "clause removed, bullet kept");
});

test("several snippets can be ablated together, leaving no dangling reference", () => {
  // Deleting a rule that other rules mention by name is only a real
  // ablation once those references go too.
  const { text, removedLines } = buildVariant(DOC, {
    snippet: [
      { find: "  continuation of alpha\n", with: "" },
      { find: "- **Gamma.** third rule\n", with: "" },
    ],
    sentinel: "probe-b-multi",
    label: "alpha+gamma",
  });
  assert.equal(removedLines, 2);
  assert.ok(!text.includes("continuation of alpha"));
  assert.ok(!text.includes("third rule"));
  assert.ok(text.includes("- **Beta.** second rule"));
});

test("throws when the snippet is absent, naming the rule", () => {
  assert.throws(
    () =>
      buildVariant(DOC, {
        snippet: { find: "text that is not in the doc", with: "" },
        sentinel: "probe-b",
        label: "phantom",
      }),
    /phantom/,
    "a snippet that drifted out of the doc must not silently no-op"
  );
});

test("throws when the snippet occurs more than once", () => {
  assert.throws(
    () =>
      buildVariant(DOC, {
        snippet: { find: "rule", with: "" },
        sentinel: "probe-b",
        label: "dup",
      }),
    /ambiguous|multiple/i
  );
});

test("throws when the document carries no sentinel line", () => {
  assert.throws(
    () =>
      buildVariant("# T\n\n- **Alpha.** x\n", {
        anchor: null,
        sentinel: "probe-a",
        label: "control",
      }),
    /sentinel/i
  );
});

// Each ablatable document names its own sentinel marker: kcc-core's docs
// use `kcc-core-sentinel`, kcc-dev-core's skills use
// `kcc-dev-core-<skill>-sentinel`. Recognising only the first one would
// make every kcc-dev-core arm throw as sentinel-less — or worse, keep the
// original token and make both arms answer to the same string.
test("recognises a sentinel marker whose prefix is not kcc-core", () => {
  const skillDoc = [
    "# Writing unit tests",
    "",
    "- **Never paste implementation output** — Never run the implementation",
    "  and paste its output back as the expectation.",
    "",
    "<!-- kcc-dev-core-unit-tests-sentinel: v3 -->",
    "",
  ].join("\n");

  const { text } = buildVariant(skillDoc, {
    anchor: /^- \*\*Never paste implementation output\*\*/,
    sentinel: "probe-B-UT-paste",
    label: "ut-paste",
  });
  assert.ok(
    text.includes("<!-- kcc-dev-core-unit-tests-sentinel: probe-B-UT-paste -->"),
    "the arm token must replace the skill doc's own sentinel value"
  );
  assert.ok(!text.includes("v3 -->"), "the original token must be gone");
});

test("strips YAML frontmatter, returning the body from its first content line", () => {
  const skill = "---\ndescription: Use when …\n---\n\n# Writing unit tests\n\nbody\n";
  assert.equal(stripFrontmatter(skill), "# Writing unit tests\n\nbody\n");
});

test("leaves a document with no frontmatter untouched", () => {
  const doc = "# Development Discipline\n\n- **Rule.** x\n";
  assert.equal(stripFrontmatter(doc), doc);
});

test("throws on frontmatter that is opened but never closed", () => {
  assert.throws(
    () => stripFrontmatter("---\ndescription: Use when …\n\n# Writing unit tests\n"),
    /frontmatter/i,
    "injecting a half-parsed file is exactly the silent-corruption failure"
  );
});
