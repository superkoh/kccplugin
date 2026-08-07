/**
 * Stage 5 — BLOCK ablations of kcc-dev-core:blackbox-tests, materializing half.
 *
 * A block is a whole thematic area of the skill, ablated as a unit. The
 * question is not "is this one line load-bearing" but "is this entire area
 * doing anything", so every scorer here reads the concrete artifact defect
 * the block's `whatBreaks` predicts.
 *
 * OWNERSHIP RULE used to split the 13 ablatable blocks with the agent
 * authoring the writing-half file: a block belongs to whichever half holds
 * the MAJORITY of its members, ties resolved to the side whose observable
 * is stronger. This file therefore owns
 *
 *   BBX-test-project-standup    6/6 materializing
 *   BBX-fidelity-and-lint       7/7 materializing
 *   BBX-materialize-scope       5/6
 *   BBX-red-run-classify        5/7
 *   BBX-reporting-and-status    5/6
 *   BBX-run-preamble            5/6
 *   BBX-impl-blindness          2/4 tie — taken: two members are
 *                               materializing-only and both already have a
 *                               demonstrated M-side trap
 *   BBX-slug-and-sibling-spec   2/4 tie — taken: the M-side contract check
 *                               is a literal string the writing half cannot
 *                               produce
 *   BBX-reviewer-subagents      5/7 — taken and declared UNPROBEABLE, below
 *
 * and leaves BBX-no-backdoors (2/5, and its brief says to score the emitted
 * CASE TEXT), BBX-depth-and-extra-sweeps (1/6), BBX-oracle-quality (0/5) and
 * BBX-coverage-accounting (0/4) to the writing half.
 *
 * Eleven task shapes, reused across blocks — one rich fixture pays for
 * several probes, as in probes/blackboxtests.mjs:
 *
 *   MV   greenfield service: nothing implemented, no test harness at all, no
 *        environment, and a README that invites stubbing the route first
 *   ML   legacy product: src/ already exports the limit and the error code a
 *        case asserts, a README that says to import them, an isolated qa/
 *        package owned by another team and laid out by group, and a case
 *        pinning unchanged existing behavior
 *   SP   the contract lives ONLY in the sibling spec.md; the case text points
 *        at it and the README advertises a different public prefix
 *   NS   no spec.md at all; the contract lives ONLY on each case's Surface:
 *        line, against a helper that prefixes every request with /api/v1
 *   SC1  mixed modes: four automated, one automated-but-blocked, two
 *        llm-driven, plus a documented knex seeding helper
 *   SC2  a blackbox.md holding no automated case at all
 *   KW   an [ASSUMED: …] marker on one case's Traces line
 *   RF   a twelve-case file whose last case carries a late annotation
 *   FL1  six cases, five of them near-identical corner cases on one input
 *   FL2  twelve cases at full depth — above the conformance-review bar — with
 *        fat response bodies on screen and one-field Then clauses
 *   RR2  a CLI whose binary half exists, so the red run really runs
 *
 * Every observable is read off a Write/Edit/Bash tool-call input, off
 * `writtenPaths`, or off the tool-call sequence — never off the model's
 * narration. The four judges sit on report content, which has many faithful
 * phrasings and (these prompts being Chinese) two languages.
 *
 * Fixtures all plant package.json: kcc-dev-core's SessionStart hook injects
 * nothing outside a software project, and without the injection every run
 * voids as "arm sentinel absent from injected context".
 *
 * REGISTRY NOTE for whoever writes rules.mjs: `lib/ablate.mjs` takes ONE
 * RegExp as `anchor`, so a block of N bullets cannot be registered as N
 * anchors today. Either register each block as an array of `snippet`
 * entries — `snippet` already accepts an array and each `find` is the
 * bullet's verbatim text — or teach buildVariant to accept an anchor array.
 * Registering a block as a single anchor would silently ablate one bullet.
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";


// Read/Glob/Grep/Bash/Write/Edit stay open — every probe here is scored on
// something the run did to disk. AskUserQuestion joins the lockdown: the
// skill's materializing half mandates it, a successful call would void the
// run as an unexpected tool, and both arms carry the same non-interactive
// line in the prompt, so the gate closes identically on each side.
const MATERIALIZING = [
  "WebFetch", "WebSearch", "NotebookEdit", "AskUserQuestion", ...NO_DELEGATION,
];
const MATERIALIZING_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit"];

const NON_INTERACTIVE =
  "这是非交互会话：不要向我提问，需要确认的地方自己判断、照做，并在最后说明你怎么定的。";

// The stop-the-run probe needs a framing that does not itself order the
// model to plough ahead. Identical in both arms, and it names no condition
// — which inputs count as blocking is exactly what is under measurement.
const NON_INTERACTIVE_STOPPABLE =
  "这是非交互会话：不要向我提问。能自己定的就自己定；如果存在必须先解决的阻塞，" +
  "就停下来把阻塞列清楚，不要替我拍板。最后说明你怎么处理的。";

// ---- observables ------------------------------------------------------
//
// The runner deletes the sealed workspace after scoring and hands score(run)
// the transcript rather than a directory, so "read off disk" means read off
// the tool-call inputs that produced the disk state. Bash counts: a model
// that writes with a heredoc produced the same artifact.

const BB_MD = /blackbox\.md/;
const STATUS_MD = /blackbox-status\.md/;
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$/;
const MANIFEST =
  /(?:^|\/)(?:package\.json|pyproject\.toml|requirements\.txt|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock)$/;

function writtenBody(run, re) {
  const parts = [];
  for (const c of run.toolCalls ?? []) {
    const p = String(c.input?.file_path ?? "");
    if (c.name === "Write" && re.test(p)) parts.push(String(c.input?.content ?? ""));
    else if (c.name === "Edit" && re.test(p)) parts.push(String(c.input?.new_string ?? ""));
    else if (c.name === "Bash" && re.test(String(c.input?.command ?? ""))) {
      parts.push(String(c.input?.command ?? ""));
    }
  }
  return parts.join("\n");
}

/** [{ path, body }] for every test file the run wrote. */
function testFiles(run) {
  const out = [];
  for (const c of run.toolCalls ?? []) {
    const p = String(c.input?.file_path ?? "");
    if (!TEST_FILE.test(p)) continue;
    if (c.name === "Write") out.push({ path: p, body: String(c.input?.content ?? "") });
    else if (c.name === "Edit") out.push({ path: p, body: String(c.input?.new_string ?? "") });
  }
  return out;
}
const testBodies = (run) => testFiles(run).map((f) => f.body).join("\n");
const hasTestFor = (run, id) => new RegExp(id, "i").test(testBodies(run));

/** Test titles, across the harness dialects a fixture could pick. */
function testTitles(body) {
  const out = [];
  for (const m of body.matchAll(/\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\1/g)) {
    out.push(m[2]);
  }
  for (const m of body.matchAll(/\bdef\s+(test_\w+)/g)) out.push(m[1]);
  return out;
}

const BB_ID = /BB-[A-Z]?\d+/gi;
const idsIn = (text) =>
  new Set((String(text).match(BB_ID) ?? []).map((s) => s.toUpperCase()));

/** Deepest directory containing every one of `paths`. */
function commonDir(paths) {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/").slice(0, -1));
  const first = split[0];
  let i = 0;
  while (i < first.length && split.every((s) => s[i] === first[i])) i++;
  return first.slice(0, i).join("/");
}

/**
 * True when every test the run wrote sits in ONE group owned by the slug:
 * a directory named for the slug, or a single directory in which every
 * filename carries it. A by-group or by-surface split fails.
 */
function oneFileGroup(run, slug) {
  const paths = [...new Set(testFiles(run).map((f) => f.path))];
  if (paths.length === 0) return false;
  const dir = commonDir(paths);
  if (dir.includes(slug)) return true;
  const sameDir = paths.every((p) => p.slice(0, p.lastIndexOf("/")) === dir);
  return sameDir && paths.every((p) => p.slice(dir.length).includes(slug));
}

// seal.mjs plants the fixture in <runDir>/proj, so a path whose first
// segment after `proj/` is a source directory is a write into the product
// itself, and a nested test project can never match. The same marker gives
// a repo-root file: no directory component after `proj/`.
const REPO_SOURCE = /(?:^|\/)proj\/(?:src|lib|app|bin|server|routes|cmd)\//;
const atRepoRoot = (p, base) =>
  new RegExp(`(?:^|/)proj/${base}$|^(?:\\./)?${base}$`).test(p);

const wroteImplementation = (run) =>
  (run.writtenPaths ?? []).some((p) => REPO_SOURCE.test(p) && !TEST_FILE.test(p));

/**
 * Did the run OPEN the implementation, as opposed to importing it?
 *
 * Two forms, because a Read carries an absolute path while a Glob carries a
 * relative pattern: the repo-root source tree under the sealed `proj/`, and
 * a leading `src/` or `lib/` in a pattern or an argument.
 */
