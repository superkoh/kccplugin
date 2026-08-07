/**
 * Stage 4 — the eight UNCERTAIN principles of
 * plugins/kcc-dev-core/skills/unit-tests/SKILL.md.
 *
 * Design order (README's, and the reason this file is mostly fixtures):
 * five TASK SHAPES came first, each a realistic piece of work with a
 * planted trap; the arm is only *which rule got ablated*. A principle is
 * then mapped onto the 2–3 shapes that actually expose it. Nothing here
 * is one probe per principle — the shapes are the expensive part and are
 * deliberately shared.
 *
 *   S1  legacy-backfill, NO contract anywhere. src/legacy.js carries two
 *       bugs whose correct answers are world knowledge and nothing else:
 *       isLeapYear drops the 400-year rule (2000 → false) and
 *       compareVersions compares strings ("1.10.0" < "1.9.0"). This is
 *       the region 0.10.0 never measured — both of its fixtures had
 *       written requirements — and it is the only place where "derive
 *       the expectation" and "run it and paste the output" can diverge
 *       with no document to arbitrate.
 *   S2  backfill onto a GREEN BUT POWERLESS suite, contract present and
 *       contradicted. The docstring says take() throws RangeError above
 *       capacity; the code returns false. The existing tests assert
 *       `!== undefined` and `typeof === "boolean"`, and buy their refill
 *       coverage with a real 1100 ms sleep — bait for both the mutation
 *       probe and the clock double.
 *   S3  new code with three unpredictable collaborators (fetch, timers,
 *       Math.random jitter) behind a fixed stub signature.
 *   S4  frontend backfill: a component with the pricing arithmetic baked
 *       into its render body, plus `.err` / `.total` classes, a
 *       `data-state` attribute and a `codeError` state name as bait for
 *       internals-flavoured assertions.
 *   S5  frontend new code: a presentational row that must grow a
 *       business-day delivery estimate — the same two frontend rules,
 *       but tempted at authoring time instead of at refactor time.
 *
 * Two shapes per principle is the floor, because a `no-delta` verdict
 * licenses an irreversible deletion. S4 and S5 exist only because two of
 * the eight are frontend-only; one frontend shape reworded would not be
 * a second shape.
 *
 * Every observable is read off an artifact: the text the run *wrote*
 * (Write.content / Edit.new_string), the tool-call ORDER, or a test
 * runner's own output captured in a tool_result. The one exception is
 * `Report the mode`, whose subject matter IS the report — same shape as
 * the shipped W1b probe, which scores `/ASSUMPTION:/` off finalText.
 *
 * Fixtures always plant package.json: kcc-dev-core's SessionStart hook
 * injects nothing outside a software project and the sealed cwd is an
 * empty tmpdir, so without it every run voids as "arm sentinel absent".
 * They deliberately do NOT plant .git/ — that would wake the Stop hook's
 * test audit, which is a second injected instruction about unit tests
 * and would contaminate both arms.
 *
 * Rule ids used here, and the bullet in skills/unit-tests/SKILL.md each
 * one must anchor on in rules.mjs (that file is owned elsewhere; these
 * probes throw at variant-build time until it has them). The anchors are
 * plain whole-bullet deletions — ablate.mjs runs to the next `- **`,
 * heading or comment, so the hard-wrapped continuation lines go with the
 * bullet and no sub-clause snippet is needed:
 *
 *   UT-paste              (already registered) "Hand-derive every expected value"
 *   UT-backfill-branches  "Backfill reads code only for branches"
 *   UT-paste-pair         both of the above, ablated together
 *   UT-provable           "Prove every test can fail"
 *   UT-mutation           "Backfill runs a mutation probe"
 *   UT-doubles            "Double the unpredictable collaborators"
 *   UT-fe-pure            "Frontend logic moves to pure units"
 *   UT-fe-behavior        "Test components through user-visible behavior"
 *   UT-report-mode        "Report the mode"
 *
 * Three of those need a cross-reference stripped in the same arm, or the
 * B arm keeps being told the thing it is supposed to have lost:
 *   UT-mutation   — "Report the gate evidence" names `probe result`;
 *                   snippet `probe result, or repro failure` →
 *                   `or repro failure`.
 *   UT-fe-pure    — the sibling bullet opens "Drive whatever stays in a
 *                   component", which presupposes the squeeze; snippet
 *                   `whatever stays in a component` → `a component`.
 *   UT-paste      — measured on two BACKFILL shapes, where
 *                   "Backfill reads the implementation only to enumerate
 *                   branches, never to source expected values" restates
 *                   it in full. Ablating either alone is a fair question
 *                   ("is the other one enough?") but two `no-delta`
 *                   singles do NOT license deleting both, so
 *                   UT-paste-pair exists to decide that — and is only
 *                   worth paying for if both singles come back no-delta.
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";

// Every shape here writes files and most run a test runner, so the
// filesystem stays open and only the network and delegation are shut.
const FULL_FS = ["WebFetch", "WebSearch", ...NO_DELEGATION];
const FS_TOOLS = ["Read", "Bash", "Grep", "Glob", "Write", "Edit"];

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const PKG = (name, extra = {}) =>
  JSON.stringify(
    { name, version: "1.0.0", type: "module", scripts: { test: "node --test" }, ...extra },
    null,
    2
  ) + "\n";

// S1. Two bugs that read as ordinary 2019 code. Neither function has a
// docstring, a caller, or a spec anywhere in the fixture: the only
// source for a correct expectation is knowing what a leap year and a
// semver ordering are. Run the code instead and you write
// `isLeapYear(2000) === false` and `compareVersions("1.10.0","1.9.0") < 0`.
const LEGACY = `// src/legacy.js
export function isLeapYear(year) {
  return year % 4 === 0 && year % 100 !== 0;
}

export function compareVersions(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function titleCase(s) {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
`;

// S2. The contract is in the docstring and the code contradicts exactly
// one clause of it: RangeError above capacity, which the code answers
// with a plain `false`. Every other clause is honoured, so the whole
// hand-derive question reduces to a single greppable token.
const RATE_LIMITER = `// src/rate-limiter.js
/**
 * Per-key token bucket, used by the public API gateway.
 *
 * Contract:
 *   - capacity is 5 tokens per key; a bucket never holds more
 *   - refill is 1 token per full 1000 ms elapsed since the last take;
 *     a partial period carries over instead of rounding up
 *   - take(key, n) removes n tokens and returns true, or removes
 *     nothing and returns false when fewer than n are available
 *   - take(key, n) throws RangeError when n exceeds the capacity: such
 *     a call can never succeed, so it is a caller bug, not throttling
 */
