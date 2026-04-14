/**
 * Matcher helpers for L3 e2e assertions.
 *
 * An e2e YAML case declares an `expect` block. This module knows how to
 * check each supported matcher against the {exitCode, stdout, parsed}
 * result returned by claude-runner.
 *
 * Design choices:
 *
 * - Matchers are deliberately *loose*. Model outputs are non-deterministic,
 *   so exact-string assertions are a bad idea. `contains` / `matches` /
 *   `notContains` cover 95% of what a plugin author actually wants to verify.
 *
 * - Structured assertions use `parsed` (the JSON object emitted by
 *   --output-format=json) so you can pluck fields via simple dot paths.
 *
 * - When a plugin really needs determinism, the YAML case can set
 *   `jsonSchema` to force the model into a structured-output shape, then
 *   use `parsedJson:` matchers on the fields.
 */

/** Look up a dotted path inside an object. Returns undefined if missing. */
function pluck(obj, dottedPath) {
  if (!obj || !dottedPath) return obj;
  return dottedPath
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/**
 * Evaluate the `expect` block of an e2e case against a run result.
 *
 * @param {object} expect            parsed YAML `expect:` block
 * @param {object} result            result returned by runClaude
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function evaluate(expect, result) {
  const failures = [];

  if (!expect) return { ok: true, failures };

  if (typeof expect.exitCode === "number") {
    if (result.exitCode !== expect.exitCode) {
      failures.push(
        `exitCode: expected ${expect.exitCode}, got ${result.exitCode}`
      );
    }
  }

  if (expect.stdout) {
    const haystack = result.stdout ?? "";
    checkTextBlock("stdout", expect.stdout, haystack, failures);
  }

  if (expect.stderr) {
    const haystack = result.stderr ?? "";
    checkTextBlock("stderr", expect.stderr, haystack, failures);
  }

  // Matchers against the parsed JSON (the `result` field of claude -p's
  // JSON output is usually where the model's final answer lands; we let
  // the YAML pluck whichever path it wants).
  if (expect.parsedJson) {
    if (result.parsed == null) {
      failures.push("parsedJson: stdout was not valid JSON");
    } else {
      for (const [dotPath, rule] of Object.entries(expect.parsedJson)) {
        const value = pluck(result.parsed, dotPath);
        checkValue(`parsedJson.${dotPath}`, rule, value, failures);
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

function checkTextBlock(label, spec, haystack, failures) {
  if (spec.contains) {
    const items = Array.isArray(spec.contains) ? spec.contains : [spec.contains];
    for (const needle of items) {
      if (!haystack.includes(needle)) {
        failures.push(`${label}.contains: missing ${JSON.stringify(needle)}`);
      }
    }
  }
  if (spec.notContains) {
    const items = Array.isArray(spec.notContains)
      ? spec.notContains
      : [spec.notContains];
    for (const needle of items) {
      if (haystack.includes(needle)) {
        failures.push(
          `${label}.notContains: unexpectedly found ${JSON.stringify(needle)}`
        );
      }
    }
  }
  if (spec.matches) {
    const items = Array.isArray(spec.matches) ? spec.matches : [spec.matches];
    for (const pattern of items) {
      const re = new RegExp(pattern);
      if (!re.test(haystack)) {
        failures.push(`${label}.matches: pattern ${pattern} did not match`);
      }
    }
  }
  if (spec.notMatches) {
    const items = Array.isArray(spec.notMatches)
      ? spec.notMatches
      : [spec.notMatches];
    for (const pattern of items) {
      const re = new RegExp(pattern);
      if (re.test(haystack)) {
        failures.push(
          `${label}.notMatches: pattern ${pattern} unexpectedly matched`
        );
      }
    }
  }
}

function checkValue(label, rule, value, failures) {
  // Rule can be a literal (strict-equal check) or a matcher object.
  if (rule === null || typeof rule !== "object") {
    if (value !== rule) {
      failures.push(
        `${label}: expected ${JSON.stringify(rule)}, got ${JSON.stringify(value)}`
      );
    }
    return;
  }
  if ("equals" in rule && value !== rule.equals) {
    failures.push(
      `${label}.equals: expected ${JSON.stringify(rule.equals)}, got ${JSON.stringify(value)}`
    );
  }
  if ("contains" in rule) {
    if (typeof value !== "string" || !value.includes(rule.contains)) {
      failures.push(
        `${label}.contains: ${JSON.stringify(value)} does not include ${JSON.stringify(rule.contains)}`
      );
    }
  }
  if ("matches" in rule) {
    if (typeof value !== "string" || !new RegExp(rule.matches).test(value)) {
      failures.push(
        `${label}.matches: ${JSON.stringify(value)} did not match /${rule.matches}/`
      );
    }
  }
  if ("type" in rule) {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (actual !== rule.type) {
      failures.push(`${label}.type: expected ${rule.type}, got ${actual}`);
    }
  }
}