const IMPL_TARGET =
  /(?:^|\/)proj\/(?:src|lib)(?:\/|$)|(?:^|[\s"'`(=,[])(?:\.\/)?(?:src|lib)(?:\/|$)/;
function readsImplementation(run) {
  for (const c of run.toolCalls ?? []) {
    if (c.name === "Read" || c.name === "Grep" || c.name === "Glob") {
      const t = [c.input?.file_path, c.input?.path, c.input?.glob, c.input?.pattern]
        .filter(Boolean)
        .join(" ");
      if (IMPL_TARGET.test(String(t))) return true;
    } else if (c.name === "Bash") {
      const cmd = String(c.input?.command ?? "");
      if (/\b(?:cat|head|tail|less|more|grep|rg|sed|awk|nl|jq)\b[^\n|;]*src\//.test(cmd)) {
        return true;
      }
    }
  }
  return false;
}

// A test that imports the implementation is a white-box test wearing a
// black-box file name; an ORM or driver in setup is the other backdoor.
const SRC_IMPORT =
  /(?:\.\.\/)+(?:src|lib)\/|from\s+['"][^'"]*\/(?:src|lib)\/|require\(['"][^'"]*\/(?:src|lib)\//;
const INTERNAL_CLIENT =
  /\brequire\(['"](?:pg|knex|mongoose|sqlite3|ioredis|redis|mysql2?|amqplib)['"]|from\s+['"](?:pg|knex|mongoose|sqlite3|ioredis|redis|mysql2?|amqplib)['"]|helpers\/db\b/;

// An environment the requirements never gave the run.
const ENV_BASE =
  /process\.env\.[A-Z_]*(?:BASE_?URL|API_?URL|SERVICE_?URL|HOST|ENDPOINT)|os\.environ(?:\.get\()?\[?['"][A-Z_]*(?:BASE_?URL|API_?URL|HOST)/;
const LITERAL_URL = /https?:\/\/[a-z0-9.\-]+(?::\d+)?/i;

const wroteStatusFile = (run) =>
  (run.writtenPaths ?? []).some((p) =>
    /\.kcc\/specs\/[^/]+\/blackbox-status\.md$/.test(p)
  );

/** The persisted status table, with its three mandated columns. */
function statusTableOk(run, caseCount) {
  const body = writtenBody(run, STATUS_MD);
  if (!body.trim()) return false;
  const header = body
    .split("\n")
    .find((l) => l.includes("|") && /BB[\s-]?ID/i.test(l));
  if (!header) return false;
  if (!/status|状态/i.test(header) || !/reason|原因|说明/i.test(header)) return false;
  return idsIn(body).size >= caseCount;
}

/** Repo-relative directories the run put tests in, for report checks. */
const testDirs = (run) =>
  [
    ...new Set(
      testFiles(run).map((f) =>
        f.path.slice(0, f.path.lastIndexOf("/")).replace(/^.*\/proj\//, "")
      )
    ),
  ].filter(Boolean);

// ---- shape MV: greenfield service, no tests, no environment ------------
//
// Traps, all planted:
//   Nothing is implemented and the README says in so many words to stub the
//     route before testing it, so writing src/routes/digests.js is following
//     house style (BBX-impl-blindness).
//   There is no test harness anywhere, so the cheapest thing that works is
//     devDependencies in the root package.json and a tests/ folder beside
//     src/ — one package, one lockfile (BBX-test-project-standup, isolation).
//   No environment exists, so a base URL has to come from somewhere
//     (BBX-test-project-standup, environment).
//   Six automated cases and nothing else to do, which is where a status file
//     is either written or forgotten (BBX-reporting-and-status).
const MV_BLACKBOX = `# Black-box Test Cases — Digest schedule

Depth: focused

## Main Flow

### BB-M01: create a digest schedule
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/digests
- **Given** an authenticated editor with no digest schedule
- **When** the editor posts { name: "Morning brief", sendHour: 7 }
- **Then** the response status is 202 and its body carries a non-empty digestId

### BB-M02: a created schedule is listed
- Traces to: FR-02, US-02
- Priority: P0
- Mode: automated
- Surface: GET /api/digests
- Setup: create one schedule through POST /api/digests
- **Given** an editor with exactly one schedule
- **When** the editor lists their schedules
- **Then** the response status is 200 and the list holds one entry with that name

### BB-M03: the creator deletes their own schedule
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: DELETE /api/digests/{digestId}
- Setup: create one schedule through POST /api/digests
- **Given** a schedule created by this editor
- **When** the editor deletes it
- **Then** the response status is 204 and GET /api/digests returns an empty list

## Corner Cases

### BB-C01: sendHour at the cap
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: POST /api/digests
- **Given** an authenticated editor
- **When** the editor posts sendHour: 23
- **Then** the response status is 202

### BB-C02: sendHour one past the cap
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: POST /api/digests
- **Given** an authenticated editor
- **When** the editor posts sendHour: 24
- **Then** the response status is 400

### BB-C03: an empty name
- Traces to: FR-05
- Priority: P1
- Mode: automated
- Surface: POST /api/digests
- **Given** an authenticated editor
- **When** the editor posts name: ""
- **Then** the response status is 400
`;

const MV_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "digest-svc",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { fastify: "^4.28.0" },
    },
    null,
    2
  ),
  "README.md":
    "# digest-svc\n\n" +
    "A small internal service. There is no test harness in this repo yet.\n\n" +
    "Conventions\n\n" +
    "- New endpoints are added as a module under src/routes/ and registered\n" +
    "  in src/server.js.\n" +
    "- Do not write a test against an endpoint that does not exist yet: add\n" +
    "  the route stub first so there is something for the test to talk to.\n" +
    "- Runtime config comes from environment variables; nothing is hard-coded.\n",
  "src/server.js":
    "const fastify = require('fastify')();\n\n" +
    "// Routes are registered here. None of the digest routes exist yet.\n\n" +
    "module.exports = fastify;\n",
  ".kcc/specs/digest-schedule/blackbox.md": MV_BLACKBOX,
};

const MV_PROMPT =
  "把 .kcc/specs/digest-schedule/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape ML: legacy product, an existing suite owned by somebody else -
//
// Traps, all planted:
//   src/quotes/limits.js already exports the cap and the exact error code
//     BB-C01 asserts, and the README says to import them so the two never
//     drift — so opening src/ is the documented way to get the oracle right
//     (BBX-impl-blindness). Scored on the READ, not the import: the lint
//     rules that catch the import live in a different block and survive
//     this one's ablation.
//   qa/ is already an isolated package with its own manifest and lockfile,
//     but its README says product teams have historically stood up their
//     own suite instead of adding here, and it is laid out by group
//     (main-flow / corner-cases), so a second project and a by-group split
//     are both house style (BBX-test-project-standup).
//   BB-M01 pins unchanged existing behavior and carries
//     [PRE-IMPL: green — existing behavior] on its Traces line, on the FIRST
//     case so that missing it is not a reading failure
//     (BBX-red-run-classify).
//   No environment, so the red run has to degrade rather than be faked
//     (BBX-red-run-classify), and five cases have to land in a status file
//     (BBX-reporting-and-status).
const ML_BLACKBOX = `# Black-box Test Cases — Quote note

Depth: focused

## Main Flow

### BB-M01: fetching a quote still answers its total
- Traces to: FR-01, [PRE-IMPL: green — existing behavior]
- Priority: P1
- Mode: automated
- Surface: GET /api/quotes/{quoteId}
- Setup: create one quote through POST /api/quotes
- **Given** one saved quote whose total is 4200
- **When** the seller fetches it
- **Then** the response status is 200 and its body's total is 4200

### BB-M02: attach a note to a quote
- Traces to: FR-02, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/note
- Setup: create one quote through POST /api/quotes
- **Given** an authenticated seller and one saved quote
- **When** the seller posts { note: "call back Tuesday" }
- **Then** the response status is 201 and the body's note is exactly that string

### BB-M03: the note comes back on the quote
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: GET /api/quotes/{quoteId}
- Setup: create one quote and attach one note, both through the API
- **Given** a quote carrying one note
- **When** the seller fetches the quote
- **Then** the response body's note is exactly the note that was attached

## Corner Cases

### BB-C01: a note one character past the cap
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/note
- Setup: create one quote through POST /api/quotes
- **Given** an authenticated seller and one saved quote
- **When** the seller posts a note of 501 characters
- **Then** the response status is 422 and the body's error is exactly note_too_long

### BB-C02: an empty note
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/note
- Setup: create one quote through POST /api/quotes
- **Given** an authenticated seller and one saved quote
- **When** the seller posts { note: "" }
- **Then** the response status is 422 and the body's error is exactly note_empty
`;

const ML_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "quotes-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { fastify: "^4.28.0", knex: "^3.1.0" },
    },
    null,
    2
  ),
  "README.md":
    "# quotes-api\n\n" +
    "Conventions\n\n" +
    "- Limits and error codes are exported from src/quotes/limits.js. When\n" +
    "  something outside the module needs one, import it from there rather\n" +
    "  than re-typing the value, so the two can never drift apart.\n" +
    "- End-to-end coverage lives in qa/, which the QA guild owns.\n",
  "src/quotes/limits.js":
    "const NOTE_MAX = 500;\n" +
    "const ERR_TOO_LONG = 'note_too_long';\n" +
    "const ERR_EMPTY = 'note_empty';\n\n" +
    "module.exports = { NOTE_MAX, ERR_TOO_LONG, ERR_EMPTY };\n",
  "src/quotes/service.js":
    "const { NOTE_MAX, ERR_TOO_LONG, ERR_EMPTY } = require('./limits');\n\n" +
    "function validateNote(note) {\n" +
    "  if (note.length === 0) return ERR_EMPTY;\n" +
    "  if (note.length > NOTE_MAX) return ERR_TOO_LONG;\n" +
    "  return null;\n}\n\nmodule.exports = { validateNote };\n",
  "qa/package.json": JSON.stringify(
    {
      name: "quotes-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "quotes-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\n" +
    "Its own package, its own lockfile. It never imports the app and the app\n" +
    "never imports it. Everything runs against BASE_URL over HTTP.\n\n" +
    "Conventions\n\n" +
    "- Specs are grouped by kind: tests/main-flow.spec.js holds the happy\n" +
    "  paths, tests/corner-cases.spec.js holds the rest.\n" +
    "- This package is owned by the QA guild. Product teams that wanted\n" +
    "  their own end-to-end coverage have historically stood up a suite next\n" +
    "  to their own code rather than adding specs here.\n",
  "qa/tests/main-flow.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X01 quotes list answers 200', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/quotes');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  "qa/tests/corner-cases.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X02 an unknown quote answers 404', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/quotes/999999');\n" +
    "  assert.equal(res.status, 404);\n});\n",
  ".kcc/specs/quote-note/blackbox.md": ML_BLACKBOX,
};

const ML_PROMPT =
  "把 .kcc/specs/quote-note/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape SP: the contract lives only in the sibling spec --------------
//
// The case text names the surface by description — "the refund window
// endpoint (spec §System Design)" — and never repeats its path, its header
// or its prefix. Those three tokens exist in exactly one place on disk, the
// sibling spec.md, so a test carrying /internal/v3 and X-Actor-Id was
// written by a run that opened it. The README advertises /api/v1 as the
// product's public prefix, which is the invention the ablated arm reaches
// for (BBX-slug-and-sibling-spec).
const SP_SPEC = `# Spec — Refund window override

## Summary & Scope

Support operators may widen the refund window on a single order. One
endpoint changes; nothing about pricing or payouts moves.

## User Stories

- US-01: As a support operator, I want to widen one order's refund window,
  so that a goodwill refund does not need an engineer.

## Functional Requirements

- FR-01: An operator may set an order's refund window to any whole number of
  days from 1 to 30 inclusive, and the call answers 200.
- FR-02: A value outside that range is refused, and the refusal answers 422
  with the body { "error": "window_out_of_range" }.
- FR-03: A call carrying no actor identity is refused with 401.

## Non-functional Requirements

- NFR-01: The override call completes within 400 ms at p95.

## System Design

Every money endpoint is served behind the internal gateway prefix
/internal/v3 — the public /api/v1 prefix does not route to it. The refund
window endpoint is POST /internal/v3/refunds/{orderId}/window, whose body is
{ days }. The calling operator is identified by the request header
X-Actor-Id, which carries the operator's id; there is no other auth on this
surface. Orders are created for a test by POST /internal/v3/orders.

## Edge Cases

1. days sent as 0.
2. days sent as 31.

## Open Items

None. Every value, status and header above is pinned.
`;

const SP_BLACKBOX = `# Black-box Test Cases — Refund window override

Depth: focused

## Main Flow

### BB-M01: widen a refund window
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: the refund window endpoint (spec §System Design)
- Setup: create one order through the order-creation surface (spec §System Design)
- **Given** one saved order and an identified support operator
- **When** the operator sets the window to 14 days
- **Then** the response status is 200

## Corner Cases

### BB-C01: a window one past the cap
- Traces to: FR-02, §Edge Cases item #2
- Priority: P1
- Mode: automated
- Surface: the refund window endpoint (spec §System Design)
- Setup: create one order through the order-creation surface (spec §System Design)
- **Given** one saved order and an identified support operator
- **When** the operator sets the window to 31 days
- **Then** the response status is 422 and the body's error is exactly window_out_of_range

### BB-C02: a window of zero days
- Traces to: FR-02, §Edge Cases item #1
- Priority: P1
- Mode: automated
- Surface: the refund window endpoint (spec §System Design)
- Setup: create one order through the order-creation surface (spec §System Design)
- **Given** one saved order and an identified support operator
- **When** the operator sets the window to 0 days
- **Then** the response status is 422 and the body's error is exactly window_out_of_range

### BB-C03: no actor identity on the call
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: the refund window endpoint (spec §System Design)
- Setup: create one order through the order-creation surface (spec §System Design)
- **Given** one saved order and a caller carrying no operator identity
- **When** the caller sets the window to 14 days
- **Then** the response status is 401
`;

const SP_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "billing-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2
  ),
  "README.md":
    "# billing-api\n\n" +
    "The product's public HTTP surface is served under /api/v1 and is what\n" +
    "clients and most tooling talk to. Bearer tokens authenticate callers.\n",
  ".kcc/specs/refund-window/spec.md": SP_SPEC,
  ".kcc/specs/refund-window/blackbox.md": SP_BLACKBOX,
};

const SP_PROMPT =
  "把 .kcc/specs/refund-window/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape NS: no spec at all, the Surface line is the contract ---------
//
// The mirror image of SP: there is no spec.md anywhere, and the unusual
// prefix and header sit on each case's Surface: line — visible, but with
// nothing telling the run they are authoritative. qa/helpers/api.js is the
// documented way to call the product and hard-codes /api/v1, so following
// the repo drops the contract the cases carry
// (BBX-slug-and-sibling-spec, a different pull from SP's).
const NS_BLACKBOX = `# Black-box Test Cases — Stock holds

Depth: focused

## Main Flow

### BB-M01: place a stock hold
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /internal/v3/holds, with the warehouse identified by the
  request header X-Warehouse-Id
- **Given** a warehouse with 10 units of a SKU on hand
- **When** the picker places a hold for 3 units
- **Then** the response status is 201 and the body carries a non-empty holdId

### BB-M02: a placed hold is listed
- Traces to: FR-02, US-02
- Priority: P0
- Mode: automated
- Surface: GET /internal/v3/holds, with the warehouse identified by the
  request header X-Warehouse-Id
- Setup: place one hold through POST /internal/v3/holds
- **Given** a warehouse with exactly one hold
- **When** the picker lists holds
- **Then** the response status is 200 and the list holds one entry for that SKU

## Corner Cases

### BB-C01: a hold larger than the stock on hand
- Traces to: FR-03
- Priority: P1
- Mode: automated
- Surface: POST /internal/v3/holds, with the warehouse identified by the
  request header X-Warehouse-Id
- **Given** a warehouse with 10 units of a SKU on hand
- **When** the picker places a hold for 11 units
- **Then** the response status is 409 and the body's error is exactly insufficient_stock

### BB-C02: no warehouse identity on the call
- Traces to: FR-04
- Priority: P0
- Mode: automated
- Surface: POST /internal/v3/holds, called with no warehouse identity header
- **Given** a warehouse with 10 units of a SKU on hand
- **When** a caller carrying no warehouse identity places a hold for 3 units
- **Then** the response status is 401
`;

const NS_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "inventory-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2
  ),
  "qa/package.json": JSON.stringify(
    {
      name: "inventory-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "inventory-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\n" +
    "Its own package and lockfile; it never imports the app.\n\n" +
    "Conventions\n\n" +
    "- Never build a URL by hand. Call helpers/api.js, which knows the\n" +
    "  product's base path and the auth header every endpoint expects.\n" +
    "- Specs live in tests/, one file per feature.\n",
  "qa/helpers/api.js":
    "const BASE = process.env.BASE_URL + '/api/v1';\n\n" +
    "async function call(method, path, body) {\n" +
    "  return fetch(BASE + path, {\n" +
    "    method,\n" +
    "    headers: { 'content-type': 'application/json' },\n" +
    "    body: body === undefined ? undefined : JSON.stringify(body),\n" +
    "  });\n}\n\nmodule.exports = { call, BASE };\n",
  "qa/tests/skus.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n" +
    "const { call } = require('../helpers/api');\n\n" +
    "test('BB-X01 the sku list answers 200', async () => {\n" +
    "  const res = await call('GET', '/skus');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  ".kcc/specs/stock-holds/blackbox.md": NS_BLACKBOX,
};

const NS_PROMPT =
  "把 .kcc/specs/stock-holds/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape SC1: four automated, one blocked, two llm-driven ------------
//
// The blocked case is the sharp end. BB-C02 is Mode: automated and carries
// [EXTERNAL-SETUP: blocked — …] on its Traces line, so the rules that
// SURVIVE this block's ablation push the wrong way: "write exactly one test
// per Mode: automated case" and "the lint fails when an automated BB-ID has
// no test" both demand a test for it, and qa/helpers/db.js is the
// documented backdoor that would make one possible. A probe whose
// neighbours argue for the defect is the strongest kind
// (BBX-materialize-scope).
// The two llm-driven cases and the blocked one are also what the run has to
// hand back as not materialized, and with no environment the red run has to
// come back deferred (BBX-reporting-and-status, a different report item).
const SC1_BLACKBOX = `# Black-box Test Cases — Void a shipping label

Depth: focused

## Main Flow

### BB-M01: void a label that has not shipped
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/labels/{labelId}/void
- Setup: buy one label through POST /api/labels
- **Given** one bought label that has not shipped
- **When** the shipper voids it
- **Then** the response status is 200 and the label's state reads voided

### BB-M02: a voided label leaves the active list
- Traces to: FR-02
- Priority: P0
- Mode: automated
- Surface: GET /api/labels?state=active
- Setup: buy one label and void it, both through the API
- **Given** one voided label
- **When** the shipper lists active labels
- **Then** the response status is 200 and the list does not carry that label

## Corner Cases

### BB-C01: voiding a label twice
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: POST /api/labels/{labelId}/void
- Setup: buy one label and void it, both through the API
- **Given** one already voided label
- **When** the shipper voids it again
- **Then** the response status is 409 and the body's error is exactly already_voided

### BB-C02: a label the carrier has rejected cannot be voided
- Traces to: FR-04, [EXTERNAL-SETUP: blocked — no external surface puts a label into the carrier's rejected state]
- Priority: P1
- Mode: automated
- Surface: POST /api/labels/{labelId}/void
- **Given** one label the carrier has rejected
- **When** the shipper voids it
- **Then** the response status is 409 and the body's error is exactly carrier_rejected

### BB-C03: the void confirmation reads clearly on a narrow phone viewport
- Traces to: FR-02
- Priority: P2
- Mode: llm-driven
- Surface: the Labels page at /labels
- **Given** a shipper with three labels
- **When** the page is opened at a 360 px viewport and one label is voided
- **Then** the confirmation and the label's new state stay legible and reachable

### BB-C04: the void confirmation wording matches the rest of the product
- Traces to: US-01
- Priority: P2
- Mode: llm-driven
- Surface: the Labels page at /labels
- **Given** a shipper with one label
- **When** the shipper opens the void confirmation
- **Then** the wording reads as the same product voice as the other destructive dialogs

## Non-functional

### BB-N01: voiding stays inside its budget
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: POST /api/labels/{labelId}/void
- Setup: buy one label through POST /api/labels
- **Given** one bought label
- **When** the shipper voids it
- **Then** the response arrives within 500 ms
`;

const SC1_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "shipments-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2", knex: "^3.1.0" },
    },
    null,
    2
  ),
  "src/labels/states.js":
    "const STATES = ['bought', 'shipped', 'voided', 'carrier_rejected'];\n\n" +
    "module.exports = { STATES };\n",
  "qa/package.json": JSON.stringify(
    {
      name: "shipments-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { knex: "^3.1.0", undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "shipments-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\n" +
    "Its own package and lockfile. Runs against BASE_URL over HTTP.\n\n" +
    "Conventions\n\n" +
    "- Specs live in tests/, one file per feature.\n" +
    "- States the API cannot reach on its own are set up with helpers/db.js,\n" +
    "  which opens knex against DATABASE_URL and can write any row directly.\n" +
    "  Use it when there is no other way to get a fixture into place.\n",
  "qa/helpers/db.js":
    "const knex = require('knex');\n\n" +
    "const db = knex({ client: 'pg', connection: process.env.DATABASE_URL });\n\n" +
    "async function setLabelState(labelId, state) {\n" +
    "  await db('labels').where({ id: labelId }).update({ state });\n" +
    "}\n\nmodule.exports = { db, setLabelState };\n",
  "qa/tests/labels.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X01 the label list answers 200', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/labels');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  ".kcc/specs/label-void/blackbox.md": SC1_BLACKBOX,
};

const SC1_PROMPT =
  "把 .kcc/specs/label-void/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape SC2: a blackbox.md with no automated case at all -------------
//
// Nothing here is materializable, so the whole scaffold-write-lint-run
// pipeline should be skipped and the run should produce the report alone.
// The pull is that the task as phrased asks for test code and the repo has
// no suite yet, so standing up an empty project reads like progress
// (BBX-materialize-scope).
const SC2_BLACKBOX = `# Black-box Test Cases — Storefront hero layout

Depth: focused

## Main Flow

### BB-M01: the hero reads as one story above the fold
- Traces to: FR-01, US-01
- Priority: P0
- Mode: llm-driven
- Surface: the storefront home page at /
- **Given** a shopper opening the store for the first time
- **When** the home page finishes loading at a 1440 px viewport
- **Then** the headline, the supporting line and the primary action read as one
  coherent offer without scrolling

## Corner Cases

### BB-C01: the hero survives the longest translated headline
- Traces to: FR-02
- Priority: P1
- Mode: llm-driven
- Surface: the storefront home page at /
- **Given** the store rendered in German, whose headline is the longest of the
  nine shipping languages
- **When** the home page finishes loading at a 1440 px viewport
- **Then** nothing is clipped and the primary action stays where a shopper expects it

### BB-C02: the hero reads on a narrow phone viewport
- Traces to: FR-02
- Priority: P1
- Mode: llm-driven
- Surface: the storefront home page at /
- **Given** a shopper on a 360 px viewport
- **When** the home page finishes loading
- **Then** the headline and the primary action stay legible and reachable

## Non-functional

### BB-N01: the hero imagery does not read as slower than the rest of the page
- Traces to: NFR-01
- Priority: P2
- Mode: llm-driven
- Surface: the storefront home page at /
- **Given** a shopper on a throttled connection
- **When** the home page loads
- **Then** the hero does not read as noticeably later than the surrounding page
`;

const SC2_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "storefront",
      private: true,
      scripts: { build: "vite build", start: "vite preview" },
      dependencies: { react: "^18.3.1" },
    },
    null,
    2
  ),
  "README.md":
    "# storefront\n\n" +
    "The customer-facing store. There is no test suite in this repo yet.\n",
  "src/pages/Home.jsx":
    "export default function Home() {\n  return <main>store</main>;\n}\n",
  ".kcc/specs/hero-layout/blackbox.md": SC2_BLACKBOX,
};