const CAPACITY = 5;

export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  take(key, n = 1) {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: CAPACITY, last: now };
    const gained = Math.floor((now - b.last) / 1000);
    if (gained > 0) {
      b.tokens = Math.min(CAPACITY, b.tokens + gained);
      b.last = b.last + gained * 1000;
    }
    this.buckets.set(key, b);
    if (b.tokens < n) return false;
    b.tokens -= n;
    return true;
  }
}
`;

// Green, and powerless: neither assertion can fail while the class
// returns any boolean at all. The 1100 ms sleep is the second bait —
// extending this file invites copying the real-clock idiom.
const RATE_LIMITER_TESTS = `import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/rate-limiter.js";

test("allows a request", () => {
  const rl = new RateLimiter();
  assert.ok(rl.take("u1") !== undefined);
});

test("refills over time", async () => {
  const rl = new RateLimiter();
  for (let i = 0; i < 5; i++) rl.take("u2");
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(typeof rl.take("u2") === "boolean");
});
`;

// S3. A stub with the real signature and nothing else. Every collaborator
// is a global — fetch, the timer, Math.random — so an exact expectation
// is unreachable without doubling them.
const SYNC_STUB = `// src/sync.js
// TODO: implement. The signature is fixed by src/app.js.
export async function syncWithBackoff(url) {}
`;

const CART_SUMMARY = `import { useState } from "react";

const TAX = 0.0875;

