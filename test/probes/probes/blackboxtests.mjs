/**
 * Stage 4 — the UNCERTAIN principles of kcc-dev-core.blackbox-tests.
 *
 * Seven task shapes, reused across sixteen rules. The shape is the
 * prompt+fixture; the arm is which rule got ablated, so one rich fixture
 * pays for six or seven probes. Shapes are named W* (authoring cases) and
 * M* (materializing them), matching the skill's two principle groups.
 *
 *   W1  report export: ONE pinned endpoint, several unpinned sibling
 *       behaviours, a privileged delete, a locale-rendered filename, a
 *       free-text field, and a 7-day window whose far side nobody specified
 *   W2  a fully-pinned focused change — nothing to defer, and one
 *       requirement worded as "nothing changes"
 *   W3  org members UI, full depth: no HTTP surface pinned at all, a
 *       uniqueness constraint on free text, a modal, nine shipping
 *       languages, and a hole where the last admin leaves
 *   W4  a fully-pinned CLI flag — thin output, nothing pending, an
 *       RFC-3339 timestamp
 *   M1  thirteen cases into a repo that ALREADY has an isolated e2e
 *       suite, whose conventions lure an orphan test, a transitive
 *       implementation import, and a by-type file split
 *   M2  three cases, below every conformance-review trigger, each Then
 *       narrow while the response body on screen is fat
 *   M3  four CLI cases with two-clause Thens and real Cleanup
 *
 * Every observable is read off a Write/Edit/Bash tool-call input or off
 * `writtenPaths` — the artifact the run actually produced — never off the
 * model's narration. Judges appear twice, both on "assert that nothing
 * changed", which has a hundred faithful phrasings and no regex.
 *
 * Fixtures all plant package.json: kcc-dev-core's SessionStart hook
 * injects nothing outside a software project, and without the injection
 * every run voids as "arm sentinel absent".
 *
 * Rule ids used here and the registry entries they need (rules.mjs is
 * owned elsewhere; all sixteen are one-line bullets in
 * skills/blackbox-tests/SKILL.md, five of them snippet-only because a
 * whole-bullet cut would take KEEP-verdict text with it):
 *
 *   BB-invented-endpoints  anchor  - **No invented endpoints**
 *   BB-vague-oracle        snippet drop: "works correctly", "same as before",
 *   BB-locale-oracle       anchor  - **Locale oracle**
 *   BB-privilege-oracle    anchor  - **Privilege oracle**
 *   BB-text-encoding       anchor  - **Text-encoding angle**
 *   BB-localization        anchor  - **Localization angle**
 *   BB-keyboard            anchor  - **Keyboard angle**
 *   BB-closing-reviewer    anchor  - **Closing reviewer**  PLUS a snippet
 *                          deleting the whole - **Reviewer at both depths**
 *                          line, which has no antecedent once the first is gone
 *   BB-pending-conditional snippet "appears only when open items or unpinned
 *                          surfaces exist, holding" -> "holds"
 *   MAT-whitebox-elsewhere anchor  - **White-box tests are elsewhere**
 *   MAT-read-in-full       anchor  - **Read it in full**
 *   MAT-file-group         anchor  - **One file group per slug**
 *   MAT-extend-suite       snippet ", and whenever the repo already has a suite
 *                          meeting the isolation constraint," -> ","
 *   MAT-lint-boundary      anchor  - **Lint the boundary**
 *   MAT-no-orphan          snippet drop: ", and no test exists without a BB-ID"
 *   MAT-self-review        anchor  - **Self-review below the bar**
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";


// Read/Glob/Grep/Bash/Write/Edit stay open — every probe here is scored on
// a file the run wrote. AskUserQuestion joins the lockdown: the skill's
// materializing half mandates it, a successful call would void the run as
// an unexpected tool, and both arms carry the same "non-interactive" line
// in the prompt, so the gate closes identically on each side.
const AUTHORING = [
  "WebFetch", "WebSearch", "NotebookEdit", "AskUserQuestion", ...NO_DELEGATION,
];
const AUTHORING_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit"];

const NON_INTERACTIVE =
  "这是非交互会话：不要向我提问，需要确认的地方自己判断、照做，并在最后说明你怎么定的。";

// ---- observables ------------------------------------------------------
//
// The runner deletes the sealed workspace after scoring, and `score(run)`
// is handed the transcript rather than a directory, so "read off disk" is
// read off the tool-call inputs that produced the disk state. Bash counts:
// a model that writes with a heredoc produced the same artifact, and
// dropping those runs would bias whichever arm happens to prefer the shell.

const BB_MD = /blackbox\.md/;
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$/;

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

const caseFile = (run) => writtenBody(run, BB_MD);

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

/** Lines carrying a **Then** clause — the only place an oracle can hide. */
const thenLines = (body) => body.split("\n").filter((l) => /\*\*Then\*\*/.test(l));

/**
 * Every METHOD /path token in the artifact, path-normalized so
 * /api/exports/42, /api/exports/{id} and /api/exports/:id collapse onto
 * one another. An endpoint outside the spec's pinned set was invented.
 */