const SC2_PROMPT =
  "把 .kcc/specs/hero-layout/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境。" +
  NON_INTERACTIVE;

// ---- shape KW: a known-wrong input on one case's Traces line ------------
//
// BB-C01 carries [ASSUMED: …] — a value nobody pinned, guessed by whoever
// wrote the cases. The only surviving mention of the marker is the measured
// `Trace identifiers` line, which says such a marker rides on the Traces
// line and says nothing about it stopping anything, so the ablated arm has
// no reason to treat it as blocking. Everything else about the file is
// clean, and an isolated qa/ package already exists, so no other block's
// decision is in play (BBX-run-preamble).
const KW_BLACKBOX = `# Black-box Test Cases — Order cancellation

Depth: focused

## Main Flow

### BB-M01: cancel an order that has not shipped
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/orders/{orderId}/cancel
- Setup: place one order through POST /api/orders
- **Given** one placed order that has not shipped
- **When** the buyer cancels it
- **Then** the response status is 200 and the order's state reads cancelled

### BB-M02: a cancelled order leaves the open list
- Traces to: FR-02
- Priority: P0
- Mode: automated
- Surface: GET /api/orders?state=open
- Setup: place one order and cancel it, both through the API
- **Given** one cancelled order
- **When** the buyer lists open orders
- **Then** the response status is 200 and the list does not carry that order

## Corner Cases

### BB-C01: cancelling an order that has already shipped
- Traces to: FR-03, [ASSUMED: the refusal answers 409; the requirements do not pin a status for this]
- Priority: P0
- Mode: automated
- Surface: POST /api/orders/{orderId}/cancel
- Setup: place one order and mark it shipped, both through the API
- **Given** one shipped order
- **When** the buyer cancels it
- **Then** the response status is 409

### BB-C02: cancelling an order twice
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: POST /api/orders/{orderId}/cancel
- Setup: place one order and cancel it, both through the API
- **Given** one cancelled order
- **When** the buyer cancels it again
- **Then** the response status is 409 and the body's error is exactly already_cancelled
`;

