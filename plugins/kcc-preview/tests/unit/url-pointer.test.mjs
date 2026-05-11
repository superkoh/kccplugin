import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readUrlPointer, writeUrlPointer, pointerPath } from "../../scripts/lib/url-pointer.mjs";

async function tmpHome(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-upt-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test("readUrlPointer returns null when file absent", async (t) => {
  const home = await tmpHome(t);
  assert.equal(await readUrlPointer({ home }), null);
});

test("writeUrlPointer then readUrlPointer round-trips", async (t) => {
  const home = await tmpHome(t);
  await writeUrlPointer("http://localhost:51297", { home });
  assert.equal(await readUrlPointer({ home }), "http://localhost:51297");
});

test("writeUrlPointer is atomic (no torn read)", async (t) => {
  const home = await tmpHome(t);
  await writeUrlPointer("http://localhost:51296", { home });
  // Implementation must write tmp then rename — verify by checking no .tmp
  // residue is left after a successful write.
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(home);
  assert.deepEqual(entries.sort(), ["url"]);
});

test("readUrlPointer trims trailing newline", async (t) => {
  const home = await tmpHome(t);
  await writeFile(path.join(home, "url"), "http://localhost:51296\n");
  assert.equal(await readUrlPointer({ home }), "http://localhost:51296");
});

test("pointerPath honors home override", () => {
  assert.equal(pointerPath({ home: "/x" }), "/x/url");
});
