// Shared hook-stdout validator for plugin unit tests.
//
// Rationale: Claude Code's hook-output schema rejects certain shapes at
// runtime (SessionEnd emitting hookSpecificOutput, typo'd hookEventName,
// unknown fields, etc.) but the four-layer test framework has no native
// coverage for it — L1 is static-file-only, L2 tests historically asserted
// their own JSON back at themselves, L3 `-p --bare` doesn't fire SessionEnd,
// and L4 only checks CLI load. So every plugin's hook stdout lived in a
// blind spot until something broke in production.
//
// This helper is the plug. Any plugin's hook unit test should route its
// captured stdout through `assertHookOutput(event, stdout)` instead of
// ad-hoc shape checks.
//
// Schema source of truth: https://code.claude.com/docs/en/hooks

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, "..", "schemas", "hook-output.schema.json");

// Events that per the docs have "no control, side effects only" — emitting
// hookSpecificOutput on these is a schema violation at runtime.
const EVENTS_WITHOUT_HOOK_SPECIFIC_OUTPUT = new Set([
  "SessionEnd",
  "StopFailure",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
  "WorktreeRemove",
]);

let _validatorPromise = null;
async function getValidator() {
  if (!_validatorPromise) {
    _validatorPromise = (async () => {
      const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf-8"));
      const ajv = new Ajv({ allErrors: true, strict: false });
      return ajv.compile(schema);
    })();
  }
  return _validatorPromise;
}

export async function validateHookOutput(event, stdout) {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, errors: [`stdout is not valid JSON: ${e.message}`], parsed: null };
  }

  const validate = await getValidator();
  if (!validate(parsed)) {
    for (const err of validate.errors || []) {
      errors.push(`${err.instancePath || "(root)"} ${err.message}`);
    }
  }

  // Event-specific discriminator checks that a plain schema can't express
  // without per-event oneOf branches. Doing it in code keeps the schema
  // readable and the error messages precise.
  if (EVENTS_WITHOUT_HOOK_SPECIFIC_OUTPUT.has(event)) {
    if (parsed && "hookSpecificOutput" in parsed) {
      errors.push(
        `event "${event}" must not emit hookSpecificOutput — ` +
        `Claude Code's schema rejects it at runtime`
      );
    }
  } else if (parsed && parsed.hookSpecificOutput) {
    const got = parsed.hookSpecificOutput.hookEventName;
    if (got !== event) {
      errors.push(
        `hookSpecificOutput.hookEventName=${JSON.stringify(got)} ` +
        `but hook is running as ${JSON.stringify(event)}`
      );
    }
  }

  return { ok: errors.length === 0, errors, parsed };
}

export async function assertHookOutput(event, stdout) {
  const { ok, errors, parsed } = await validateHookOutput(event, stdout);
  assert.ok(
    ok,
    `hook-output schema violations for event "${event}":\n  - ${errors.join("\n  - ")}\n` +
    `stdout was:\n${stdout}`
  );
  return parsed;
}