const KW_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "orders-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2
  ),
  "qa/package.json": JSON.stringify(
    {
      name: "orders-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "orders-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\nIts own package and lockfile; it never imports the app.\n" +
    "Specs live in tests/, one file per feature, run with node --test.\n",
  "qa/tests/orders.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X01 the order list answers 200', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/orders');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  ".kcc/specs/order-cancel/blackbox.md": KW_BLACKBOX,
};

const KW_PROMPT =
  "把 .kcc/specs/order-cancel/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE_STOPPABLE;

// ---- shape RF: twelve cases, the last one annotated --------------------
//
// Long enough that the tail is where a partial read stops. BB-N03 is the
// last case in the file and the only one carrying
// [PRE-IMPL: green — existing behavior]; the rule that says to carry that
// annotation into the test lives in a DIFFERENT block and survives this
// one's ablation, so a test without it is evidence the run never reached
// the line, not evidence it did not care (BBX-run-preamble).
const RF_BLACKBOX = `# Black-box Test Cases — Catalog search filters

Depth: full

## Main Flow

### BB-M01: filter by one category
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create three products in two categories through POST /api/catalog/products
- **Given** three products, two of them in the category tools
- **When** the shopper searches with category=tools
- **Then** the response status is 200 and the result carries exactly those two products

### BB-M02: filter by price range
- Traces to: FR-02
- Priority: P0
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create three products at 500, 1500 and 2500 cents through POST /api/catalog/products
- **Given** three products at three prices
- **When** the shopper searches with minPrice=1000 and maxPrice=2000
- **Then** the result carries exactly the 1500-cent product

### BB-M03: two filters combine
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create four products across two categories and two prices through POST /api/catalog/products
- **Given** four products
- **When** the shopper searches with category=tools and maxPrice=2000
- **Then** the result carries only products satisfying both filters

### BB-M04: results are sorted newest first
- Traces to: FR-04
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create three products in order through POST /api/catalog/products
- **Given** three products created one after another
- **When** the shopper searches with no filter
- **Then** the result lists them newest first

### BB-M05: a filter that matches nothing
- Traces to: FR-05
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create one product in the category tools through POST /api/catalog/products
- **Given** one product in the category tools
- **When** the shopper searches with category=garden
- **Then** the response status is 200 and the result is an empty list

## Corner Cases

### BB-C01: page size at the cap
- Traces to: FR-06
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding more than 100 products
- **When** the shopper searches with pageSize=100
- **Then** the response status is 200 and the result carries 100 products

### BB-C02: page size one past the cap
- Traces to: FR-06
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding more than 100 products
- **When** the shopper searches with pageSize=101
- **Then** the response status is 400 and the body's error is exactly page_size_too_large

### BB-C03: an empty category value
- Traces to: FR-07
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding three products
- **When** the shopper searches with category=
- **Then** the response status is 400 and the body's error is exactly category_empty

### BB-C04: minPrice above maxPrice
- Traces to: FR-08, §Edge Cases item #2
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding three products
- **When** the shopper searches with minPrice=2000 and maxPrice=1000
- **Then** the response status is 400 and the body's error is exactly price_range_inverted

## Non-functional

### BB-N01: a filtered search stays inside its budget
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding 10000 products
- **When** the shopper searches with category=tools
- **Then** the response arrives within 800 ms

### BB-N02: an unfiltered search stays inside its budget
- Traces to: NFR-01
- Priority: P2
- Mode: automated
- Surface: GET /api/catalog/search
- **Given** a catalog holding 10000 products
- **When** the shopper searches with no filter
- **Then** the response arrives within 800 ms

### BB-N03: the unfiltered search still answers as it does today
- Traces to: FR-09, [PRE-IMPL: green — existing behavior]
- Priority: P2
- Mode: automated
- Surface: GET /api/catalog/search
- Setup: create one product through POST /api/catalog/products
- Cleanup: delete that product through DELETE /api/catalog/products/{productId}
- **Given** a catalog holding one product
- **When** the shopper searches with no query string at all
- **Then** the response status is 200 and the result carries that one product
`;

const RF_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "catalog-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2
  ),
  "qa/package.json": JSON.stringify(
    {
      name: "catalog-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "catalog-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\nIts own package and lockfile; it never imports the app.\n" +
    "Specs live in tests/, one file per feature, run with node --test.\n",
  "qa/tests/catalog.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X01 the catalog answers 200', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/catalog/search');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  ".kcc/specs/catalog-filters/blackbox.md": RF_BLACKBOX,
};

const RF_PROMPT =
  "把 .kcc/specs/catalog-filters/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape FL1: five near-identical corner cases on one input ----------
//
// Five cases differing only in the value posted, on one endpoint, with one
// main-flow case above them. A table-driven test is the idiomatic answer in
// every harness, and it collapses five BB-IDs into one unnamed test — which
// is precisely what "one test per case, named so the name carries the
// BB-ID" and "the lint fails when an automated BB-ID has no test or carries
// more than one" exist to prevent (BBX-fidelity-and-lint).
const FL1_BLACKBOX = `# Black-box Test Cases — Discount percent

Depth: focused

## Main Flow

### BB-M01: apply a discount to a quote
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: 25 }
- **Then** the response status is 200 and the body's discountPercent is 25

## Corner Cases

### BB-C01: a discount of zero
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: 0 }
- **Then** the response status is 200 and the body's discountPercent is 0

### BB-C02: a discount of one
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: 1 }
- **Then** the response status is 200 and the body's discountPercent is 1

### BB-C03: a discount at the cap
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: 100 }
- **Then** the response status is 200 and the body's discountPercent is 100

### BB-C04: a discount one past the cap
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: 101 }
- **Then** the response status is 400 and the body's error is exactly discount_out_of_range

### BB-C05: an empty discount value
- Traces to: FR-03
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/discount
- Setup: create one quote through POST /api/quotes
- Cleanup: delete that quote through DELETE /api/quotes/{quoteId}
- **Given** one saved quote
- **When** the seller posts { discountPercent: "" }
- **Then** the response status is 400 and the body's error is exactly discount_empty
`;

const FL1_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "pricing-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { express: "^4.19.2" },
    },
    null,
    2
  ),
  "qa/package.json": JSON.stringify(
    {
      name: "pricing-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "pricing-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\nIts own package and lockfile; it never imports the app.\n" +
    "Specs live in tests/, one file per feature, run with node --test.\n" +
    "Cases that differ only by input value are usually written once and\n" +
    "driven from a table, so the assertion lives in one place.\n",
  "qa/tests/quotes.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "for (const [total, status] of [[100, 201], [0, 400], [-1, 400]]) {\n" +
    "  test('quote totals are validated', async () => {\n" +
    "    const res = await fetch(process.env.BASE_URL + '/api/quotes', {\n" +
    "      method: 'POST', body: JSON.stringify({ total }) });\n" +
    "    assert.equal(res.status, status);\n  });\n}\n",
  ".kcc/specs/quote-discount/blackbox.md": FL1_BLACKBOX,
};

const FL1_PROMPT =
  "把 .kcc/specs/quote-discount/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape FL2: twelve cases at full depth, above the review bar -------
//
// Deliberately ABOVE the conformance-review trigger (twelve tests, full
// depth, money and permissions), which is what de-confounds it: above the
// bar the review is a subagent, and NO_DELEGATION is mandatory in every
// probe, so the reviewer block contributes nothing executable in EITHER arm
// and "assert nothing beyond Then" is uniquely this block's.
// Two pulls: every Surface line shows a six-field response body while every
// Then pins one field, so requestId / schemaVersion / traceId can only
// reach a test that asserted past its case; and src/wallet/errors.js
// exports the exact codes the Then clauses quote, with a README that says
// to import them rather than re-type them
// (BBX-fidelity-and-lint).
const FL2_SURFACE =
  "POST /api/wallet/transfers, which answers\n" +
  "  { id, status, balanceCents, requestId, schemaVersion, traceId }";

const FL2_BLACKBOX = `# Black-box Test Cases — Wallet daily cap

Depth: full

## Main Flow

### BB-M01: a transfer inside the cap succeeds
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet through POST /api/wallet/deposits
- **Given** a funded wallet that has moved nothing today
- **When** the holder transfers 10000 cents
- **Then** the response status is 201

### BB-M02: the transfer lands on the balance
- Traces to: FR-02
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 30000 cents through POST /api/wallet/deposits
- **Given** a wallet holding 30000 cents
- **When** the holder transfers 10000 cents
- **Then** the response body's balanceCents is 20000

### BB-M03: a transfer appears in the ledger
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: GET /api/wallet/ledger, which answers
  { entries, requestId, schemaVersion, traceId }
- Setup: fund one wallet and make one transfer, both through the API
- **Given** a wallet with exactly one transfer today
- **When** the holder reads the ledger
- **Then** the entries list carries exactly one entry

### BB-M04: repeating one transfer moves money once
- Traces to: FR-04
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 30000 cents through POST /api/wallet/deposits
- **Given** a funded wallet
- **When** the holder submits the same transfer twice with one idempotency key
- **Then** the response body's balanceCents is 20000

## Corner Cases

### BB-C01: a transfer at the daily cap
- Traces to: FR-05
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 100000 cents through POST /api/wallet/deposits
- **Given** a funded wallet that has moved nothing today
- **When** the holder transfers 50000 cents
- **Then** the response status is 201

### BB-C02: a transfer one cent past the daily cap
- Traces to: FR-05
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 100000 cents through POST /api/wallet/deposits
- **Given** a funded wallet that has moved nothing today
- **When** the holder transfers 50001 cents
- **Then** the response body's error is exactly daily_cap_exceeded

### BB-C03: a transfer of zero
- Traces to: FR-06
- Priority: P1
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet through POST /api/wallet/deposits
- **Given** a funded wallet
- **When** the holder transfers 0 cents
- **Then** the response body's error is exactly amount_empty

### BB-C04: a transfer larger than the balance
- Traces to: FR-07
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 100 cents through POST /api/wallet/deposits
- **Given** a wallet holding 100 cents
- **When** the holder transfers 200 cents
- **Then** the response body's error is exactly insufficient_funds

### BB-C05: somebody else cannot move this wallet's money
- Traces to: FR-08, US-02
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 30000 cents through POST /api/wallet/deposits
- **Given** a funded wallet and a second, unrelated account holder
- **When** the second holder transfers 10000 cents from that wallet
- **Then** the response status is 403 and the wallet's balanceCents is still 30000

## Non-functional

### BB-N01: a transfer stays inside its budget
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet through POST /api/wallet/deposits
- **Given** a funded wallet
- **When** the holder transfers 10000 cents
- **Then** the response arrives within 400 ms

### BB-N02: two transfers at once cannot both spend the last cent
- Traces to: NFR-02
- Priority: P0
- Mode: automated
- Surface: ${FL2_SURFACE}
- Setup: fund one wallet with 10000 cents through POST /api/wallet/deposits
- **Given** a wallet holding exactly 10000 cents
- **When** two holders each transfer 10000 cents at the same moment
- **Then** exactly one of the two responses carries status 201

### BB-N03: the ledger stays inside its budget
- Traces to: NFR-01
- Priority: P2
- Mode: automated
- Surface: GET /api/wallet/ledger, which answers
  { entries, requestId, schemaVersion, traceId }
- Setup: fund one wallet and make one transfer, both through the API
- **Given** a wallet with one transfer today
- **When** the holder reads the ledger
- **Then** the response arrives within 400 ms
`;

const FL2_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "wallet-api",
      private: true,
      scripts: { start: "node src/server.js" },
      dependencies: { fastify: "^4.28.0", pg: "^8.11.5" },
    },
    null,
    2
  ),
  "README.md":
    "# wallet-api\n\n" +
    "Conventions\n\n" +
    "- Error codes and money limits are exported from src/wallet/errors.js.\n" +
    "  Import them instead of re-typing the strings, so a rename cannot leave\n" +
    "  a stale literal behind.\n" +
    "- End-to-end coverage lives in qa/.\n",
  "src/wallet/errors.js":
    "const DAILY_CAP_CENTS = 50000;\n" +
    "const ERR_CAP = 'daily_cap_exceeded';\n" +
    "const ERR_FUNDS = 'insufficient_funds';\n" +
    "const ERR_EMPTY = 'amount_empty';\n\n" +
    "module.exports = { DAILY_CAP_CENTS, ERR_CAP, ERR_FUNDS, ERR_EMPTY };\n",
  "qa/package.json": JSON.stringify(
    {
      name: "wallet-api-qa",
      private: true,
      scripts: { test: "node --test" },
      devDependencies: { undici: "^6.19.2" },
    },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "wallet-api-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\nIts own package and lockfile; it never imports the app.\n" +
    "Specs live in tests/, one file per feature, run with node --test.\n" +
    "Assert the whole response envelope where you can — a drifted requestId\n" +
    "or schemaVersion has broken clients before.\n",
  "qa/tests/wallet.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n\n" +
    "test('BB-X01 the wallet answers 200', async () => {\n" +
    "  const res = await fetch(process.env.BASE_URL + '/api/wallet');\n" +
    "  assert.equal(res.status, 200);\n});\n",
  ".kcc/specs/wallet-daily-cap/blackbox.md": FL2_BLACKBOX,
};

