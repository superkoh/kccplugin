import { test } from "node:test";
import assert from "node:assert/strict";
import { generateId, slugify } from "../../scripts/lib/backlog-id.mjs";

test("slugify lowercases, replaces non-alphanumeric with dash, trims", () => {
  assert.equal(slugify("Refactor Auth Middleware"), "refactor-auth-middleware");
  assert.equal(slugify("  trim me "), "trim-me");
  assert.equal(slugify("多-dashes---collapsed"), "dashes-collapsed");
  assert.equal(slugify("a/b:c"), "a-b-c");
});

test("slugify drops non-ASCII, caps at 40 chars", () => {
  const long = "a".repeat(80);
  assert.equal(slugify(long).length, 40);
  // Chinese-only titles fall back to 'item' so the slug is never empty.
  assert.equal(slugify("重构认证"), "item");
  // Mixed keeps the ASCII run.
  assert.equal(slugify("重构 auth 中间件"), "auth");
});

test("generateId builds YYYY-MM-DD-<slug>", () => {
  const id = generateId({ title: "Refactor auth", date: new Date("2026-04-17T10:00:00Z"), existing: [] });
  assert.equal(id, "2026-04-17-refactor-auth");
});

test("generateId appends -2, -3 on collision", () => {
  const existing = ["2026-04-17-refactor-auth"];
  const id2 = generateId({ title: "Refactor auth", date: new Date("2026-04-17"), existing });
  assert.equal(id2, "2026-04-17-refactor-auth-2");
  const id3 = generateId({ title: "Refactor auth", date: new Date("2026-04-17"), existing: [...existing, id2] });
  assert.equal(id3, "2026-04-17-refactor-auth-3");
});

test("generateId uses today's date when date omitted", () => {
  const id = generateId({ title: "x", existing: [] });
  assert.match(id, /^\d{4}-\d{2}-\d{2}-x$/);
});
