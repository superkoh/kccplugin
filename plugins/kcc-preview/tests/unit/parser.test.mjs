import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEntry } from "../../scripts/lib/parser.mjs";

test("inline kind with markdown body", () => {
  const text = `---
title: "My doc"
kind: inline
---
# Hello

body here`;
  const r = parseEntry("x.md", text);
  assert.equal(r.error, undefined);
  assert.equal(r.kind, "inline");
  assert.equal(r.title, "My doc");
  assert.match(r.body, /# Hello/);
});

test("file kind requires path", () => {
  const text = `---
title: "Spec"
kind: file
path: "/tmp/foo.md"
---
`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "file");
  assert.equal(r.path, "/tmp/foo.md");
});

test("file kind missing path produces error", () => {
  const text = `---
title: "Bad"
kind: file
---
`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /path is required when kind is 'file'/);
});

test("html kind with body", () => {
  const text = `---
title: "Grid"
kind: html
---
<div class="grid"></div>`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "html");
  assert.match(r.body, /<div/);
});

test("default kind is inline when omitted", () => {
  const text = `---
title: "Untyped"
---
just markdown`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "inline");
});

test("unknown kind produces error", () => {
  const text = `---
title: "X"
kind: nonsense
---
`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /unknown kind: nonsense/);
});

test("missing title produces error", () => {
  const text = `---
kind: inline
---
body`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /title is required/);
});

test("no frontmatter on .html file → vc fragment", () => {
  const text = `<h2>Options</h2><div class="options"></div>`;
  const r = parseEntry("layout.html", text);
  assert.equal(r.kind, "vc");
  assert.equal(r.title, "layout");
  assert.match(r.body, /<h2/);
});

test("no frontmatter on .md file → error", () => {
  const text = `# Just markdown, no frontmatter`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /no frontmatter/);
});

test("quoted string values are unquoted", () => {
  const text = `---
title: "With spaces and: colons"
kind: inline
---
x`;
  const r = parseEntry("x.md", text);
  assert.equal(r.title, "With spaces and: colons");
});