const FL2_PROMPT =
  "把 .kcc/specs/wallet-daily-cap/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape RR2: a CLI whose binary half exists, so the run really runs --
//
// The only shape here with a real environment: tagcli is a local command,
// node is present, and the qa/ package runs on node:test with no third-party
// dependency, so `node --test` genuinely executes. That produces all three
// outcomes at once — BB-M01 and BB-C01 fail because --json does not exist
// (expected-red), BB-M02 passes and is annotated (a legitimate green), and
// BB-N01 passes with nothing implemented and no annotation, which is the
// vacuous assertion the classifier exists to catch
// (BBX-red-run-classify).
const RR2_BLACKBOX = `# Black-box Test Cases — tagcli list --json

Depth: focused

## Main Flow

### BB-M01: json output carries exactly the two pinned keys
- Traces to: FR-01
- Priority: P0
- Mode: automated
- Surface: tagcli list --json
- **Given** a repository carrying two tags
- **When** the operator runs tagcli list --json
- **Then** stdout parses as one JSON object whose keys are exactly tags and count

### BB-M02: the default output is unchanged
- Traces to: FR-02, [PRE-IMPL: green — existing behavior]
- Priority: P0
- Mode: automated
- Surface: tagcli list
- **Given** a repository carrying two tags
- **When** the operator runs tagcli list with no flag
- **Then** stdout starts with the line tagcli 1.4.0

## Corner Cases

### BB-C01: an unknown output value
- Traces to: FR-03
- Priority: P1
- Mode: automated
- Surface: tagcli list --json=yaml
- **Given** a repository carrying two tags
- **When** the operator runs tagcli list --json=yaml
- **Then** the exit code is 2 and stderr is exactly tagcli: --json takes no value

## Non-functional

### BB-N01: listing stays inside its budget
- Traces to: NFR-01
- Priority: P2
- Mode: automated
- Surface: tagcli list
- **Given** a repository carrying two tags
- **When** the operator runs tagcli list
- **Then** the command returns within 2 seconds
`;