function endpointsIn(body) {
  const out = new Set();
  const re = /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+`?(\/[A-Za-z0-9_\-{}<>:./]*)/g;
  for (const m of body.matchAll(re)) {
    out.add(
      m[1]
        .replace(/[?#].*$/, "")
        .replace(/\/(?:\{[^}]*\}|:[A-Za-z_]\w*|<[^>]*>|[0-9a-f]{8,}|\d+)/g, "/{id}")
        .replace(/\/+$/, "")
    );
  }
  return [...out];
}

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
 * either a directory named for the slug, or a single directory in which
 * every filename carries it. A by-surface or by-group split fails.
 */
function oneFileGroup(run, slug) {
  const paths = [...new Set(testFiles(run).map((f) => f.path))];
  if (paths.length === 0) return false;
  const dir = commonDir(paths);
  if (dir.includes(slug)) return true;
  const sameDir = paths.every((p) => p.slice(0, p.lastIndexOf("/")) === dir);
  return sameDir && paths.every((p) => p.slice(dir.length).includes(slug));
}

/** Test titles, across the harness dialects a fixture could pick. */
function testTitles(body) {
  const out = [];
  for (const m of body.matchAll(/\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\1/g)) {
    out.push(m[2]);
  }
  for (const m of body.matchAll(/\bdef\s+(test_\w+)/g)) out.push(m[1]);
  return out;
}

const hasTestFor = (run, id) => new RegExp(id, "i").test(testBodies(run));

/** The `## Pending cases` block, or null when the heading is absent. */
function pendingBlock(body) {
  const m = body.match(/^##\s+Pending cases[^\n]*$/im);
  if (!m) return null;
  return body.slice(m.index + m[0].length).split(/^##\s/m)[0];
}
function pendingIsHonest(body) {
  if (body.trim().length === 0) return false;
  const block = pendingBlock(body);
  if (block === null) return true;
  return block
    .split("\n")
    .some(
      (l) =>
        /^\s*[-*]\s+\S/.test(l) &&
        !/^\s*[-*]\s*(?:none|n\/?a|no pending|nothing)\b/i.test(l)
    );
}

// A literal where a format rule belongs: a rendered date, a grouped
// number, a spelled-out month. A case that quotes the FORMAT (YYYY-MM-DD,
// RFC 3339) carries no digits and does not match.
const RENDERED_LITERAL =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{1,3}(?:\.\d{3})+,\d+\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/;

const ENCODING_ANGLE =
  /homoglyph|confusabl|normali[sz]|\bNFC\b|\bNFD\b|\bNFK[CD]\b|zero[- ]?width|\bbi-?di\b|right-to-left override|combining (?:character|mark)|full-?width/i;
const L10N_ANGLE =
  /right-to-left|\bRTL\b|\bLTR\b|pseudo-?locali[sz]|(?:string|text|translation)\s+expansion|translat\w*\s+(?:length|longer|expand)|\bi18n\b|\bArabic\b|\bHebrew\b/i;
// "focus is trapped" and "focus stays" are as much the angle as "focus
// trap" is; an earlier, tighter version of this scored the first two as
// absent. Bare \bfocus\b is deliberately not accepted — it would match
// "focused" nowhere, but it would match unrelated prose.
const KEYBOARD_ANGLE =
  /keyboard|screen reader|arrow keys?|\ba11y\b|accessib|focus (?:order|trap|ring|management|is|stays|remains|returns|moves)|\btab (?:key|order|index|stop|through|to)\b|tabbing/i;

/** Path test that holds for an absolute file_path and a relative one. */
const under = (dir) => new RegExp(`(?:^|/)${dir}/`);
const IN_E2E = under("e2e");
const IN_SOURCE = /(?:^|\/)(?:src|lib|app)\//;

// A test that imports the implementation is a white-box test wearing a
// black-box file name.
const SRC_IMPORT =
  /(?:\.\.\/)+(?:src|lib)\/|from\s+['"][^'"]*\/(?:src|lib)\/|require\(['"][^'"]*\/(?:src|lib)\//;

// Reaching around the contracted surface, direct or transitive.
const BOUNDARY_LEAK =
  /(?:\.\.\/)+src\/|from\s+['"][^'"]*\/src\/|require\(['"][^'"]*\/src\/|helpers\/auth|mintToken|helpers\/db|\brequire\(['"](?:pg|knex|mongoose|sqlite3|ioredis|redis)['"]|from\s+['"](?:pg|knex|mongoose|sqlite3|ioredis|redis)['"]/;

const MANIFEST =
  /(?:^|\/)(?:package\.json|pyproject\.toml|requirements\.txt|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock)$/;

// ---- shape W1: one pinned endpoint, several unpinned siblings ----------
//
// Traps, all planted:
//   FR-04 / FR-05 name behaviours whose surface OI-2 says is undesigned —
//     the pull is to invent DELETE /api/exports/{id}/cancel and a
//     download URL (BB-invented-endpoints).
//   FR-06 pins a privileged DELETE, so the 403 case is writable and the
//     pull is to assert the refusal alone (BB-privilege-oracle).
//   FR-07 renders a date per locale while OI-1 leaves the timezone open,
//     so any literal date is indefensible (BB-locale-oracle).
//   FR-02's free-text name feeds a filename (BB-text-encoding); the nine
//     shipping languages sit in Scope, NOT in a requirement, so
//     coverage-per-requirement cannot manufacture the l10n case for free
//     (BB-localization); the Exports table and its download control carry
//     the keyboard angle (BB-keyboard).
//   FR-05 pins a 7-day window and says nothing about the far side of it.
//     The word "expire" appears nowhere in the fixture, so any expiry
//     token in the artifact is the review talking (BB-closing-reviewer).
const W1_SPEC = `# Spec — Scheduled Report Export

## Summary & Scope

Analysts export a saved report to CSV from the Reports page and pick it up
later from an Exports page. In scope: starting an export, listing exports,
deleting one, downloading the finished file. Out of scope: the report
builder itself. The Exports page ships in nine languages, Arabic and
Hebrew among them.

## User Stories

- US-01: As an analyst, I want to export a saved report to CSV, so that I
  can share the numbers with people who do not have an account.
- US-02: As an analyst, I want my recent exports on one page, so that I can
  download an earlier one again without re-running it.
- US-03: As an org admin, I want to delete an export somebody else created,
  so that stale files stop eating the org's storage quota.

## Functional Requirements

- FR-01: POST /api/reports/export accepts { reportId, rows, name } and
  answers 202 with { exportId }.
- FR-02: rows accepts 1 to 100000 inclusive. name is free text of 1 to 80
  characters.
- FR-03: The Exports page at /exports lists the caller's own exports,
  newest first, showing name, row count and status.
- FR-04: An analyst can cancel an export that is still running.
- FR-05: A finished export is downloadable for 7 days after it finishes.
- FR-06: DELETE /api/exports/{exportId} removes a saved export. Only the
  export's creator or an org admin may call it; anybody else is refused
  with 403.
- FR-07: The downloaded file's name embeds the export's finish date,
  rendered in the viewer's locale.

## Non-functional Requirements

- NFR-01: An export of 100000 rows finishes within 60 seconds.
- NFR-02: The export endpoint must be secure.

## System Design

POST /api/reports/export and DELETE /api/exports/{exportId} are the only
pinned HTTP surfaces. The Exports page is the route /exports; its rows
carry a download control.

## Edge Cases

1. Two exports of the same report started at the same moment.
2. An export whose underlying report is deleted while it is still running.

## Open Items

- OI-1: Which timezone the finish date is rendered in is undecided.
- OI-2: The cancel surface and the download surface are not designed yet.
`;

const W1_FIXTURE = {
  "package.json": JSON.stringify(
    { name: "reporting-app", private: true, scripts: { test: "vitest run" } },
    null,
    2
  ),
  ".kcc/specs/report-export/spec.md": W1_SPEC,
};

const W1_PROMPT =
  "把 .kcc/specs/report-export/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape W2: fully pinned, focused, nothing to defer ------------------
//
// Every surface pinned, every NFR quantified, Open Items explicitly empty,
// one surface touched with no new persistence, concurrency, money or
// permissions — so Depth is focused and there is genuinely nothing to put
// under Pending (BB-pending-conditional). FR-04 is worded as "nothing
// about the file changes", which invites a regression oracle without ever
// using the banned phrases itself (BB-vague-oracle).
const W2_SPEC = `# Spec — CSV delimiter preference

## Summary & Scope

The CSV export gains an optional delimiter field. One endpoint changes.
Storage, permissions and pricing are untouched.

## User Stories

- US-01: As an analyst whose spreadsheet expects semicolons, I want to
  choose the CSV delimiter, so that the file opens without an import
  wizard.

## Functional Requirements

- FR-01: POST /api/reports/export accepts an optional delimiter field whose
  only two accepted values are the one-character strings "," and ";".
- FR-02: With delimiter omitted, the export uses ",".
- FR-03: Any other value is refused with 400 and the body
  { "error": "delimiter must be , or ;" }, that exact string.
- FR-04: With delimiter omitted, nothing about the produced file changes.
- FR-05: The chosen delimiter is echoed in the 202 response body, which
  becomes { exportId, delimiter }.

## Non-functional Requirements

- NFR-01: The added validation costs no more than 5 ms at p99.

## System Design

POST /api/reports/export is the only surface touched. No schema change, no
new table, no new permission check.

## Edge Cases

1. delimiter sent as an empty string, which FR-03 refuses.
2. delimiter sent as the two-character string ",,", which FR-03 refuses.

## Open Items

None. Every decision above is settled and every surface named above is
pinned.
`;

const W2_FIXTURE = {
  "package.json": JSON.stringify(
    { name: "reporting-app", private: true, scripts: { test: "vitest run" } },
    null,
    2
  ),
  ".kcc/specs/csv-delimiter/spec.md": W2_SPEC,
};

const W2_PROMPT =
  "把 .kcc/specs/csv-delimiter/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape W3: rich UI, full depth, a hole nobody wrote down -----------
//
// No HTTP path is pinned anywhere, so the allow-list is empty and any
// METHOD /path token in the artifact was invented to prepare state
// (BB-invented-endpoints, a different pull from W1's: missing setup
// surface rather than missing sibling behaviour).
// FR-03's case-insensitive uniqueness on free text is where homoglyphs and
// normalization live (BB-text-encoding); the nine languages and the
// fixed-width role chip sit in Scope, not in a requirement
// (BB-localization); the confirm modal carries the keyboard angle
// (BB-keyboard); FR-05 is the privileged action (BB-privilege-oracle);
// Edge Cases item 3 is worded vaguely enough to be echoed straight into a
// Then (BB-vague-oracle).
// The hole: nothing anywhere says what happens when the org's only admin
// is removed or leaves. "last", "sole" and "only admin" appear nowhere in
// the fixture (BB-closing-reviewer).
const W3_SPEC = `# Spec — Org member management

## Summary & Scope

Org admins manage who is in the org from a Members page. In scope: viewing
members, inviting one, changing a role, removing a member. Out of scope:
billing seats. The page ships in nine languages, Arabic and Hebrew among
them, and the role column renders as a fixed-width chip.

## User Stories

- US-01: As an org admin, I want to see everyone in my org with their role,
  so that I can audit access.
- US-02: As an org admin, I want to invite somebody by email, so that they
  can join without me filing a ticket.
- US-03: As an org admin, I want to remove a member, so that somebody who
  left the company loses access.
- US-04: As a member, I want to see the member list, so that I know who to
  ask for help.

## Functional Requirements

- FR-01: The Members page lists every member of the caller's org with
  display name, email and role, sorted by display name.
- FR-02: A role is exactly one of member or admin.
- FR-03: A display name is free text of 1 to 64 characters and must be
  unique within the org, compared case-insensitively.
- FR-04: The Invite dialog takes an email and a role and adds a pending
  member to the list immediately.
- FR-05: Only an admin may remove another member. For a member the Remove
  control is disabled, and the underlying request is refused with 403.
- FR-06: Remove opens a confirm dialog naming the member; the member is
  removed only after the dialog is confirmed.
- FR-07: The list header shows how many seats are used, and each row shows
  the date the member joined, both rendered in the viewer's locale.

## Non-functional Requirements

- NFR-01: The Members page renders its first 50 rows within 800 ms at p95.
- NFR-02: Every membership change is written to the audit log within 1
  second.

## System Design

The Members page is the route /settings/members. Members are seeded only
by an admin using the Invite dialog. The page talks to the members API;
its paths are owned by the platform team and are not pinned here.

## Edge Cases

1. An org with exactly one member.
2. An invite sent to an email that is already a member.
3. If a member's avatar image fails to load the page should degrade
   gracefully.

## Open Items

- OI-1: Whether a removed member keeps read access for a grace period is
  undecided.
`;

const W3_FIXTURE = {
  "package.json": JSON.stringify(
    { name: "console-web", private: true, scripts: { test: "vitest run" } },
    null,
    2
  ),
  ".kcc/specs/org-members/spec.md": W3_SPEC,
};

const W3_PROMPT =
  "把 .kcc/specs/org-members/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape W4: a fully pinned CLI flag, thin output --------------------
//
// The second nothing-is-pending shape, and deliberately unlike W2: a CLI
// surface, and so little to say that padding the file with the template's
// Pending heading is the natural filler (BB-pending-conditional). The
// finishedAt field is pinned as a format with no example value, so a
// literal timestamp in a Then came from the model (BB-locale-oracle).
const W4_SPEC = `# Spec — report-cli export --format

## Summary & Scope

The export subcommand of report-cli gains a --format flag. Nothing else
about the CLI changes.

## User Stories

- US-01: As an operator scripting exports, I want machine-readable output,
  so that I can pipe the export id into the next command.

## Functional Requirements

- FR-01: report-cli export accepts --format with exactly two accepted
  values, text and json.
- FR-02: With --format omitted the command behaves as text.
- FR-03: With --format json the command prints one JSON object to stdout
  with exactly three keys: exportId (string), rows (number), finishedAt
  (an RFC 3339 timestamp in UTC).
- FR-04: With --format json nothing is written to stderr and the exit code
  is 0.
- FR-05: Any other --format value exits 2 and prints exactly
  "report-cli: --format must be text or json" to stderr.
- FR-06: With --format omitted the command's stdout is byte-identical to
  what it prints today.

## Non-functional Requirements

- NFR-01: The flag adds no more than 10 ms to the command's wall time.

## System Design

report-cli export is the only surface touched. The flag is parsed in the
existing argument parser; no config file, no environment variable.

## Edge Cases

1. --format passed with an empty value.
2. --format passed twice with different values, where the last wins.

## Open Items

None. Every accepted value, exit code and message above is pinned.
`;

const W4_FIXTURE = {
  "package.json": JSON.stringify(
    { name: "report-cli", private: true, bin: { "report-cli": "bin/report-cli.js" } },
    null,
    2
  ),
  ".kcc/specs/export-format-flag/spec.md": W4_SPEC,
};

const W4_PROMPT =
  "把 .kcc/specs/export-format-flag/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape M1: thirteen cases into a repo that already has a suite -----
//
// Every lure here is a repo convention, which is the strongest pull there
// is — following it is normally the right instinct:
//   e2e/ is already an isolated package with its own manifest and lockfile,
//     so standing up a second test project is pure re-scaffolding
//     (MAT-extend-suite).
//   e2e/ is laid out BY TYPE (api/, ui/), so splitting this feature across
//     two directories reads as house style (MAT-file-group).
//   Every existing spec opens with an "api is reachable" guard, a test
//     with no case behind it (MAT-no-orphan).
//   helpers/auth.js is the documented way to authenticate and it reaches
//     into src/auth/token.js — an isolation breach that only a pass over
//     the written tests catches, since the test file itself looks clean
//     (MAT-lint-boundary).
//   The README says format-level checks that need no server are usually
//     done as unit tests against src/, and BB-N02 is exactly such a check
//     with no environment to run against (MAT-whitebox-elsewhere).
//   BB-C05 carries [EXTERNAL-SETUP: blocked] on its Traces line, not its
//     Mode line, so a grep for "Mode: automated" materializes it; BB-N03
//     is the last automated case in the file (MAT-read-in-full).
const M1_BLACKBOX = `# Black-box Test Cases — Scheduled Report Export

Depth: full

## Main Flow

### BB-M01: start an export
- Traces to: FR-01, US-01
- Priority: P0
- Mode: automated
- Surface: POST /api/reports/export
- Setup: create one saved report through POST /api/reports
- **Given** an authenticated analyst and one saved report
- **When** the analyst posts { reportId, rows: 10, name: "Q3 revenue" }
- **Then** the response status is 202 and its body carries a non-empty exportId

### BB-M02: a started export is listed on the exports page
- Traces to: FR-03, US-02
- Priority: P0
- Mode: automated
- Surface: the Exports page at /exports
- Setup: start one export through POST /api/reports/export
- **Given** an analyst with exactly one export
- **When** the analyst opens /exports
- **Then** the list shows one row carrying that export's name and row count

### BB-M03: the creator deletes their own export
- Traces to: FR-06
- Priority: P0
- Mode: automated
- Surface: DELETE /api/exports/{exportId}
- Setup: start one export as the analyst through POST /api/reports/export
- Cleanup: none, the case ends with the export deleted
- **Given** an export created by this analyst
- **When** the analyst deletes it
- **Then** the response status is 204 and /exports no longer lists it

### BB-M04: an org admin deletes somebody else's export
- Traces to: FR-06, US-03
- Priority: P1
- Mode: automated
- Surface: DELETE /api/exports/{exportId}
- Setup: start one export as the analyst through POST /api/reports/export
- **Given** an export created by an analyst, and an authenticated org admin
- **When** the admin deletes it
- **Then** the response status is 204 and /exports no longer lists it for the analyst

## Corner Cases

### BB-C01: rows at the cap
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/reports/export
- **Given** an authenticated analyst and one saved report
- **When** the analyst posts rows: 100000
- **Then** the response status is 202

### BB-C02: rows one past the cap
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/reports/export
- **Given** an authenticated analyst and one saved report
- **When** the analyst posts rows: 100001
- **Then** the response status is 400

### BB-C03: empty name
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/reports/export
- **Given** an authenticated analyst and one saved report
- **When** the analyst posts name: ""
- **Then** the response status is 400

### BB-C04: a stranger cannot delete an export
- Traces to: FR-06
- Priority: P0
- Mode: automated
- Surface: DELETE /api/exports/{exportId}
- Setup: start one export as the analyst through POST /api/reports/export
- **Given** an export created by the analyst and a second, unrelated member
- **When** the second member deletes it
- **Then** the response status is 403 and the analyst still sees the export on /exports

### BB-C05: a corrupted export file surfaces as a failed status
- Traces to: FR-03, [EXTERNAL-SETUP: blocked — no external surface can produce a corrupted export file]
- Priority: P2
- Mode: automated
- Surface: the Exports page at /exports
- **Given** an export whose file is corrupted on disk
- **When** the analyst opens /exports
- **Then** that export's status reads failed

### BB-C06: the exports page reads sensibly on a narrow phone viewport
- Traces to: FR-03
- Priority: P2
- Mode: llm-driven
- Surface: the Exports page at /exports
- **Given** an analyst with three exports
- **When** the page is opened at a 360 px viewport
- **Then** every row's name, row count and status stay legible and reachable

## Non-functional

### BB-N01: a full-cap export finishes inside the budget
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: POST /api/reports/export
- **Given** an authenticated analyst and one saved report
- **When** the analyst exports 100000 rows and polls /exports until the status is done
- **Then** the status reaches done within 60 seconds

### BB-N02: the downloaded filename carries the finish date
- Traces to: FR-07
- Priority: P1
- Mode: automated
- Surface: the download control on /exports
- **Given** a finished export
- **When** the analyst downloads it
- **Then** the filename matches the locale-independent shape report-<name>-<date>.csv, where <date> is four digits, a dash, two digits, a dash, two digits

### BB-N03: the exports page still renders for a user with no exports
- Traces to: FR-03, [PRE-IMPL: green — existing behavior]
- Priority: P2
- Mode: automated
- Surface: the Exports page at /exports
- **Given** an authenticated analyst with zero exports
- **When** the analyst opens /exports
- **Then** the page renders with an empty list and no error

## Pending cases (blocked by open items)

- Cancelling a running export leaves it in a cancelled state and stops
  billing its rows, blocked by OI-2: no cancel surface is designed yet
`;

const M1_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "reporting-app",
      private: true,
      scripts: { test: "vitest run" },
      dependencies: { express: "^4.19.2", pg: "^8.11.5" },
    },
    null,
    2
  ),
  "src/auth/token.js":
    "const crypto = require('node:crypto');\n\n" +
    "function signToken(role) {\n" +
    "  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev')\n" +
    "    .update(JSON.stringify({ role })).digest('hex');\n" +
    "}\n\nmodule.exports = { signToken };\n",
  "src/exports/service.js":
    "function formatFilename(name, finishedAt) {\n" +
    "  const d = finishedAt.toISOString().slice(0, 10);\n" +
    "  return 'report-' + name.replace(/[^a-z0-9]+/gi, '-') + '-' + d + '.csv';\n" +
    "}\n\nmodule.exports = { formatFilename };\n",
  "e2e/package.json": JSON.stringify(
    {
      name: "reporting-app-e2e",
      private: true,
      scripts: { test: "playwright test" },
      devDependencies: { "@playwright/test": "^1.45.0", undici: "^6.19.2" },
    },
    null,
    2
  ),
  "e2e/package-lock.json": JSON.stringify(
    { name: "reporting-app-e2e", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "e2e/README.md":
    "# End-to-end suite\n\n" +
    "Its own package, its own lockfile. Runs against BASE_URL over HTTP and\n" +
    "the browser; it is never imported by the app and never imports the app.\n\n" +
    "Conventions\n\n" +
    "- Specs live under api/ or ui/ depending on the surface they drive.\n" +
    "- Every spec opens with the reachability guard, see api/health.spec.js.\n" +
    "- Authentication: helpers/auth.js exports mintToken(role); use it in\n" +
    "  beforeAll instead of driving the login form every time.\n" +
    "- Format-level checks that need no running server are usually done as\n" +
    "  unit tests against src/ directly rather than added here.\n",
  "e2e/helpers/auth.js":
    "const { signToken } = require('../../src/auth/token');\n\n" +
    "function mintToken(role) {\n  return signToken(role);\n}\n\n" +
    "module.exports = { mintToken };\n",
  "e2e/api/health.spec.js":
    "const { test, expect } = require('@playwright/test');\n\n" +
    "test('api is reachable', async ({ request }) => {\n" +
    "  const res = await request.get(process.env.BASE_URL + '/healthz');\n" +
    "  expect(res.status()).toBe(200);\n});\n",
  "e2e/ui/login.spec.js":
    "const { test, expect } = require('@playwright/test');\n\n" +
    "test('api is reachable', async ({ request }) => {\n" +
    "  const res = await request.get(process.env.BASE_URL + '/healthz');\n" +
    "  expect(res.status()).toBe(200);\n});\n\n" +
    "test('login page renders', async ({ page }) => {\n" +
    "  await page.goto(process.env.BASE_URL + '/login');\n" +
    "  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();\n});\n",
  ".kcc/specs/report-export/blackbox.md": M1_BLACKBOX,
};

const M1_PROMPT =
  "把 .kcc/specs/report-export/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape M2: three cases, below every review trigger -----------------
//
// Depth focused, three cases, no concurrency, money or permissions — so
// the conformance reviewer is not required and whatever conformance
// happens is the self-review (MAT-self-review). Each Surface block shows a
// fat response body while each Then pins exactly one field, so
// requestId / schemaVersion / createdAt can only appear in a test that
// asserted past its case.
// Secondary duty: the existing e2e suite is Playwright while these cases
// are pure HTTP, which makes a fresh harness feel like the better fit
// (MAT-extend-suite, a different pull from M1's by-type layout); the
// README points at a knex seeding helper (MAT-lint-boundary);
// src/quotes/validate.js holds the exact rule BB-C01 checks
// (MAT-whitebox-elsewhere); the three cases sit one per group, which is
// where a per-group file split comes from (MAT-file-group); the last case
// carries its [PRE-IMPL: green] marker on the Traces line
// (MAT-read-in-full).
const M2_BLACKBOX = `# Black-box Test Cases — Quote note

Depth: focused

## Main Flow

### BB-M01: attach a note to a quote
- Traces to: FR-01
- Priority: P0
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/note, which answers
  { id, note, createdAt, requestId, schemaVersion }
- Setup: create one quote through POST /api/quotes
- **Given** an authenticated seller and one saved quote
- **When** the seller posts { note: "call back Tuesday" }
- **Then** the response status is 201

## Corner Cases

### BB-C01: a note one character past the cap
- Traces to: FR-02
- Priority: P1
- Mode: automated
- Surface: POST /api/quotes/{quoteId}/note, which answers
  { error, requestId, schemaVersion } on refusal
- Setup: create one quote through POST /api/quotes
- **Given** an authenticated seller and one saved quote
- **When** the seller posts a note of 501 characters
- **Then** the response body's error field is exactly note_too_long

## Non-functional

### BB-N01: the quote detail endpoint stays inside its budget
- Traces to: NFR-01, [PRE-IMPL: green — existing behavior]
- Priority: P1
- Mode: automated
- Surface: GET /api/quotes/{quoteId}, which answers
  { id, total, createdAt, requestId, schemaVersion }
- Setup: create one quote through POST /api/quotes
- **Given** one saved quote
- **When** the seller fetches it
- **Then** the response arrives within 300 ms
`;

const M2_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "quotes-api",
      private: true,
      scripts: { test: "vitest run" },
      dependencies: { fastify: "^4.28.0", knex: "^3.1.0" },
    },
    null,
    2
  ),
  "src/quotes/validate.js":
    "const NOTE_MAX = 500;\n\n" +
    "function noteTooLong(note) {\n  return note.length > NOTE_MAX;\n}\n\n" +
    "module.exports = { noteTooLong, NOTE_MAX };\n",
  "e2e/package.json": JSON.stringify(
    {
      name: "quotes-api-e2e",
      private: true,
      scripts: { test: "playwright test" },
      devDependencies: { "@playwright/test": "^1.45.0" },
    },
    null,
    2
  ),
  "e2e/package-lock.json": JSON.stringify(
    { name: "quotes-api-e2e", lockfileVersion: 3, packages: {} },
    null,
    2
  ),
  "e2e/README.md":
    "# End-to-end suite\n\n" +
    "Its own package and lockfile. Today it drives the browser with\n" +
    "Playwright; the API specs use Playwright's request fixture.\n\n" +
    "Conventions\n\n" +
    "- Seeding: helpers/db.js opens knex against DATABASE_URL and exposes\n" +
    "  seedQuote(); most specs call it in beforeEach because it is faster\n" +
    "  than going through the API.\n" +
    "- Rules that are pure functions are usually covered as unit tests\n" +
    "  against src/ instead of here.\n",
  "e2e/helpers/db.js":
    "const knex = require('knex');\n\n" +
    "const db = knex({ client: 'pg', connection: process.env.DATABASE_URL });\n\n" +
    "async function seedQuote(total) {\n" +
    "  const [row] = await db('quotes').insert({ total }).returning('*');\n" +
    "  return row;\n}\n\nmodule.exports = { db, seedQuote };\n",
  "e2e/ui/quotes.spec.js":
    "const { test, expect } = require('@playwright/test');\n\n" +
    "test('quotes page renders', async ({ page }) => {\n" +
    "  await page.goto(process.env.BASE_URL + '/quotes');\n" +
    "  await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();\n});\n",
  ".kcc/specs/quote-note/blackbox.md": M2_BLACKBOX,
};

const M2_PROMPT =
  "把 .kcc/specs/quote-note/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，服务没有跑起来。" +
  NON_INTERACTIVE;

// ---- shape M3: four CLI cases, two-clause Thens, real Cleanup ----------
//
// The other side of the conformance question from M2. Here the pull is to
// assert LESS than the case says: every Then has a second clause about
// stderr, and every case has a Cleanup that costs an extra command. Both
// tokens are unmistakably case text, so their absence is under-assertion
// rather than paraphrase (MAT-self-review).
const M3_BLACKBOX = `# Black-box Test Cases — report-cli export --format

Depth: focused

## Main Flow

### BB-M01: json output carries exactly the three pinned keys
- Traces to: FR-03
- Priority: P0
- Mode: automated
- Surface: report-cli export --format json
- Setup: create one export through report-cli export --create
- Cleanup: report-cli export --delete <exportId>
- **Given** one finished export
- **When** the operator runs report-cli export --format json
- **Then** stdout parses as one JSON object whose keys are exactly exportId,
  rows and finishedAt, and stderr is empty

### BB-M02: the default stays text
- Traces to: FR-02
- Priority: P0
- Mode: automated
- Surface: report-cli export
- Setup: create one export through report-cli export --create
- Cleanup: report-cli export --delete <exportId>
- **Given** one finished export
- **When** the operator runs report-cli export with no --format
- **Then** stdout does not parse as JSON, and stderr is empty

## Corner Cases

### BB-C01: an unknown format value
- Traces to: FR-05
- Priority: P1
- Mode: automated
- Surface: report-cli export --format yaml
- Setup: create one export through report-cli export --create
- Cleanup: report-cli export --delete <exportId>
- **Given** one finished export
- **When** the operator runs report-cli export --format yaml
- **Then** the exit code is 2, and stderr is exactly
  "report-cli: --format must be text or json"

### BB-C02: an empty format value
- Traces to: FR-05, §Edge Cases item #1
- Priority: P1
- Mode: automated
- Surface: report-cli export --format ""
- Setup: create one export through report-cli export --create
- Cleanup: report-cli export --delete <exportId>
- **Given** one finished export
- **When** the operator runs report-cli export --format ""
- **Then** the exit code is 2, and stderr is exactly
  "report-cli: --format must be text or json"
`;

const M3_FIXTURE = {
  "package.json": JSON.stringify(
    {
      name: "report-cli",
      private: true,
      bin: { "report-cli": "bin/report-cli.js" },
      scripts: { test: "node --test" },
    },
    null,
    2
  ),
  "bin/report-cli.js":
    "#!/usr/bin/env node\n" +
    "const { render } = require('../src/format');\n" +
    "process.stdout.write(render(process.argv.slice(2)));\n",
  "src/format.js":
    "function render(argv) {\n  return 'export 1 ready\\n';\n}\n\n" +
    "module.exports = { render };\n",
  ".kcc/specs/export-format-flag/blackbox.md": M3_BLACKBOX,
};

const M3_PROMPT =
  "把 .kcc/specs/export-format-flag/blackbox.md 里的自动化用例落成可以跑的测试代码。" +
  "现在还没有可用的运行环境，命令行工具本身还没实现。" +
  NON_INTERACTIVE;

// ---- shapes as reusable halves of a probe ------------------------------

const W1 = { prompt: W1_PROMPT, fixture: W1_FIXTURE, maxBudgetUsd: 1.2 };
const W2 = { prompt: W2_PROMPT, fixture: W2_FIXTURE, maxBudgetUsd: 1.0 };
const W3 = { prompt: W3_PROMPT, fixture: W3_FIXTURE, maxBudgetUsd: 1.2 };
const W4 = { prompt: W4_PROMPT, fixture: W4_FIXTURE, maxBudgetUsd: 1.0 };
const M1 = { prompt: M1_PROMPT, fixture: M1_FIXTURE, maxBudgetUsd: 2.2 };
const M2 = { prompt: M2_PROMPT, fixture: M2_FIXTURE, maxBudgetUsd: 1.4 };
const M3 = { prompt: M3_PROMPT, fixture: M3_FIXTURE, maxBudgetUsd: 1.4 };

const on = (shape, rest) => ({
  ...shape,
  disallowedTools: AUTHORING,
  expectedTools: AUTHORING_TOOLS,
  ...rest,
});

/**
 * The artifact from its first case heading on. A spec's own Scope prose is
 * quotable into a file's preamble, and scoring an angle off a quote would
 * count the fixture rather than the model.
 */
function casesOnly(body) {
  const m = body.match(/^###\s+BB-/m);
  return m ? body.slice(m.index) : "";
}

const VAGUE_REGRESSION =
  /works? correctly|works? as expected|same as before|same as (?:it is )?today|unchanged|nothing changes|no visible (?:change|difference)|identical to (?:before|today)/i;
const VAGUE_SOFT =
  /works? correctly|works? as expected|degrades? gracefully|behaves? sensibly|looks? (?:right|fine|correct)|reasonabl[ey]|sensibl[ey]/i;
const RENDERED_DATE =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/;
const GROUPED_NUMBER = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{1,3}(?:\.\d{3})+,\d+\b/;

const noThenMatches = (run, re) => {
  const body = caseFile(run);
  if (body.trim().length === 0) return false;
  return !thenLines(body).some((l) => re.test(l));
};
const anglePresent = (run, re) => re.test(casesOnly(caseFile(run)));
const onlyAllowedEndpoints = (run, allowed) => {
  const body = caseFile(run);
  if (body.trim().length === 0) return false;
  return endpointsIn(casesOnly(body)).every((p) => allowed.includes(p));
};

const PRIVILEGE_RUBRIC = (setup) =>
  "The text below is a black-box test case file written from a spec. " +
  setup +
  "\n\nQuestion: for the case covering that refusal, does the **Then** assert " +
  "BOTH that the attempt is refused AND that nothing changed — the target " +
  "still exists, the list still shows it, no state moved?\n\n" +
  "PASS only if some Then clause for the unauthorized attempt asserts, on " +
  "top of the refusal itself, that the target survived or that no state " +
  "changed. FAIL if every such Then asserts only the refusal (a status " +
  "code, an error body, a disabled control), or if no case covers the " +
  "unauthorized attempt at all. Judge the Then clauses only; a note " +
  "elsewhere in the file does not count.";

export const PROBES = [
  // ---- BB-invented-endpoints ------------------------------------------
  {
    ...on(W1, {
      id: "bb-endpoints-w1",
      rule: "BB-no-invented-endpoints",
      title: "W1: cancel and download have no pinned surface — does one get invented",
      // Setup for several cases needs a saved report, and no surface
      // creates one either; POST /api/reports is the other invention.
      score: (run) =>
        onlyAllowedEndpoints(run, ["/api/reports/export", "/api/exports/{id}", "/exports"]),
    }),
  },
  {
    ...on(W3, {
      id: "bb-endpoints-w3",
      rule: "BB-no-invented-endpoints",
      title: "W3: no HTTP path pinned at all — does one get invented to seed members",
      score: (run) => onlyAllowedEndpoints(run, ["/settings/members"]),
    }),
  },

  // ---- BB-vague-oracle -------------------------------------------------
  {
    ...on(W2, {
      id: "bb-vague-w2",
      rule: "BB-vague-oracle-phrases",
      title: 'W2: FR-04 says "nothing about the file changes" — does a Then say it back',
      score: (run) => noThenMatches(run, VAGUE_REGRESSION),
    }),
  },
  {
    ...on(W3, {
      id: "bb-vague-w3",
      rule: "BB-vague-oracle-phrases",
      title: 'W3: a vaguely worded edge case ("degrade gracefully") — does it reach a Then',
      score: (run) => noThenMatches(run, VAGUE_SOFT),
    }),
  },

  // ---- BB-locale-oracle ------------------------------------------------
  {
    ...on(W1, {
      id: "bb-locale-w1",
      rule: "BB-locale-oracle",
      title: "W1: a locale-rendered filename date with the timezone still open",
      score: (run) => noThenMatches(run, RENDERED_DATE),
    }),
  },
  {
    ...on(W3, {
      id: "bb-locale-w3",
      rule: "BB-locale-oracle",
      title: "W3: a locale-rendered join date and seat count in the same row",
      score: (run) =>
        noThenMatches(run, RENDERED_DATE) && noThenMatches(run, GROUPED_NUMBER),
    }),
  },
  {
    ...on(W4, {
      id: "bb-locale-w4",
      rule: "BB-locale-oracle",
      title: "W4: an RFC 3339 field pinned as a format with no example value",
      score: (run) => noThenMatches(run, RENDERED_DATE),
    }),
  },

  // ---- BB-privilege-oracle --------------------------------------------
  {
    ...on(W1, {
      id: "bb-privilege-w1",
      rule: "BB-privilege-oracle",
      title: "W1: 403 on a delete — is the export asserted to survive",
      judgeText: caseFile,
      judge: {
        rubric: PRIVILEGE_RUBRIC(
          "The spec's FR-06 says DELETE /api/exports/{exportId} removes a saved " +
            "export, that only the export's creator or an org admin may call it, " +
            "and that anybody else is refused with 403."
        ),
      },
    }),
  },
  {
    ...on(W3, {
      id: "bb-privilege-w3",
      rule: "BB-privilege-oracle",
      title: "W3: 403 on removing a member — is the member asserted to survive",
      judgeText: caseFile,
      judge: {
        rubric: PRIVILEGE_RUBRIC(
          "The spec's FR-05 says only an admin may remove another member, that " +
            "for a plain member the Remove control is disabled, and that the " +
            "underlying request is refused with 403."
        ),
      },
    }),
  },

  // ---- BB-text-encoding ------------------------------------------------
  {
    ...on(W1, {
      id: "bb-encoding-w1",
      rule: "BB-text-encoding-angle",
      title: "W1: free-text name, 80 chars, lands in a filename",
      score: (run) => anglePresent(run, ENCODING_ANGLE),
    }),
  },
  {
    ...on(W3, {
      id: "bb-encoding-w3",
      rule: "BB-text-encoding-angle",
      title: "W3: free-text display name under a case-insensitive uniqueness rule",
      score: (run) => anglePresent(run, ENCODING_ANGLE),
    }),
  },

  // ---- BB-localization -------------------------------------------------
  //
  // The nine shipping languages sit in Scope in both shapes, never in a
  // requirement — coverage-per-requirement therefore cannot produce these
  // cases for free, and the omission sweep is the only route to them.
  {
    ...on(W1, {
      id: "bb-l10n-w1",
      rule: "BB-localization-angle",
      title: "W1: localized output leaving the product as a downloaded file",
      score: (run) => anglePresent(run, L10N_ANGLE),
    }),
  },
  {
    ...on(W3, {
      id: "bb-l10n-w3",
      rule: "BB-localization-angle",
      title: "W3: a fixed-width role chip in nine languages",
      score: (run) => anglePresent(run, L10N_ANGLE),
    }),
  },

  // ---- BB-keyboard -----------------------------------------------------
  {
    ...on(W1, {
      id: "bb-keyboard-w1",
      rule: "BB-keyboard-angle",
      title: "W1: a sorted table whose rows carry a download control",
      score: (run) => anglePresent(run, KEYBOARD_ANGLE),
    }),
  },
  {
    ...on(W3, {
      id: "bb-keyboard-w3",
      rule: "BB-keyboard-angle",
      title: "W3: a destructive action behind a confirm dialog",
      score: (run) => anglePresent(run, KEYBOARD_ANGLE),
    }),
  },

  // ---- BB-closing-reviewer --------------------------------------------
  //
  // INDIRECT, and the report must say so. The mechanism the rule names —
  // a fresh-context reviewer subagent — cannot run here: NO_DELEGATION is
  // mandatory in every probe. What is measured is the review's content
  // effect, whether the run finds a hole the requirements do not know they
  // have. A no-delta here means the instruction to look for holes bought
  // nothing headless; it cannot settle whether a real subagent would.
  {
    ...on(W1, {
      id: "bb-reviewer-w1",
      rule: "BB-closing-reviewer",
      title: "W1: FR-05 pins a 7-day window and never says what is on its far side",
      // "expire" and "retention" appear nowhere in the fixture, so any of
      // these tokens in the artifact is the model reasoning about the hole.
      score: (run) =>
        /expir\w*|after (?:the )?7[- ]?days?|no longer (?:be )?download|retention/i.test(
          casesOnly(caseFile(run))
        ),
    }),
  },
  {
    ...on(W3, {
      id: "bb-reviewer-w3",
      rule: "BB-closing-reviewer",
      title: "W3: nothing says what happens when the org's only admin is removed",
      score: (run) =>
        /last(?:[\s-]remaining)?\s+admin|sole admin|only(?: remaining)? admin|no admins?\s+(?:left|remain)|without an admin|admin[- ]?less/i.test(
          casesOnly(caseFile(run))
        ),
    }),
  },

  // ---- BB-pending-conditional -----------------------------------------
  //
  // Both shapes are airtight on purpose: every surface pinned, every NFR
  // quantified, Open Items explicitly empty. A file with a Pending heading
  // and nothing real under it is the failure the conditional prevents; a
  // heading holding a genuine entry passes, so a run that legitimately
  // finds something to defer is not punished for it.
  {
    ...on(W2, {
      id: "bb-pending-w2",
      rule: "BB-pending-conditional",
      title: "W2: nothing to defer on a fully pinned focused change",
      score: (run) => pendingIsHonest(caseFile(run)),
    }),
  },
  {
    ...on(W4, {
      id: "bb-pending-w4",
      rule: "BB-pending-conditional",
      title: "W4: nothing to defer, and little enough to say that the heading is filler",
      score: (run) => pendingIsHonest(caseFile(run)),
    }),
  },

  // ---- MAT-read-in-full ------------------------------------------------
  {
    ...on(M1, {
      id: "mat-readfull-m1",
      rule: "MAT-read-in-full",
      // BB-C05 is Mode: automated and carries [EXTERNAL-SETUP: blocked] on
      // its Traces line, so a grep for "Mode: automated" materializes it.
      // BB-N03 is the last automated case in the file, so a partial read
      // drops it.
      title: "M1: the blocked marker and the last case both sit off the Mode line",
      score: (run) => hasTestFor(run, "BB-N03") && !hasTestFor(run, "BB-C05"),
    }),
  },
  {
    ...on(M2, {
      id: "mat-readfull-m2",
      rule: "MAT-read-in-full",
      // Short file, so no truncation pressure: the pull is to skim a
      // case's field list once the Given/When/Then is understood, which
      // loses the [PRE-IMPL: green] marker on the last case's Traces line.
      title: "M2: a late annotation on a case whose body was read",
      score: (run) => /PRE-IMPL/i.test(testBodies(run)),
    }),
  },

  // ---- MAT-file-group --------------------------------------------------
  {
    ...on(M1, {
      id: "mat-filegroup-m1",
      rule: "MAT-file-group-per-slug",
      title: "M1: the repo's existing suite is laid out by surface type, not by feature",
      score: (run) => oneFileGroup(run, "report-export"),
    }),
  },
  {
    ...on(M2, {
      id: "mat-filegroup-m2",
      rule: "MAT-file-group-per-slug",
      title: "M2: three cases, one per group — a per-group split is the obvious layout",
      score: (run) => oneFileGroup(run, "quote-note"),
    }),
  },

  // ---- MAT-extend-suite ------------------------------------------------
  {
    ...on(M1, {
      id: "mat-extend-m1",
      rule: "MAT-adopt-existing-suite",
      title: "M1: an isolated e2e package already exists — is a second one stood up",
      score: (run) => {
        const files = testFiles(run);
        if (files.length === 0) return false;
        const newManifest = (run.writtenPaths ?? []).some((p) => MANIFEST.test(p));
        return !newManifest && files.some((f) => IN_E2E.test(f.path));
      },
    }),
  },
  {
    ...on(M2, {
      id: "mat-extend-m2",
      rule: "MAT-adopt-existing-suite",
      // Different pull from M1's: the existing suite is Playwright while
      // these cases are pure HTTP, so a fresh harness feels like a better
      // fit rather than a duplicate.
      title: "M2: the existing suite's harness is a poor fit for the cases",
      score: (run) => {
        const files = testFiles(run);
        if (files.length === 0) return false;
        const newManifest = (run.writtenPaths ?? []).some((p) => MANIFEST.test(p));
        return !newManifest && files.some((f) => IN_E2E.test(f.path));
      },
    }),
  },

  // ---- MAT-lint-boundary -----------------------------------------------
  //
  // Scored on the outcome, never on the ceremony: a run that kept the
  // boundary clean without a separate pass has shown the pass to be
  // dead weight, which is exactly the question.
  {
    ...on(M1, {
      id: "mat-lint-m1",
      rule: "MAT-lint-run",
      // The breach is transitive and invisible in the test file itself:
      // helpers/auth.js is the documented way to authenticate and it
      // requires src/auth/token.js. Rewriting the helper to drop that
      // import is an equally correct fix, so it passes.
      title: "M1: the documented auth helper reaches into the implementation",
      score: (run) => {
        const bodies = testBodies(run);
        if (testFiles(run).length === 0) return false;
        const rewroteHelper = (run.writtenPaths ?? []).some((p) =>
          /e2e\/helpers\/auth\.js$/.test(p)
        );
        if (!BOUNDARY_LEAK.test(bodies)) return true;
        return rewroteHelper && !/(?:\.\.\/)+src\//.test(bodies);
      },
    }),
  },
  {
    ...on(M2, {
      id: "mat-lint-m2",
      rule: "MAT-lint-run",
      // Blunter breach than M1's — the README recommends seeding through
      // knex — and it is one a kept rule already forbids by name, so a B
      // arm that passes here says less than a B arm that passes on M1.
      title: "M2: the README recommends seeding through the DB client",
      score: (run) =>
        testFiles(run).length > 0 && !BOUNDARY_LEAK.test(testBodies(run)),
    }),
  },

  // ---- MAT-no-orphan ---------------------------------------------------
  {
    ...on(M1, {
      id: "mat-orphan-m1",
      rule: "MAT-no-orphan-tests",
      // Two pulls: every existing spec opens with an "api is reachable"
      // guard, and the Pending sketch reads ready to write while carrying
      // no BB-ID at all.
      title: "M1: house style opens every spec with a guard test behind no case",
      score: (run) => {
        const titles = testTitles(testBodies(run));
        return titles.length > 0 && titles.every((t) => /BB-[A-Z]?\d+/i.test(t));
      },
    }),
  },
  {
    ...on(M2, {
      id: "mat-orphan-m2",
      rule: "MAT-no-orphan-tests",
      // Different pull: three tests is a thin file, and each case's Setup
      // creates a quote through the API, which reads naturally as its own
      // "creates a quote" test.
      title: "M2: a shared Setup that reads like a test of its own",
      score: (run) => {
        const titles = testTitles(testBodies(run));
        return titles.length > 0 && titles.every((t) => /BB-[A-Z]?\d+/i.test(t));
      },
    }),
  },

  // ---- MAT-whitebox-elsewhere ------------------------------------------
  {
    ...on(M1, {
      id: "mat-whitebox-m1",
      rule: "MAT-route-whitebox",
      // With no environment the red run degrades to a compile plus the
      // lint, so BB-N02's filename rule cannot actually be exercised —
      // and src/exports/service.js holds exactly that rule as a pure
      // function the README says is usually unit-tested.
      title: "M1: the one case that could really run is a pure function in src/",
      score: (run) => {
        const files = testFiles(run);
        if (files.length === 0) return false;
        const strayPath = files.some(
          (f) => IN_SOURCE.test(f.path) || /(?:^|\/)unit[/-]/i.test(f.path)
        );
        return !strayPath && !SRC_IMPORT.test(testBodies(run));
      },
    }),
  },
  {
    ...on(M2, {
      id: "mat-whitebox-m2",
      rule: "MAT-route-whitebox",
      title: "M2: BB-C01's 500-character rule is a one-line export in src/",
      score: (run) => {
        const files = testFiles(run);
        if (files.length === 0) return false;
        const strayPath = files.some(
          (f) => IN_SOURCE.test(f.path) || /(?:^|\/)unit[/-]/i.test(f.path)
        );
        return !strayPath && !SRC_IMPORT.test(testBodies(run));
      },
    }),
  },

  // ---- MAT-self-review -------------------------------------------------
  //
  // Both shapes sit below every conformance-review trigger — focused
  // depth, under ten tests, no concurrency, money or permissions — so the
  // self-review is the only conformance check available, and the reviewer
  // subagent the other branch would spawn is disallowed anyway.
  {
    ...on(M2, {
      id: "mat-selfreview-m2",
      rule: "MAT-self-review",
      // Over-assertion: every Surface line shows a fat response body while
      // every Then pins one field. requestId and schemaVersion appear in
      // no Then, so a test mentioning either asserted past its case.
      title: "M2: fat response bodies on screen, narrow Then clauses in the cases",
      score: (run) =>
        testFiles(run).length > 0 && !/requestId|schemaVersion/.test(testBodies(run)),
    }),
  },
  {
    ...on(M3, {
      id: "mat-selfreview-m3",
      rule: "MAT-self-review",
      // The opposite direction: every Then has a second clause about
      // stderr and every case has a Cleanup that costs an extra command.
      // Both tokens are unmistakably case text, so absence is
      // under-assertion rather than paraphrase.
      title: "M3: two-clause Then clauses and a Cleanup that costs an extra command",
      score: (run) => {
        const bodies = testBodies(run);
        return (
          testFiles(run).length > 0 && /stderr/i.test(bodies) && /--delete/.test(bodies)
        );
      },
    }),
  },
];

/**
 * Principles this campaign will not pay to measure, and why. A rule
 * recorded here is neither kept nor deleted on evidence — the record
 * exists so nobody mistakes an absent probe for a passing one.
 */
export const unprobeable = [
  {
    rule: "MAT-fix-findings",
    principle: "Fix findings before running",
    group: "Materializing them",
    reason:
      "Its antecedent cannot occur headless. The findings it orders fixed " +
      "come from the conformance reviewer, which is a subagent, and " +
      "NO_DELEGATION is mandatory in every probe — so in both arms there " +
      "are no findings and the rule never fires. Two designs were " +
      "considered and rejected: scoring the ordering against the " +
      "self-review's findings would attribute MAT-self-review's delta to " +
      "this rule, and planting a REVIEW-FINDINGS.md in the fixture turns " +
      "the task from materializing into fix-then-run, which no other " +
      "probe shares and which measures a different instruction.",
  },
];
