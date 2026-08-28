import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { computePlan } from "../lib/plan.mjs";
import { IRREGULAR, applyPlan, isIrregular, readDiskHashes } from "../lib/fsops.mjs";

/**
 * These cover the seam where the planner meets the filesystem. A pure-function
 * test cannot reach it: the bug they pin down was that `readDiskHashes` reported
 * "absent" for anything that was not a regular file, so the conflict gate never
 * saw a directory or a symlink standing at a managed path.
 */

async function scratch() {
  return mkdtemp(path.join(tmpdir(), "kcc-irregular-"));
}

test("a directory at a managed path reads as irregular, not absent", async () => {
  const root = await scratch();
  try {
    await mkdir(path.join(root, "a/b"), { recursive: true });
    const hashes = await readDiskHashes(root, ["a/b", "a/missing"]);
    assert.equal(hashes.get("a/b"), IRREGULAR.dir);
    assert.equal(hashes.has("a/missing"), false, "genuinely absent stays absent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a symlink at a managed path reads as irregular, not as its target", async () => {
  const root = await scratch();
  try {
    await writeFile(path.join(root, "target.txt"), "payload\n");
    await symlink(path.join(root, "target.txt"), path.join(root, "link"));
    const hashes = await readDiskHashes(root, ["link"]);
    assert.equal(hashes.get("link"), IRREGULAR.symlink);
    assert.ok(isIrregular(hashes.get("link")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an irregular entry is a conflict even when the lockfile claims the path", async () => {
  const sourceModules = new Map([
    [
      "m",
      {
        name: "m",
        version: "1.0.0",
        description: "",
        requires: [],
        hooks: {},
        files: new Map([["p", { sourceAbs: "/src/p", hash: "h1", mode: 0o644 }]]),
      },
    ],
  ]);
  const plan = computePlan({
    sourceModules,
    selection: ["m"],
    lock: { modules: { m: { version: "1.0.0", files: { p: "h1" } } } },
    diskHashes: new Map([["p", IRREGULAR.dir]]),
  });
  assert.equal(plan.files.length, 0, "must not be planned for a write");
  assert.deepEqual(
    plan.conflicts.map((c) => [c.path, c.kind]),
    [["p", "directory"]]
  );
});

test("--adopt clears the irregular entry and writes the real file", async () => {
  const root = await scratch();
  try {
    const src = path.join(root, "source.sh");
    await writeFile(src, "#!/bin/sh\necho hi\n", { mode: 0o755 });
    const target = path.join(root, "project");
    await mkdir(path.join(target, "p"), { recursive: true }); // a directory in the way

    const sourceModules = new Map([
      [
        "m",
        {
          name: "m",
          version: "1.0.0",
          description: "",
          requires: [],
          hooks: {},
          files: new Map([["p", { sourceAbs: src, hash: "h1", mode: 0o755 }]]),
        },
      ],
    ]);
    const plan = computePlan({
      sourceModules,
      selection: ["m"],
      lock: null,
      diskHashes: await readDiskHashes(target, ["p"]),
      opts: { adopt: true },
    });
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.files[0].status, "clobbered");

    const res = await applyPlan({ plan, targetRoot: target, backupStamp: "t" });
    assert.equal(res.written, 1);
    assert.ok(statSync(path.join(target, "p")).isFile(), "the directory was replaced by the file");
    assert.ok(res.backupDir, "the displaced directory was backed up");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the executable bit survives installation", async () => {
  const root = await scratch();
  try {
    const src = path.join(root, "hook.sh");
    await writeFile(src, "#!/usr/bin/env bash\n", { mode: 0o755 });
    const target = path.join(root, "project");
    const sourceModules = new Map([
      [
        "m",
        {
          name: "m",
          version: "1.0.0",
          description: "",
          requires: [],
          hooks: {},
          files: new Map([
            [".claude/kcc/m/scripts/hook.sh", { sourceAbs: src, hash: "h1", mode: 0o755 }],
          ]),
        },
      ],
    ]);
    const plan = computePlan({
      sourceModules,
      selection: ["m"],
      lock: null,
      diskHashes: new Map(),
    });
    await applyPlan({ plan, targetRoot: target, backupStamp: "t" });
    const mode = statSync(path.join(target, ".claude/kcc/m/scripts/hook.sh")).mode & 0o777;
    assert.equal(mode, 0o755, "a 0644 install silently breaks any directly-executed script");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