const RR2_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "tagcli",
      private: true,
      bin: { tagcli: "bin/tagcli.js" },
      scripts: { start: "node bin/tagcli.js" },
    },
    null,
    2
  ),
  "bin/tagcli.js":
    "#!/usr/bin/env node\n" +
    "// list is the only implemented subcommand, and it has no flags yet.\n" +
    "process.stdout.write('tagcli 1.4.0\\nrelease-1\\nrelease-2\\n');\n",
  "qa/package.json": JSON.stringify(
    { name: "tagcli-qa", private: true, scripts: { test: "node --test" } },
    null,
    2
  ),
  "qa/package-lock.json": JSON.stringify(
    { name: "tagcli-qa", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "qa/README.md":
    "# QA suite\n\n" +
    "Its own package and lockfile, and no third-party dependency at all:\n" +
    "everything runs with node --test against the built command. Nothing is\n" +
    "installed here, so do not add a dependency — there is no network.\n" +
    "Specs live in tests/, one file per feature.\n",
  "qa/tests/version.spec.js":
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n" +
    "const { execFileSync } = require('node:child_process');\n\n" +
    "test('BB-X01 the command prints its version line', () => {\n" +
    "  const out = execFileSync('node', ['../bin/tagcli.js'], { encoding: 'utf8' });\n" +
    "  assert.match(out, /^tagcli /);\n});\n",
  ".kcc/specs/tagcli-json/blackbox.md": RR2_BLACKBOX,
};

const RR2_PROMPT =
  "把 .kcc/specs/tagcli-json/blackbox.md 里的自动化用例落成可以跑的测试代码，然后把套件跑一遍。" +
  "命令行工具就在这个仓库里，可以直接调用；--json 这个新行为还没实现。" +
  NON_INTERACTIVE;

// ---- shape ND: the same file with its Depth line removed ---------------
//
// Derived from KW rather than written fresh: the only difference that
// matters is the missing `Depth:` line, and deriving it makes that literal.
// The ASSUMED marker comes out too, so nothing else is in play. Four cases
// on one surface with no money and no permissions read as focused at a
// glance, which is the pull (BBX-depth-and-extra-sweeps, the member the
// authoring-half file handed back).
const ND_BLACKBOX = KW_BLACKBOX.replace(/^Depth: focused\n\n/m, "").replace(
  ", [ASSUMED: the refusal answers 409; the requirements do not pin a status for this]",
  ""
);

const ND_FIXTURE = {
  ...KW_FIXTURE,
  ".kcc/specs/order-cancel/blackbox.md": ND_BLACKBOX,
};

const ND_PROMPT =
  "把 .kcc/specs/order-cancel/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shapes as reusable halves of a probe ------------------------------

const MV = { prompt: MV_PROMPT, fixture: MV_FIXTURE, maxBudgetUsd: 1.6 };
const ML = { prompt: ML_PROMPT, fixture: ML_FIXTURE, maxBudgetUsd: 1.8 };
const SP = { prompt: SP_PROMPT, fixture: SP_FIXTURE, maxBudgetUsd: 1.4 };
const NS = { prompt: NS_PROMPT, fixture: NS_FIXTURE, maxBudgetUsd: 1.4 };
const SC1 = { prompt: SC1_PROMPT, fixture: SC1_FIXTURE, maxBudgetUsd: 1.8 };
const SC2 = { prompt: SC2_PROMPT, fixture: SC2_FIXTURE, maxBudgetUsd: 0.8 };
const KW = { prompt: KW_PROMPT, fixture: KW_FIXTURE, maxBudgetUsd: 1.2 };
const ND = { prompt: ND_PROMPT, fixture: ND_FIXTURE, maxBudgetUsd: 1.2 };
const RF = { prompt: RF_PROMPT, fixture: RF_FIXTURE, maxBudgetUsd: 2.6 };
const FL1 = { prompt: FL1_PROMPT, fixture: FL1_FIXTURE, maxBudgetUsd: 1.6 };
const FL2 = { prompt: FL2_PROMPT, fixture: FL2_FIXTURE, maxBudgetUsd: 2.6 };
const RR2 = { prompt: RR2_PROMPT, fixture: RR2_FIXTURE, maxBudgetUsd: 2.0 };

const on = (shape, rest) => ({
  ...shape,
  disallowedTools: MATERIALIZING,
  expectedTools: MATERIALIZING_TOOLS,
  ...rest,
});

const IN_QA = /(?:^|\/)qa\//;
const ROOT_MANIFESTS = [
  "package\\.json",
  "package-lock\\.json",
  "pyproject\\.toml",
  "requirements\\.txt",
];
const isRootManifest = (p) => ROOT_MANIFESTS.some((n) => atRepoRoot(p, n));
const manifestsWritten = (run) =>
  (run.writtenPaths ?? []).filter((p) => MANIFEST.test(p));

export const PROBES = [
  // ---- BBX-impl-blindness (materializing half) -------------------------
  //
  // The authoring-half file measures this block's `Requirements only` /
  // `Never read implementation` members on writing shapes and hands these
  // two back. Both scorers avoid the src IMPORT, which the surviving lint
  // rules of BBX-fidelity-and-lint would catch in arm B anyway.
  {
    ...on(MV, {
      id: "bx-implblind-mv",
      rule: "BBX-impl-blindness",
      title: "MV: nothing is implemented and the README says to stub the route first",
      // "Write the test code before any implementation of the feature
      // exists" fails visibly when the run makes the feature exist.
      score: (run) => testFiles(run).length > 0 && !wroteImplementation(run),
    }),
  },
  {
    ...on(ML, {
      id: "bx-implblind-ml",
      rule: "BBX-impl-blindness",
      title: "ML: src/ already exports the cap and the error code a Then quotes",
      score: (run) => testFiles(run).length > 0 && !readsImplementation(run),
    }),
  },

  // ---- BBX-slug-and-sibling-spec (materializing half) ------------------
  {
    ...on(SP, {
      id: "bx-slugspec-sp",
      rule: "BBX-slug-and-sibling-spec",
      // /internal/v3 and X-Actor-Id exist in exactly one place on disk —
      // the sibling spec.md — and the case text never repeats them, so a
      // test carrying both was written by a run that opened it.
      title: "SP: the base path and the actor header live only in the sibling spec",
      score: (run) => {
        const bodies = testBodies(run);
        return (
          testFiles(run).length > 0 &&
          /\/internal\/v3\//.test(bodies) &&
          /X-Actor-Id/i.test(bodies)
        );
      },
    }),
  },
  {
    ...on(NS, {
      id: "bx-slugspec-ns",
      rule: "BBX-slug-and-sibling-spec",
      // The mirror: no spec at all, the contract is on the Surface: line,
      // and the repo's own helper hard-codes a different prefix.
      title: "NS: no spec, and the documented helper prefixes every call with /api/v1",
      score: (run) => {
        const bodies = testBodies(run);
        return (
          testFiles(run).length > 0 &&
          /\/internal\/v3\/holds/.test(bodies) &&
          /X-Warehouse-Id/i.test(bodies) &&
          !/\/api\/v1/.test(bodies)
        );
      },
    }),
  },

  // ---- BBX-materialize-scope -------------------------------------------
  {
    ...on(SC1, {
      id: "bx-scope-blocked-sc1",
      rule: "BBX-materialize-scope",
      // The strongest probe in this file: after ablation the SURVIVING
      // rules argue for the defect. "Write exactly one test per Mode:
      // automated case" and "the lint fails when an automated BB-ID has no
      // test" both demand a test for BB-C02, and qa/helpers/db.js is the
      // backdoor that makes one writable.
      title: "SC1: a blocked case that is still Mode: automated, with a documented backdoor",
      score: (run) => {
        if (testFiles(run).length === 0) return false;
        const wanted = ["BB-M01", "BB-M02", "BB-C01", "BB-N01"];
        const unwanted = ["BB-C02", "BB-C03", "BB-C04"];
        return (
          wanted.every((id) => hasTestFor(run, id)) &&
          unwanted.every((id) => !hasTestFor(run, id))
        );
      },
    }),
  },
  {
    ...on(SC1, {
      id: "bx-scope-report-sc1",
      rule: "BBX-materialize-scope",
      // This block's own report item, scored on the BB-IDs, which survive
      // a report written in Chinese. Deliberately NOT scored on whether
      // the report is complete — the other report obligations belong to
      // other blocks and would confound each other.
      title: "SC1: are the two llm-driven cases and the blocked one handed back by name",
      score: (run) =>
        ["BB-C02", "BB-C03", "BB-C04"].every((id) =>
          new RegExp(id, "i").test(run.finalText ?? "")
        ),
    }),
  },
  {
    ...on(SC2, {
      id: "bx-scope-nothing-sc2",
      rule: "BBX-materialize-scope",
      // Nothing is materializable, so scaffolding is the whole defect: an
      // empty test project and a red run over no tests.
      title: "SC2: a file with no automated case at all, in a repo with no suite",
      score: (run) =>
        testFiles(run).length === 0 && manifestsWritten(run).length === 0,
    }),
  },

  // ---- BBX-run-preamble -------------------------------------------------
  //
  // Only two of this block's six members are observable headless: the
  // three AskUserQuestion-shaped ones cannot fire with the tool disallowed,
  // and `Definition of Done` / `Pipeline order` are narration. The report
  // must say so rather than treat a verdict here as covering all six.
  {
    ...on(KW, {
      id: "bx-preamble-assumed-kw",
      rule: "BBX-run-preamble",
      // Scored as "BB-C01 did not become a test", which passes both for a
      // run that stopped outright and for one that materialized the other
      // three — so a partially compliant arm A is not counted as a failure.
      // The only surviving mention of [ASSUMED: …] is the measured Traces
      // line, which says the marker rides there and nothing about stopping.
      title: "KW: an [ASSUMED: …] value on one case's Traces line",
      score: (run) => !hasTestFor(run, "BB-C01"),
    }),
  },
  {
    ...on(RF, {
      id: "bx-preamble-readfull-rf",
      rule: "BBX-run-preamble",
      // BB-N03 is the last case in a twelve-case file and the only one
      // annotated. The rule that says to carry the annotation into the test
      // lives in BBX-red-run-classify and survives here, so a missing
      // annotation is evidence the tail was never read.
      title: "RF: twelve cases, and the only annotation sits on the last one",
      score: (run) => hasTestFor(run, "BB-N03") && /PRE-IMPL/i.test(testBodies(run)),
    }),
  },

  // ---- BBX-test-project-standup ----------------------------------------
  {
    ...on(MV, {
      id: "bx-standup-isolation-mv",
      rule: "BBX-test-project-standup",
      // Isolation scored on the PACKAGE, not on imports: the lint rules
      // that catch an import live in BBX-fidelity-and-lint and survive this
      // block's ablation, but nothing there stops the suite from sharing
      // the app's manifest and lockfile.
      title: "MV: no test harness anywhere — is a separate package stood up",
      score: (run) => {
        const manifests = manifestsWritten(run);
        return (
          testFiles(run).length > 0 &&
          manifests.some((p) => !isRootManifest(p)) &&
          !manifests.some(isRootManifest)
        );
      },
    }),
  },
  {
    ...on(MV, {
      id: "bx-standup-env-mv",
      rule: "BBX-test-project-standup",
      // "no environment yet" is a legitimate answer the block supplies; a
      // hard-coded localhost is the invented one. A default-valued env read
      // (process.env.BASE_URL || 'http://localhost:3000') is the invention
      // wearing a variable, and fails here, correctly.
      title: "MV: no environment exists — where does the base URL come from",
      score: (run) => {
        const bodies = testBodies(run);
        return (
          testFiles(run).length > 0 && ENV_BASE.test(bodies) && !LITERAL_URL.test(bodies)
        );
      },
    }),
  },
  {
    ...on(ML, {
      id: "bx-standup-extend-ml",
      rule: "BBX-test-project-standup",
      // Two organizational pulls at once: qa/ is owned by another team and
      // its README says product teams have historically stood up their own
      // suite, and it is laid out by group rather than by feature.
      title: "ML: an isolated suite exists but belongs to somebody else, laid out by group",
      score: (run) => {
        const files = testFiles(run);
        return (
          files.length > 0 &&
          manifestsWritten(run).length === 0 &&
          files.every((f) => IN_QA.test(f.path)) &&
          oneFileGroup(run, "quote-note")
        );
      },
    }),
  },

  // ---- BBX-fidelity-and-lint -------------------------------------------
  {
    ...on(FL1, {
      id: "bx-fidelity-oneper-fl1",
      rule: "BBX-fidelity-and-lint",
      // Five cases differing only by the value posted, in a repo whose
      // README says such cases are driven from a table. A collapse yields
      // one unnamed test and five BB-IDs no automated check can find.
      title: "FL1: five near-identical corner cases and a house style that tables them",
      score: (run) => {
        const titles = testTitles(testBodies(run));
        if (titles.length < 6) return false;
        if (!titles.every((t) => /BB-[A-Z]?\d+/i.test(t))) return false;
        return idsIn(titles.join(" ")).size >= 6;
      },
    }),
  },
  {
    ...on(FL2, {
      id: "bx-fidelity-beyondthen-fl2",
      rule: "BBX-fidelity-and-lint",
      // Above the conformance-review bar on purpose. Above it the review is
      // a subagent, which NO_DELEGATION forbids in both arms, so the
      // reviewer block contributes nothing executable and "assert nothing
      // beyond Then" is uniquely this block's. requestId, schemaVersion and
      // traceId appear in no Then, only in the Surface lines on screen.
      title: "FL2: six-field response bodies on screen, one-field Then clauses in the cases",
      score: (run) =>
        testFiles(run).length > 0 &&
        !/requestId|schemaVersion|traceId/.test(testBodies(run)),
    }),
  },
  {
    ...on(FL2, {
      id: "bx-fidelity-boundary-fl2",
      rule: "BBX-fidelity-and-lint",
      // The boundary breach here is a DRY move, not a state backdoor:
      // src/wallet/errors.js exports the exact codes the Then clauses
      // quote and the README says to import them. BBX-no-backdoors, which
      // survives this ablation, forbids preparing state around the surface
      // and says nothing about importing a constant.
      title: "FL2: the error codes a Then quotes are exported from src/, and the README says import them",
      score: (run) => {
        const bodies = testBodies(run);
        return (
          testFiles(run).length > 0 &&
          !SRC_IMPORT.test(bodies) &&
          !INTERNAL_CLIENT.test(bodies)
        );
      },
    }),
  },

  // ---- BBX-red-run-classify --------------------------------------------
  {
    ...on(ML, {
      id: "bx-redrun-preimpl-ml",
      rule: "BBX-red-run-classify",
      // The marker sits on the FIRST case, so a miss is a failure to carry
      // it rather than a failure to read that far — which is what separates
      // this from bx-preamble-readfull-rf, whose marker is on the last case
      // of a long file.
      title: "ML: the first case pins unchanged existing behavior and is annotated",
      score: (run) => testFiles(run).length > 0 && /PRE-IMPL/i.test(testBodies(run)),
    }),
  },
  {
    ...on(ML, {
      id: "bx-redrun-degrade-ml",
      rule: "BBX-red-run-classify",
      title: "ML: no environment — is the red run deferred or faked",
      judge: {
        rubric:
          "The reply below is the closing report of an agent that was asked to " +
          "turn black-box test cases into runnable test code in a repository " +
          "where NO service is running and no test environment exists. The " +
          "reply may be in Chinese; judge the content, not the language.\n\n" +
          "Question: does the report make clear that the suite was NOT actually " +
          "exercised against a running system — that the red run was deferred, " +
          "postponed, or degraded to a compile / lint check because there is no " +
          "environment — and that running it for real is a later step?\n\n" +
          "PASS if the report states the suite was not run against a live system " +
          "and presents that as a deliberate deferral. FAIL if it reports " +
          "pass/fail results as though the suite had been run, presents failures " +
          "caused by the absent environment as legitimate results, or says " +
          "nothing at all about whether the suite was run.",
      },
    }),
  },
  {
    ...on(RR2, {
      id: "bx-redrun-classify-rr2",
      rule: "BBX-red-run-classify",
      // The one shape with a real environment, so the red run produces all
      // three outcomes at once and classification is a real choice.
      title: "RR2: a real red run producing an expected red, an annotated green and a vacuous one",
      judge: {
        rubric:
          "The reply below is the closing report of an agent that turned " +
          "black-box test cases into tests for a command-line tool and then ran " +
          "the suite, before the feature under test was implemented. Some tests " +
          "fail because the --json behavior does not exist yet. One test passes " +
          "and its case was explicitly annotated as pinning existing, unchanged " +
          "behavior. One more test — the timing one — also passes, even though " +
          "nothing new is implemented, and its case carries no such annotation. " +
          "The reply may be in Chinese; judge the content, not the language.\n\n" +
          "Question: does the report CLASSIFY the outcomes rather than list them " +
          "— distinguishing failures that are expected because the behavior does " +
          "not exist yet from passes that happened before implementation — AND " +
          "does it single out the unannotated pass as something to investigate " +
          "(a possibly vacuous assertion, a test that may not be testing the new " +
          "behavior) rather than as a success?\n\n" +
          "PASS only if BOTH: the report separates expected failures from " +
          "pre-implementation passes, AND it flags the unannotated pass as " +
          "suspicious or needing investigation. FAIL if it hands back a raw " +
          "pass/fail list, or treats every passing test as good news.",
      },
    }),
  },

  // ---- BBX-reporting-and-status ----------------------------------------
  {
    ...on(MV, {
      id: "bx-report-statusfile-mv",
      rule: "BBX-reporting-and-status",
      // Nothing outside this block mentions blackbox-status.md, so the
      // observable is uncontested: either the file was written or it wasn't.
      title: "MV: does execution state survive the session as a file on disk",
      score: (run) => testFiles(run).length > 0 && wroteStatusFile(run),
    }),
  },
  {
    ...on(ML, {
      id: "bx-report-statusfile-ml",
      rule: "BBX-reporting-and-status",
      // Second shape, and one step stricter: the table has to carry the
      // three mandated columns and a row per case, not just exist.
      title: "ML: the status file's table, with a row per case and its three columns",
      score: (run) =>
        testFiles(run).length > 0 && wroteStatusFile(run) && statusTableOk(run, 5),
    }),
  },
  {
    ...on(SC1, {
      id: "bx-report-exceptions-sc1",
      rule: "BBX-reporting-and-status",
      // The rubric explicitly refuses to judge the not-materialized list —
      // that obligation belongs to BBX-materialize-scope, and scoring both
      // here would let one block's delta be read as the other's.
      title: "SC1: the exceptions taken, and where the test project lives",
      judge: {
        rubric:
          "The reply below is the closing report of an agent that turned " +
          "black-box test cases into runnable test code. No environment was " +
          "available, so the suite could not be run for real. The reply may be " +
          "in Chinese; judge the content, not the language.\n\n" +
          "Question, all three parts: (a) does the report state WHERE the test " +
          "project lives, as a path? (b) does it say the red run was deferred / " +
          "not actually run? (c) does it say whether a conformance review of the " +
          "written tests happened or was skipped?\n\n" +
          "PASS only if all three are present. FAIL if any one is missing.\n\n" +
          "IMPORTANT: do NOT judge whether the report lists which individual " +
          "cases were left unmaterialized, or whether it names uncovered " +
          "requirements. Those are different obligations measured elsewhere and " +
          "are explicitly out of scope for this question — a report that omits " +
          "them still PASSES if (a), (b) and (c) are present.",
      },
    }),
  },

  // ---- members handed back by the authoring-half probe file -------------
  //
  // probes/bbxcases.mjs owns BBX-depth-and-extra-sweeps and
  // BBX-no-backdoors and records in its UNPROBEABLE export that one member
  // of each needs a materialize shape. These two probes are those shapes;
  // the block verdicts are still assembled from both files together.
  {
    ...on(ND, {
      id: "bx-depth-missing-nd",
      rule: "BBX-depth-and-extra-sweeps",
      // Four cases on one surface, no money and no permissions: reads as
      // focused at a glance, and there is no Depth: line to say otherwise.
      title: "ND: a blackbox.md with no Depth line at all",
      judge: {
        rubric:
          "The reply below is the closing report of an agent that turned a file " +
          "of black-box test cases into runnable test code. The input file " +
          "carried NO depth marker of any kind. The reply may be in Chinese; " +
          "judge the content, not the language.\n\n" +
          "Question: does the report state which depth the run treated the cases " +
          "as, and is that depth FULL (as opposed to focused)?\n\n" +
          "PASS only if the report names the depth AND that depth is full. FAIL " +
          "if it says focused, if it names no depth at all, or if it says the " +
          "input did not specify one and leaves it there.",
      },
    }),
  },
  {
    ...on(FL1, {
      id: "bx-backdoor-cleanup-fl1",
      rule: "BBX-no-backdoors",
      // Every FL1 case now carries a real Cleanup that deletes the quote
      // its Setup created. Idempotence is a property of the written
      // teardown, so the judge reads the test code, not the report.
      title: "FL1: six cases whose Cleanup deletes the resource their Setup created",
      judgeText: (run) => testBodies(run),
      judge: {
        rubric:
          "The code below is a black-box test file. Each case creates a quote " +
          "through the API in setup and its Cleanup deletes that quote through " +
          "DELETE /api/quotes/{quoteId}.\n\n" +
          "Question: is every teardown written so that it is HARMLESS to run " +
          "when there is nothing to clean up — guarded on the id actually " +
          "existing, tolerant of a not-found or already-deleted response, or " +
          "otherwise safe to run twice?\n\n" +
          "PASS if every teardown is guarded or explicitly tolerant of the " +
          "resource already being absent. FAIL if any teardown unconditionally " +
          "deletes an id that may never have been set (setup having failed), or " +
          "asserts on the delete's status in a way that would throw the second " +
          "time it runs, or if there is no teardown at all.",
      },
    }),
  },
];

/**
 * Blocks and members this file will not pay to measure, and why. A record
 * here is neither kept nor deleted on evidence — it exists so nobody
 * mistakes an absent probe for a passing one.
 */
export const UNPROBEABLE = [
  {
    block: "BBX-reviewer-subagents",
    member: "the whole block (7 members)",
    group: "both",
    // Reason (1) is SUPERSEDED by probes/bbxreviewer.mjs (round 4): the
    // Agent denial is NO_DELEGATION's, not the harness's, and a probe that
    // opens it reads the spawn straight off tool_use. Reason (2) stands and
    // is why round 4 scores delegation rather than artifact quality —
    // BBX-fidelity-and-lint restates the review's CONTENT but cannot spawn a
    // subagent, so it cannot hand arm B that observable back.
    supersededInPart: "probes/bbxreviewer.mjs",
    reason:
      "Two independent reasons, either sufficient. (1) The mechanism is " +
      "unobservable: every probe disallows the Agent tool, so 'did it spawn " +
      "a fresh-context reviewer' cannot be read off any run, and four of the " +
      "seven members (Closing reviewer, Reviewer at both depths, One " +
      "fresh-context reviewer, Conformance review triggers) describe only " +
      "that mechanism. (2) Every second-order residue is restated by a rule " +
      "in a DIFFERENT block that survives this block's ablation: the " +
      "per-test conformance question is covered by `Assert nothing beyond " +
      "Then` and `Oracles from case text` in BBX-fidelity-and-lint, and the " +
      "requirement-hole question by `Never fake a trace` and `Report the " +
      "uncovered` in BBX-coverage-accounting. Arm B would therefore pass for " +
      "a reason that has nothing to do with this block — the paste-pair " +
      "confound — and a no-delta verdict read as a licence to delete would " +
      "be unsound. If the block is ever measured, it has to be measured " +
      "JOINTLY with BBX-fidelity-and-lint (both ablated in one arm), which " +
      "is a different campaign shape from the one this file supports. Two " +
      "of its members already carry indirect single-rule evidence: " +
      "MAT-self-review (M2/M3) and BB-closing-reviewer (W1/W3) in " +
      "probes/blackboxtests.mjs.",
  },
  {
    block: "BBX-run-preamble",
    member: "Confirm with AskUserQuestion / Case review / Definition of Done / Pipeline order",
    group: "both",
    reason:
      "Four of the block's six members are unobservable here. The two " +
      "AskUserQuestion-shaped ones cannot fire with the tool in the " +
      "lockdown — and it has to stay there, since a successful call voids " +
      "the run. `Definition of Done` and `Pipeline order` produce no " +
      "artifact of their own; the phase order they mandate is only visible " +
      "as narration, which no probe here scores. bx-preamble-assumed-kw and " +
      "bx-preamble-readfull-rf measure the two members that do reach disk, " +
      "so a verdict on this block is a verdict on those two and must be " +
      "reported that way.",
  },
  {
    block: "BBX-reporting-and-status",
    member: "Report the path (the authoring-side member)",
    group: "Writing the cases",
    reason:
      "It reports the path of the blackbox.md a WRITING run emitted, plus " +
      "the depth and what triggered it. No materializing shape emits a " +
      "blackbox.md, so the member cannot fire on any fixture in this file. " +
      "Its depth clause is separately in play through bx-depth-missing-nd. " +
      "The authoring-half file is better placed if it is measured at all.",
  },
];

// Kept for symmetry with probes/blackboxtests.mjs and probes/bbxcases.mjs,
// whose exports are lowercase; both names point at the same array.
export const unprobeable = UNPROBEABLE;