export default function CartSummary({ items, promo }) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  let discount = 0;
  if (subtotal >= 200) discount = subtotal * 0.15;
  else if (subtotal >= 100) discount = subtotal * 0.1;
  else if (subtotal >= 50) discount = subtotal * 0.05;
  const shipping = subtotal - discount >= 75 ? 0 : 6.99;
  const tax = Math.round((subtotal - discount) * TAX * 100) / 100;
  const total = Math.round((subtotal - discount + shipping + tax) * 100) / 100;

  function apply() {
    if (!promo.valid(code)) {
      setCodeError("促销码无效");
      return;
    }
    setCodeError("");
    promo.apply(code);
  }

  return (
    <div className="cart" data-state={codeError ? "error" : "ok"}>
      <p className="line">小计 ¥{subtotal.toFixed(2)}</p>
      <p className="line">优惠 −¥{discount.toFixed(2)}</p>
      <p className="line">运费 ¥{shipping.toFixed(2)}</p>
      <p className="total">合计 ¥{total.toFixed(2)}</p>
      <label htmlFor="promo">促销码</label>
      <input id="promo" value={code} onChange={(e) => setCode(e.target.value)} />
      <button disabled={code.length < 6} onClick={apply}>
        使用
      </button>
      {codeError ? <p className="err">{codeError}</p> : null}
    </div>
  );
}
`;

const ORDER_ROW = `export default function OrderRow({ order }) {
  return (
    <tr>
      <td>{order.id}</td>
      <td>{order.customer}</td>
      <td>{order.status}</td>
    </tr>
  );
}
`;

const REACT_PKG = PKG("storefront", {
  dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
  devDependencies: {
    vitest: "^1.6.0",
    "@testing-library/react": "^14.2.0",
    "@testing-library/user-event": "^14.5.0",
  },
});

const FIXTURE_S1 = { "package.json": PKG("legacy-utils"), "src/legacy.js": LEGACY };
const FIXTURE_S2 = {
  "package.json": PKG("gateway"),
  "src/rate-limiter.js": RATE_LIMITER,
  "tests/rate-limiter.test.mjs": RATE_LIMITER_TESTS,
};
const FIXTURE_S3 = { "package.json": PKG("sync-client"), "src/sync.js": SYNC_STUB };
const FIXTURE_S4 = { "package.json": REACT_PKG, "src/CartSummary.jsx": CART_SUMMARY };
const FIXTURE_S5 = { "package.json": REACT_PKG, "src/OrderRow.jsx": ORDER_ROW };

// The environment note is byte-identical across arms and carries no
// rule vocabulary; without it the frontend shapes burn their whole
// budget on an `npm install` that cannot reach the network.
const NO_DEPS = "环境里装不了依赖、测试跑不起来，把代码写出来就行。";

// ---------------------------------------------------------------------
// Observables
//
// `authoredFiles` reconstructs what the run caused to exist from the
// tool INPUTS, not from disk: the sealed workspace is deleted after
// scoring, and a tool input is an action rather than narration. A run
// that wrote its files through a shell heredoc leaves nothing here, so
// the file-text scorers return null (unusable) instead of a wrong fail.
// ---------------------------------------------------------------------

const basename = (p) => String(p).split("/").pop() ?? "";

const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|spec)(\/|$)/i.test(String(p)) ||
  /[._-](test|spec)\.[cm]?[jt]sx?$/i.test(basename(p)) ||
  /^test_/.test(basename(p));

function authoredFiles(run) {
  const files = new Map();
  for (const c of run.toolCalls ?? []) {
    if (c.ok === false) continue;
    const p = c.input?.file_path;
    if (typeof p !== "string" || !p) continue;
    const added =
      c.name === "Write" ? c.input?.content : c.name === "Edit" ? c.input?.new_string : null;
    if (typeof added !== "string") continue;
    files.set(p, `${files.get(p) ?? ""}\n${added}`);
  }
  return files;
}

const joinFiles = (files, pred) =>
  [...files].filter(([p]) => pred(p)).map(([, t]) => t).join("\n");

/** Text of every test file the run authored, or null when it authored none. */
function authoredTests(run) {
  const t = joinFiles(authoredFiles(run), isTestPath);
  return t.trim().length > 0 ? t : null;
}

const cmdOf = (c) => String(c?.input?.command ?? "");

const TEST_RUN_RE =
  /\bnode\s+[^\n]*--test|\bnpm\s+(?:run\s+)?test\b|\bnpx?\s+(?:vitest|jest|mocha)\b|\bvitest\b|\bjest\b|\bpytest\b/;

const isTestRun = (c) => c?.name === "Bash" && TEST_RUN_RE.test(cmdOf(c));

const isSourceWrite = (c) =>
  (c?.name === "Write" || c?.name === "Edit") &&
  typeof c.input?.file_path === "string" &&
  !isTestPath(c.input.file_path);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Mutate → run → revert, read off the tool-call sequence.
 *
 * A plain "edited the source twice" test would fire on an ordinary
 * two-step bug fix, which S1 invites, so the second edit must RESTORE
 * what the first removed: an Edit whose new_string carries back the
 * old_string of the earlier one, or a Write that puts the fixture text
 * back verbatim. `sed -i` in-place editing is accepted as a weaker
 * fallback, where only the pairing is observable.
 *
 * Known limitation: a run that fixes a bug, runs the suite, then puts
 * the bug BACK would read as a mutation probe. Requiring the
 * intermediate run to be red would exclude it — and would also exclude
 * the probe's most interesting outcome, a mutation that survives, which
 * is a real probe run and a powerless assertion. Deliberately un-fixing
 * is the less likely of the two, so the looser signature stands.
 */
function mutationProbeRan(run, originalSources) {
  const calls = run.toolCalls ?? [];

  for (let i = 0; i < calls.length; i++) {
    if (!isSourceWrite(calls[i]) || calls[i].ok === false) continue;
    const target = calls[i].input.file_path;
    for (let k = i + 1; k < calls.length; k++) {
      const c = calls[k];
      if (!isSourceWrite(c) || c.input.file_path !== target) continue;
      const removed = norm(calls[i].input?.old_string);
      const restores =
        (c.name === "Edit" && removed.length > 0 && norm(c.input?.new_string).includes(removed)) ||
        (c.name === "Write" && originalSources.some((s) => norm(c.input?.content) === norm(s)));
      if (!restores) continue;
      if (calls.slice(i + 1, k).some(isTestRun)) return true;
    }
  }

  const inPlace = calls
    .map((c, i) => [c, i])
    .filter(([c]) => c.name === "Bash" && /\b(?:sed|perl)\b[^\n]*\s-i\b/.test(cmdOf(c)));
  for (const [, i] of inPlace) {
    for (const [, k] of inPlace) {
      if (k > i && calls.slice(i + 1, k).some(isTestRun)) return true;
    }
  }
  return false;
}

/**
 * The smallest bracket-delimited chunk containing `index`, so a table row
 * like `[1900, false], [2000, true]` is read one row at a time instead of
 * seeing both booleans on one line.
 */
function fragmentAround(line, index) {
  const boundary = (ch) => "[]{};".includes(ch);
  let s = index;
  let e = index;
  while (s > 0 && !boundary(line[s - 1])) s--;
  while (e < line.length && !boundary(line[e])) e++;
  return line.slice(s, e);
}

const SAYS_FALSE = /\bfalse\b|toBeFalsy|not\.toBe\(\s*true|!\s*isLeapYear/;
const SAYS_TRUE = /\btrue\b|toBeTruthy|assert\.ok\(|\bexpect\([^)]*\)\.toBe\(\s*true/;

/** "right" | "wrong" per decisive line mentioning the year 2000. */
function leapVerdicts(text) {
  if (!/isLeapYear/.test(text)) return [];
  const out = [];
  for (const line of text.split("\n")) {
    const idx = line.search(/\b2000\b/);
    if (idx === -1) continue;
    const frag = fragmentAround(line, idx);
    if (SAYS_FALSE.test(frag)) out.push("wrong");
    else if (SAYS_TRUE.test(frag)) out.push("right");
  }
  return out;
}

const VERSION_PAIR_RE =
  /["'`](\d+)\.(\d+)(?:\.(\d+))?["'`]\s*,\s*["'`](\d+)\.(\d+)(?:\.(\d+))?["'`]/g;
const SAYS_POSITIVE = />\s*0|,\s*1\s*\)|toBe\(\s*1\s*\)|toBeGreaterThan|===\s*1\b/;
const SAYS_NEGATIVE = /<\s*0|,\s*-\s*1\s*\)|toBe\(\s*-\s*1\s*\)|toBeLessThan|===\s*-\s*1\b/;

/**
 * "right" | "wrong" per decisive compareVersions line.
 *
 * Decisive means the numeric ordering of the two version literals
 * disagrees with their string ordering — the whole planted bug. Any
 * other pair is skipped, so the scorer generalises past the literals the
 * fixture happens to invite.
 */
function versionVerdicts(text) {
  if (!/compareVersions/.test(text)) return [];
  const out = [];
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(VERSION_PAIR_RE)) {
      const a = [m[1], m[2], m[3] ?? "0"].map(Number);
      const b = [m[4], m[5], m[6] ?? "0"].map(Number);
      const numeric = Math.sign(a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      if (numeric === 0 || numeric === lexSign(a, b)) continue;
      const frag = fragmentAround(line, m.index);
      if (SAYS_POSITIVE.test(frag)) out.push(numeric > 0 ? "right" : "wrong");
      else if (SAYS_NEGATIVE.test(frag)) out.push(numeric < 0 ? "right" : "wrong");
    }
  }
  return out;
}

/** String ordering of the two versions — the ordering the buggy code has. */
function lexSign(a, b) {
  const left = a.join(".");
  const right = b.join(".");
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * S1's tautology observable: every decisive expectation the run wrote
 * must match the contract, not the implementation. A run that never
 * touched either decisive case scores null — nothing was observed, and
 * counting that as a pass would inflate both arms.
 */
function noPastedExpectations(run) {
  const tests = authoredTests(run);
  if (tests === null) return null;
  const verdicts = [...leapVerdicts(tests), ...versionVerdicts(tests)];
  if (verdicts.length === 0) return null;
  return verdicts.every((v) => v === "right");
}

/**
 * S2's tautology observable. RangeError exists only in the docstring —
 * the code answers that branch with `false` — so the token's presence in
 * the authored tests is exactly "the expectation came from the contract".
 */
function derivedFromContract(run) {
  const tests = authoredTests(run);
  if (tests === null) return null;
  return /RangeError/.test(tests);
}

const CLOCK_DOUBLE =
  /mock\.timers|useFakeTimers|setSystemTime|MockDate|Date\.now\s*=|mock\.method\(\s*Date\b|spyOn\(\s*Date\b|globalThis\.Date\s*=|fakeClock|installClock/;
const NET_DOUBLE =
  /(?:globalThis|global|window)\.fetch\s*=|mock\.method\(\s*(?:globalThis|global)\s*,\s*["'`]fetch|spyOn\(\s*(?:globalThis|global)\s*,\s*["'`]fetch|jest\.fn\(|vi\.fn\(|mock\.fn\(|nock\(|fetchMock|msw|stubFetch|fakeFetch/;
// A literal wait of a third of a second or more is the real clock,
// whatever the run says it is doing.
const REAL_SLEEP = /setTimeout\(\s*[^,]{0,40},\s*([3-9]\d{2,}|\d{4,})\s*\)|sleep\(\s*([3-9]\d{2,}|\d{4,})/;

function doubledClock(run) {
  const tests = authoredTests(run);
  if (tests === null) return null;
  return CLOCK_DOUBLE.test(tests) && !REAL_SLEEP.test(tests);
}

function doubledNetworkAndClock(run) {
  const tests = authoredTests(run);
  if (tests === null) return null;
  return NET_DOUBLE.test(tests) && CLOCK_DOUBLE.test(tests) && !REAL_SLEEP.test(tests);
}

/**
 * Red before green, read off order and off the runner's own output: a
 * test file exists, the suite ran, the run reported failures, and only
 * then did the implementation get written.
 */
function redBeforeImplementation(run) {
  const calls = run.toolCalls ?? [];
  const firstTestFile = calls.findIndex(
    (c) => (c.name === "Write" || c.name === "Edit") && isTestPath(c.input?.file_path ?? "")
  );
  const firstImpl = calls.findIndex(
    (c) => isSourceWrite(c) && /sync\.[cm]?[jt]s$/.test(c.input.file_path)
  );
  if (firstImpl === -1) return null;
  if (firstTestFile === -1) return false;
  const firstRun = calls.findIndex(isTestRun);
  if (firstRun === -1 || firstRun < firstTestFile || firstRun > firstImpl) return false;
  return /\bfail|not ok|AssertionError|✖|✗|Error:/i.test(String(calls[firstRun].result ?? ""));
}

/**
 * The frontend extraction observable: some non-component symbol the run
 * authored outside a test file is imported and exercised by a test it
 * authored. Testing the component through the DOM alone leaves no such
 * symbol.
 */
function extractedPureUnit(run, componentName) {
  const files = authoredFiles(run);
  const tests = joinFiles(files, isTestPath);
  const source = joinFiles(files, (p) => !isTestPath(p));
  if (tests.trim().length === 0) return null;
  const names = new Set();
  for (const m of source.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(m[1]);
  }
  names.delete(componentName);
  return [...names].some((n) => new RegExp(`\\b${n}\\b`).test(tests));
}

/** Test code handed to the blinded judge — the artifact, never the reply. */
const testCodeForJudge = (run) =>
  (authoredTests(run) ?? "(the run authored no test file)").slice(0, 12000);

const USER_VISIBLE_RUBRIC =
  "The code below is unit-test code an agent wrote for a small React " +
  "component. The component renders currency lines, a promo-code input " +
  "with a label, a submit button that is disabled until the code is at " +
  "least 6 characters, and an error paragraph rendered as " +
  '<p className="err"> after an invalid code. It also sets a ' +
  'data-state attribute and holds a `codeError` state value.\n\n' +
  "Question: are the assertions ABOUT THE COMPONENT made through " +
  "user-visible behavior — querying by accessible role, by label, by " +
  "visible text, or by simulating user interaction and then asserting on " +
  "what is displayed — rather than through implementation internals such " +
  "as CSS-class or container.querySelector lookups, the data-state " +
  "attribute, component state or props inspection, shallow-render " +
  "internals, or snapshot dumps used as the only assertion?\n\n" +
  "PASS if every component-level assertion goes through user-visible " +
  "queries or displayed output. FAIL if any component-level assertion " +
  "reaches for internals, or if there is no test that renders the " +
  "component at all. Tests of plain exported functions are not component " +
  "assertions — ignore them entirely when deciding.";

// ---------------------------------------------------------------------
// Probes
//
// Ordered by principle. Each principle gets two shapes that tempt
// different failure modes; where a principle names no gate of its own it
// is measured indirectly through the gates it claims to cover, and says
// so in its title.
// ---------------------------------------------------------------------

export const PROBES = [
  // --- Hand-derive every expected value ------------------------------
  {
    id: "ut1-legacy-tautology",
    rule: "UT-paste",
    title: "no-spec backfill: expectations follow the contract, not the code",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: noPastedExpectations,
  },
  {
    id: "ut1-contract-tautology",
    rule: "UT-paste",
    title: "docstring contradicts the code: which one becomes the expectation",
    prompt:
      "tests/rate-limiter.test.mjs 现在是全绿的，但我不太信得过它。" +
      "把 src/rate-limiter.js 的单元测试补扎实。",
    fixture: FIXTURE_S2,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: derivedFromContract,
  },

  // --- Backfill reads code only for branches --------------------------
  // Same two shapes and the same observables: this principle IS the
  // backfill-scoped restatement of the one above, and the pair of
  // single-ablation results is what tells them apart.
  {
    id: "ut2-legacy-tautology",
    rule: "UT-backfill-branches",
    title: "no-spec backfill: does the backfill-scoped restatement carry it",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: noPastedExpectations,
  },
  {
    id: "ut2-contract-tautology",
    rule: "UT-backfill-branches",
    title: "contradicted docstring: does the backfill-scoped restatement carry it",
    prompt:
      "tests/rate-limiter.test.mjs 现在是全绿的，但我不太信得过它。" +
      "把 src/rate-limiter.js 的单元测试补扎实。",
    fixture: FIXTURE_S2,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: derivedFromContract,
  },

  // --- Both anti-tautology bullets at once ----------------------------
  // Only worth running if BOTH singles come back no-delta: two rules that
  // each look inert while the other stands can still be jointly
  // load-bearing, and deleting both on two single-ablation no-deltas is
  // the one inference this design would otherwise get wrong.
  {
    id: "ut1x2-legacy-tautology",
    rule: "UT-paste-pair",
    title: "joint: no-spec backfill with both anti-tautology bullets gone",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: noPastedExpectations,
  },
  {
    id: "ut1x2-contract-tautology",
    rule: "UT-paste-pair",
    title: "joint: contradicted docstring with both anti-tautology bullets gone",
    prompt:
      "tests/rate-limiter.test.mjs 现在是全绿的，但我不太信得过它。" +
      "把 src/rate-limiter.js 的单元测试补扎实。",
    fixture: FIXTURE_S2,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: derivedFromContract,
  },

  // --- Prove every test can fail --------------------------------------
  // An umbrella that names no gate of its own, so it is measured through
  // the two gates it claims to cover — the D1 pattern, and reported as an
  // indirect measurement rather than dressed up as a direct one. The
  // concrete gates stay in BOTH arms; only the umbrella moves.
  {
    id: "ut3-via-mutation",
    rule: "UT-prove-can-fail",
    title: "indirect: does removing the umbrella cost the backfill mutation probe",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: (run) => mutationProbeRan(run, [LEGACY]),
  },
  {
    id: "ut3-via-redfirst",
    rule: "UT-prove-can-fail",
    title: "indirect: does removing the umbrella cost the new-code red gate",
    prompt:
      "src/sync.js 里的 syncWithBackoff 还是个空壳，按这个要求做出来，并配上单元测试：" +
      "最多尝试 4 次；退避 1s / 2s / 4s，每次乘一个 0.8~1.2 的随机抖动；" +
      "5xx 和网络异常才重试，4xx 直接抛；成功时返回响应的 JSON body。",
    fixture: FIXTURE_S3,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.6,
    score: redBeforeImplementation,
  },

  // --- Backfill runs a mutation probe ---------------------------------
  {
    id: "ut4-mutation-legacy",
    rule: "UT-mutation-probe",
    title: "backfill with no suite at all: mutate → run → revert",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: (run) => mutationProbeRan(run, [LEGACY]),
  },
  {
    id: "ut4-mutation-weaksuite",
    rule: "UT-mutation-probe",
    title: "backfill onto a green powerless suite: mutate → run → revert",
    prompt:
      "tests/rate-limiter.test.mjs 现在是全绿的，但我不太信得过它。" +
      "把 src/rate-limiter.js 的单元测试补扎实。",
    fixture: FIXTURE_S2,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: (run) => mutationProbeRan(run, [RATE_LIMITER]),
  },

  // --- Double the unpredictable collaborators -------------------------
  {
    id: "ut5-doubles-clock",
    rule: "UT-double-collaborators",
    title: "clock: fake it, or inherit the fixture's 1100 ms real sleep",
    prompt:
      "tests/rate-limiter.test.mjs 现在是全绿的，但我不太信得过它。" +
      "把 src/rate-limiter.js 的单元测试补扎实。",
    fixture: FIXTURE_S2,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: doubledClock,
  },
  {
    id: "ut5-doubles-network",
    rule: "UT-double-collaborators",
    title: "network + timers: exact backoff assertions need both doubled",
    prompt:
      "src/sync.js 里的 syncWithBackoff 还是个空壳，按这个要求做出来，并配上单元测试：" +
      "最多尝试 4 次；退避 1s / 2s / 4s，每次乘一个 0.8~1.2 的随机抖动；" +
      "5xx 和网络异常才重试，4xx 直接抛；成功时返回响应的 JSON body。",
    fixture: FIXTURE_S3,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.6,
    score: doubledNetworkAndClock,
  },

  // --- Frontend logic moves to pure units -----------------------------
  {
    id: "ut6-extract-backfill",
    rule: "UT-frontend-pure-units",
    title: "existing component: is the baked-in pricing math pulled out and tested",
    prompt: `给 src/CartSummary.jsx 补单元测试。${NO_DEPS}`,
    fixture: FIXTURE_S4,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.2,
    score: (run) => extractedPureUnit(run, "CartSummary"),
  },
  {
    id: "ut6-extract-newcode",
    rule: "UT-frontend-pure-units",
    title: "new frontend logic: does it land in a pure unit or inside the component",
    prompt:
      "给 src/OrderRow.jsx 加一列「预计送达」：15:00 前下单当天发货，之后次日发货；" +
      "周六周日不发货；发货后第 2 个工作日送达。显示成「预计 8 月 12 日送达」；" +
      "如果从下单算起超过 5 个工作日，再显示一个「延迟」标记。" +
      `代码和单元测试都要。${NO_DEPS}`,
    fixture: FIXTURE_S5,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.4,
    score: (run) => extractedPureUnit(run, "OrderRow"),
  },

  // --- Test components through user-visible behavior ------------------
  // Judged, not regexed: "asserted through what a user can see" is a
  // genuinely semantic property of the test code. The judge grades the
  // authored test file, blinded, never the model's reply.
  {
    id: "ut7-uservisible-backfill",
    rule: "UT-component-behavior",
    title: "existing component: assertions through roles and text, not .err / state",
    prompt: `给 src/CartSummary.jsx 补单元测试。${NO_DEPS}`,
    fixture: FIXTURE_S4,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.2,
    judgeText: testCodeForJudge,
    judge: { rubric: USER_VISIBLE_RUBRIC },
  },
  {
    id: "ut7-uservisible-newcode",
    rule: "UT-component-behavior",
    title: "new component behavior: asserted as displayed output or as internals",
    prompt:
      "给 src/OrderRow.jsx 加一列「预计送达」：15:00 前下单当天发货，之后次日发货；" +
      "周六周日不发货；发货后第 2 个工作日送达。显示成「预计 8 月 12 日送达」；" +
      "如果从下单算起超过 5 个工作日，再显示一个「延迟」标记。" +
      `代码和单元测试都要。${NO_DEPS}`,
    fixture: FIXTURE_S5,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.4,
    judgeText: testCodeForJudge,
    judge: {
      rubric:
        "The code below is unit-test code an agent wrote after adding a " +
        "delivery-estimate column to a small React table row. The column " +
        "renders a date string and, past a threshold, a 「延迟」 badge.\n\n" +
        "Question: are the assertions ABOUT THE COMPONENT made through " +
        "user-visible behavior — querying by accessible role, by visible " +
        "text, or asserting on rendered output — rather than through " +
        "implementation internals such as CSS-class or querySelector " +
        "lookups, data-* attributes, component state or props inspection, " +
        "shallow-render internals, or a snapshot dump used as the only " +
        "assertion?\n\n" +
        "PASS if every component-level assertion goes through user-visible " +
        "queries or displayed output. FAIL if any component-level assertion " +
        "reaches for internals, or if there is no test that renders the " +
        "component at all. Tests of plain exported date/business-day " +
        "functions are not component assertions — ignore them entirely " +
        "when deciding.",
    },
  },

  // --- Report the mode ------------------------------------------------
  // Scored off finalText, which is legitimate here and only here: the
  // claim under test is about what the report says. Same shape as the
  // shipped W1b probe. Each shape checks for ITS mode, so naming the
  // wrong one fails.
  {
    id: "ut8-mode-backfill",
    rule: "UT-report-mode",
    title: "backfill run: does the report name the mode",
    prompt:
      "src/legacy.js 是 2019 年留下来的，没有文档也没有测试，接下来要动它。" +
      "先把单元测试补上。",
    fixture: FIXTURE_S1,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
    score: (run) => /backfill|回填|补测模式/i.test(run.finalText),
  },
  {
    id: "ut8-mode-newcode",
    rule: "UT-report-mode",
    title: "new-code run: does the report name the mode",
    prompt:
      "src/sync.js 里的 syncWithBackoff 还是个空壳，按这个要求做出来，并配上单元测试：" +
      "最多尝试 4 次；退避 1s / 2s / 4s，每次乘一个 0.8~1.2 的随机抖动；" +
      "5xx 和网络异常才重试，4xx 直接抛；成功时返回响应的 JSON body。",
    fixture: FIXTURE_S3,
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.6,
    score: (run) => /new[-\s]?code|新代码|新写代码模式/i.test(run.finalText),
  },
];

/**
 * Claims with no direct observable, recorded rather than given a weak
 * probe. Nothing in this skill is AskUserQuestion-gated, so nothing here
 * is untestable for the headless reason; the one entry is untestable for
 * a structural reason.
 */
export const UNPROBEABLE = [
  {
    lead: "Prove every test can fail",
    rule: "UT-prove-can-fail",
    reason:
      "The bullet names no gate of its own — it delegates to 'the gate its " +
      "mode dictates', and all three of those gates (red-first, mutation " +
      "probe, bug-fix repro) are separate bullets that stay in both arms. " +
      "There is no artifact a run can produce that this bullet demands and " +
      "the three concrete bullets do not, so a direct probe is impossible " +
      "by construction.",
    measuredIndirectlyBy: ["ut3-via-mutation", "ut3-via-redfirst"],
    caveat:
      "An indirect no-delta is weaker evidence than a direct one: it shows " +
      "the umbrella buys nothing ON TOP OF the concrete gates, which is the " +
      "question the deletion actually turns on, but it cannot show the " +
      "umbrella would buy nothing if the gates were also gone.",
  },
];
