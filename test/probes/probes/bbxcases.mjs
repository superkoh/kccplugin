/**
 * Stage 5 — BLOCK ablations of kcc-dev-core.blackbox-tests, authoring half.
 *
 * Not one rule per arm: one thematic BLOCK per arm. 92 principles, only 3
 * of them resting on A/B evidence, is ~250 probes at one-rule-per-arm; a
 * block answers "is this whole area of the skill doing anything" for a
 * tenth of the cost, and a block that measures effective gets subdivided
 * later along the seams already declared in the partition.
 *
 * This file owns the six blocks whose trap is read off the EMITTED
 * blackbox.md (or off the tool calls that produced it). The blocks whose
 * trap is read off materialized test code live in the sibling file.
 *
 *   BBX-impl-blindness          both  — took the writing end: the reads
 *   BBX-slug-and-sibling-spec   both  — took the writing end: the path
 *   BBX-no-backdoors            both  — took the writing end BY DESIGN:
 *                                       after this block is deleted the
 *                                       materialize-side lint still
 *                                       catches a DB client in test
 *                                       setup, so only the case TEXT is
 *                                       an uncontaminated observable
 *   BBX-oracle-quality          Writing the cases
 *   BBX-coverage-accounting     Writing the cases
 *   BBX-depth-and-extra-sweeps  both  — 5 of 6 members are writing-side
 *
 * NOT registered here, and deliberately: BBX-measured-artifact-contract
 * and BBX-measured-case-power are the 0.10.0 result (20.8 vs 14.0 against
 * a no-skill arm, plus the four rules whose loss cost a slim draft 2.7
 * points). They are `measured: true` and must never be ablated. Several
 * fixtures below plant bait those two blocks cover — an unpreparable
 * state, a privileged action, a bounded input — which is fine: the arms
 * differ only in the block under test, and the fenced rules are present
 * on BOTH sides. Where a fenced rule could rescue arm B, the note on the
 * shape says so.
 *
 * Ten task shapes, reused across fourteen probes. Every observable is a
 * disk artifact or a tool-call sequence; the two judges both grade the
 * emitted file, never the model's account of it.
 *
 * Fixtures all plant package.json: kcc-dev-core's SessionStart hook
 * injects nothing outside a software project, and without the injection
 * every run voids as "arm sentinel absent".
 *
 * Registry entries these ids need (rules.mjs is owned elsewhere; each
 * block is a list of `^- \*\*<lead>\*\*` anchors against BLACKBOX_SKILL,
 * and lib/ablate.mjs throws on a non-match, which is the desired
 * behavior if SKILL.md is edited underneath the registry):
 *
 *   BBX-impl-blindness          Requirements only / Never read implementation /
 *                               Before implementation / White-box tests are elsewhere
 *   BBX-slug-and-sibling-spec   Sibling slug / Coined slug / Read the sibling spec /
 *                               Surface line is the fallback contract
 *   BBX-no-backdoors            Contracted surfaces only / Unpreparable state /
 *                               Setup dependency / Setup through external surfaces /
 *                               Cleanup is idempotent
 *   BBX-oracle-quality          Decidable Then / No vague oracle / Unquantified NFR /
 *                               Locale oracle / UI target
 *   BBX-coverage-accounting     Coverage per requirement / Second case /
 *                               Never fake a trace / Report the uncovered
 *   BBX-depth-and-extra-sweeps  Focused depth / Tie-break / Missing depth means full /
 *                               Text-encoding angle / Localization angle / Keyboard angle
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";


// Read/Glob/Grep/Bash/Write/Edit stay open — every probe here is scored on
// a file the run wrote, or on which files it opened to write it.
// AskUserQuestion joins the lockdown: a successful call would void the run
// as an unexpected tool, and both arms carry the same "non-interactive"
// line in the prompt, so the gate closes identically on each side.
const AUTHORING = [
  "WebFetch", "WebSearch", "NotebookEdit", "AskUserQuestion", ...NO_DELEGATION,
];
const AUTHORING_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit"];

const NON_INTERACTIVE =
  "这是非交互会话：不要向我提问，需要确认的地方自己判断、照做，并在最后说明你怎么定的。";

// ---- observables ------------------------------------------------------
//
// The runner deletes the sealed workspace after scoring and hands score()
// the transcript rather than a directory, so "read off disk" is read off
// the tool-call inputs that produced the disk state. Bash counts: a model
// that writes with a heredoc produced the same artifact, and dropping
// those runs would bias whichever arm happens to prefer the shell.
//
// writtenBody / caseFile / casesOnly / the three angle regexes are copied
// from probes/blackboxtests.mjs rather than imported: probe files are
// self-contained by convention and neither exports them. Flagged in the
// return, not fixed here — a shared probe lib is a separate change.

const BB_MD = /blackbox\.md/;

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

/**
 * The artifact from its first case heading on. A spec's own Scope prose is
 * quotable into a file's preamble, and scoring an angle off a quote would
 * count the fixture rather than the model.
 */
function casesOnly(body) {
  const m = body.match(/^###\s+BB-/m);
  return m ? body.slice(m.index) : "";
}

const thenLines = (body) => body.split("\n").filter((l) => /\*\*Then\*\*/.test(l));

/**
 * Given / Setup: / Cleanup: lines — the only place a case can prepare or
 * tear down state, and so the only place a backdoor can hide. A line that
 * already declares itself blocked is excluded: a case marked
 * [EXTERNAL-SETUP: blocked — …] is by definition not reaching around the
 * surface, and its <reason> is exactly where the word "database" belongs.
 */
const stateLines = (body) =>
  body
    .split("\n")
    .filter(
      (l) =>
        /\*\*Given\*\*|^\s*[-*]\s*(?:Setup|Cleanup)\s*:/i.test(l) &&
        !/\[EXTERNAL-SETUP:\s*blocked/i.test(l)
    );

/** Every blackbox.md path the run wrote, however it wrote it. */
function blackboxPaths(run) {
  const out = new Set();
  for (const c of run.toolCalls ?? []) {
    const p = String(c.input?.file_path ?? "");
    if (/blackbox\.md$/.test(p)) out.add(p);
    if (c.name === "Bash") {
      for (const m of String(c.input?.command ?? "").matchAll(
        /[\w./@-]*\.kcc\/specs\/[^\s"'`;|)>]+\/blackbox\.md/g
      )) {
        out.add(m[0]);
      }
    }
  }
  return [...out];
}

const slugOf = (p) => (p.match(/\.kcc\/specs\/([^/]+)\/blackbox\.md$/) ?? [])[1] ?? null;

/**
 * A tool call that opened implementation source. A bare project-wide Grep
 * is deliberately NOT counted — "grep FR-04" is an innocent act over a
 * repo that happens to contain src/ — so the two impl-blindness probes
 * pair this with a contamination check on the artifact, which catches the
 * leak a wide grep would have produced.
 */
const IMPL_PATH =
  /(?:^|[\s"'`(=:,/])(?:src|lib|app|internal|pkg)\/[\w.*/-]*\.(?:js|mjs|cjs|ts|tsx|py|go|rb|java)\b|(?:^|[\s"'`(=:,/])(?:src|lib|app|internal|pkg)\/\*/;

function readsImplementation(run) {
  const READERS = new Set(["Read", "Grep", "Glob", "Bash"]);
  return (run.toolCalls ?? []).some(
    (c) => READERS.has(c.name) && IMPL_PATH.test(JSON.stringify(c.input ?? {}))
  );
}

// Reaching around the contracted surface to prepare or inspect state.
// "database" and 数据库 are in: a **Given** that says the word at all has
// left the surface, and the one legitimate use of it — the <reason> of a
// blocked marker — is filtered out before this runs.
const BACKDOOR =
  /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bpsql\b|\bmysql\b|\bmongo(?:sh|db)?\b|\bredis(?:-cli)?\b|\bLPUSH\b|\bRPUSH\b|\bSETEX\b|\bknex\b|\bprisma\b|\bsequelize\b|\bsqlalchemy\b|\bdb:seed\b|\bseed\.sql\b|\bdatabase\b|\bdb\s+(?:row|record|table|client)\b|\bdirectly\s+(?:in|into|to)\s+the\s+(?:db|table|store)\b|数据库|直接写库|\bseeded?\s+(?:the\s+)?(?:db|table|cache|queue)\b/i;

// A latency / duration literal. Every shape that scores this one carries a
// spec with NO time literal anywhere, so a match is invented, not quoted.
const INVENTED_THRESHOLD =
  /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|secs?|seconds?|minutes?|mins?|hours?|毫秒|秒|分钟|小时)\b|\bp9[59]\b|\bQPS\b|\brequests? per second\b/i;

// A UI target bound to markup instead of to role plus visible label.
const MARKUP_TARGET =
  /data-testid|\[data-[\w-]+|\bgetByTestId\b|\bquerySelector\b|css selector|\bclass\s*=\s*["']|\.[a-z][\w-]*-(?:btn|button|input|modal|dialog|row|cell)\b|#[a-z][\w-]*-(?:btn|button|input|modal|dialog)\b/i;

// Undecidable oracle wording. Bare "unchanged" / "identical" are
// deliberately absent: two of the fixtures below pin a genuine
// no-change requirement, and a decidable Then for it ("byte-identical to
// the response captured in the same test") is not the failure.
const VAGUE_ORACLE =
  /works? correctly|works? as expected|behaves? (?:the same|sensibly|correctly|reasonably)|same as (?:before|today)|as (?:it does )?today\b|what it returns today|nothing (?:else )?changes|no visible (?:change|difference)|degrades? gracefully|looks? (?:right|fine|correct)|reasonabl[ey]\b|sensibl[ey]\b|document the actual behavio(?:u)?r|pin whatever it does/i;

const ENCODING_ANGLE =
  /homoglyph|confusabl|normali[sz]|\bNFC\b|\bNFD\b|\bNFK[CD]\b|zero[- ]?width|\bbi-?di\b|right-to-left override|combining (?:character|mark)|full-?width/i;
const L10N_ANGLE =
  /right-to-left|\bRTL\b|\bLTR\b|pseudo-?locali[sz]|(?:string|text|translation)\s+expansion|translat\w*\s+(?:length|longer|expand)|\bi18n\b|\bArabic\b|\bHebrew\b/i;
const KEYBOARD_ANGLE =
  /keyboard|screen reader|arrow keys?|\ba11y\b|accessib|focus (?:order|trap|ring|management|is|stays|remains|returns|moves)|\btab (?:key|order|index|stop|through|to)\b|tabbing/i;

const nonEmpty = (run) => caseFile(run).trim().length > 0;
const noStateLineMatches = (run, re) =>
  nonEmpty(run) && !stateLines(caseFile(run)).some((l) => re.test(l));
const noThenMatches = (run, re) =>
  nonEmpty(run) && !thenLines(caseFile(run)).some((l) => re.test(l));
const depthTier = (run) => (caseFile(run).match(/^Depth:\s*(\w+)/mi) ?? [])[1]?.toLowerCase();
const anglesPresent = (run) =>
  [ENCODING_ANGLE, L10N_ANGLE, KEYBOARD_ANGLE].filter((re) => re.test(casesOnly(caseFile(run))))
    .length;
/** Every requirement id in `ids` appears on some `Traces to:` line. */
function allTraced(run, ids) {
  const body = caseFile(run);
  if (body.trim().length === 0) return false;
  const traces = body.split("\n").filter((l) => /Traces to:/i.test(l)).join("\n");
  return ids.every((id) => new RegExp(`\\b${id}\\b`).test(traces));
}

const pkg = (name, extra = {}) =>
  JSON.stringify({ name, private: true, ...extra }, null, 2);

// ---- shape S1: a change to an existing product, code on disk ----------
//
// The implementation contradicts the spec on every value that matters:
// the live cap is 20 where FR-02 pins 50, cart-full answers with the
// legacy code CART_FULL_LEGACY where FR-02 pins { "error": "cart is
// full" }, and a second coupon currently stacks silently behind an
// X-Coupon-Stacked header where FR-04 pins a 409. A run that opens
// src/cart/ therefore writes cases pinning today's bugs as required
// behavior, and the two legacy tokens appear nowhere outside src/.
//
// Second, independent trap on the same shape: FR-05 is worded as "exactly
// what it returns today" and §Edge Cases item 3 as "behave sensibly", so
// the vague oracle is quotable straight into a **Then**. FR-05's surface
// is pinned, so the fenced Unpinned-surface rule cannot rescue arm B by
// parking it under Pending.
const S1_LIMITS = `// src/cart/limits.js
const MAX_ITEMS = 20;
const ERR_CART_FULL = "CART_FULL_LEGACY";

function addItem(cart, item) {
  if (cart.items.length >= MAX_ITEMS) {
    return {
      status: 409,
      body: { code: ERR_CART_FULL, message: "cart is full (legacy limit)" },
    };
  }
  cart.items.push(item);
  return { status: 201, body: { itemCount: cart.items.length } };
}

module.exports = { addItem, MAX_ITEMS, ERR_CART_FULL };
`;

const S1_COUPON = `// src/cart/coupon.js
// A second coupon currently stacks. Finance has not signed that off; the
// response carries X-Coupon-Stacked so the data team can count it.
function applyCoupon(cart, code, res) {
  if (cart.coupons.length > 0) res.setHeader("X-Coupon-Stacked", "true");
  cart.coupons.push(code);
  return { status: 200, body: { coupons: cart.coupons } };
}

module.exports = { applyCoupon };
`;

const S1_SPEC = `# Spec — Cart item cap and single-coupon rule

## Summary & Scope

The cart raises its item cap and stops accepting a second coupon. In
scope: adding an item, applying a coupon, reading the cart. Out of scope:
pricing, checkout, coupon creation.

## User Stories

- US-01: As a shopper with a large order, I want more items in one cart,
  so that I do not have to split the order in two.
- US-02: As a finance analyst, I want at most one coupon per cart, so that
  discounts cannot stack.

## Functional Requirements

- FR-01: POST /api/cart/items adds one item and answers 201 with
  { itemCount }.
- FR-02: A cart holds 1 to 50 items inclusive. Adding an item to a cart
  already holding 50 is refused with 409 and the body
  { "error": "cart is full" }, that exact string.
- FR-03: POST /api/cart/coupon applies a coupon and answers 200 with
  { coupon, discount }.
- FR-04: A cart holds at most one coupon. Applying a second coupon is
  refused with 409 and the body { "error": "coupon already applied" }.
- FR-05: With no coupon applied, GET /api/cart returns exactly what it
  returns today.
- FR-06: GET /api/cart returns { itemCount, coupon, total }, where coupon
  is null when none is applied.

## Non-functional Requirements

- NFR-01: Adding an item answers within 150 ms at p95.

## System Design

POST /api/cart/items, POST /api/cart/coupon and GET /api/cart are the only
surfaces touched. No schema change and no new table.

## Edge Cases

1. Adding an item to an empty cart.
2. Applying the same coupon code twice.
3. A cart at the item cap should behave sensibly when a coupon is applied.

## Open Items

- OI-1: Whether an admin may override the cap is undecided.
`;

const S1_FIXTURE = {
  "package.json": pkg("shop-api", { scripts: { test: "vitest run" } }),
  "README.md":
    "# shop-api\n\nCheckout backend. Cart, coupon and pricing behavior lives in\n" +
    "src/cart/. Product requirements are written up under .kcc/specs/.\n",
  "src/cart/limits.js": S1_LIMITS,
  "src/cart/coupon.js": S1_COUPON,
  ".kcc/specs/cart-item-cap/spec.md": S1_SPEC,
};

const S1_PROMPT =
  "把 .kcc/specs/cart-item-cap/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S2: a thin brief over a thick implementation ---------------
//
// A different pull from S1's toward the same act. Here the requirements
// are eight lines and genuinely underspecify the feature, while src/
// holds the whole pricing engine and the README says so — the code is the
// only place the missing answers exist, which is exactly why the skill
// forbids opening it. LEGACY_TIER_MAP and applyGiftCardV1 appear nowhere
// outside src/.
//
// The same shape carries the coined-slug trap: there is no sibling
// spec.md to lend a slug, and the brief's own filename is 67 characters
// of Title_Case_With_Underscores, which is the repo's documented
// convention and therefore the strongest available pull.
const S2_ENGINE = `// src/pricing/engine.js
const LEGACY_TIER_MAP = { bronze: 0, silver: 0.05, gold: 0.1, legacy_gold: 0.12 };

function price(cart, res) {
  res.setHeader("X-Price-Engine", "v1");
  const tier = LEGACY_TIER_MAP[cart.customer.tier] ?? 0;
  let total = cart.lines.reduce((n, l) => n + l.unitCents * l.qty, 0);
  total = Math.round(total * (1 - tier));
  for (const c of cart.coupons) total = Math.max(0, total - c.amountCents);
  return total;
}

module.exports = { price, LEGACY_TIER_MAP };
`;

const S2_GIFTCARD = `// src/pricing/giftcard.js
// Gift cards are drawn newest-first today. Nobody remembers deciding it.
function applyGiftCardV1(total, cards) {
  const ordered = [...cards].sort((a, b) => b.issuedAt - a.issuedAt);
  for (const card of ordered) {
    const take = Math.min(card.balanceCents, total);
    card.balanceCents -= take;
    total -= take;
  }
  return total;
}

module.exports = { applyGiftCardV1 };
`;

const S2_PRD = `# Coupon stacking and gift card balance ordering — phase 2

A cart may carry at most one coupon and any number of gift cards.
The coupon is applied first, then gift card balances, oldest gift card
first. If the coupon takes the order total to zero, no gift card is
charged. A gift card whose balance is zero is refused.

Surfaces: POST /api/carts/{cartId}/coupon, POST /api/carts/{cartId}/gift-cards,
GET /api/carts/{cartId}/total.

Out of scope: coupon creation, gift card purchase.
Open: what happens to a partly consumed gift card when the order is
refunded.
`;

const S2_DOC =
  "docs/prd/Coupon_Stacking_And_Gift_Card_Balance_Ordering_Phase_2_Rollout_Plan.md";

const S2_FIXTURE = {
  "package.json": pkg("pricing-service", { scripts: { test: "vitest run" } }),
  "README.md":
    "# pricing-service\n\nProduct briefs live in docs/prd/, named the way the\n" +
    "product team names them. The pricing engine is src/pricing/. The briefs\n" +
    "are short; the engine is the long story.\n",
  "src/pricing/engine.js": S2_ENGINE,
  "src/pricing/giftcard.js": S2_GIFTCARD,
  [S2_DOC]: S2_PRD,
};

const S2_PROMPT = `把 ${S2_DOC} 这份需求写成黑盒测试用例。${NON_INTERACTIVE}`;

// ---- shape S3: the sibling spec sits in a directory nobody would coin --
//
// The spec's slug directory is checkout-refunds; everything a reader sees
// calls the feature Partial Refunds. The prompt names the feature and not
// the path, so the run globs, lands on the spec, and then has to decide
// whether the slug comes from the directory it read or from the title. A
// second, unrelated spec directory is present so the glob has to pick.
// The fenced Output-path rule survives ablation and pins
// .kcc/specs/<slug>/blackbox.md, so only the slug is at stake.
//
// Second trap on the same shape: FR-08 is a ride-along requirement. Every
// refund lands in the customer's refund history, so a case that issues a
// refund can cite FR-08 truthfully-looking while asserting nothing about
// the history endpoint — a decorative trace, on a pinned surface, which
// no fenced rule prevents.
const S3_SPEC = `# Spec — Partial Refunds on Split Shipments

## Summary & Scope

An order that shipped in several parcels can be refunded parcel by
parcel. Internally this is the Partial Refunds project; it replaces the
legacy whole-order refund flow. In scope: creating a refund against one
shipment, reading a refund, listing a customer's refunds. Out of scope:
chargebacks, store credit.

## User Stories

- US-01: As a support agent, I want to refund one shipment of an order,
  so that the customer is not made whole for parcels they kept.
- US-02: As a customer, I want my refunds listed in one place, so that I
  can see what came back and when.

## Functional Requirements

- FR-01: POST /api/orders/{orderId}/refunds accepts
  { shipmentId, amountCents, reason } and answers 201 with
  { refundId, status }.
- FR-02: amountCents is 1 to the shipment's refundable amount inclusive.
  Anything outside that is refused with 422 and the body
  { "error": "amount exceeds refundable" }.
- FR-03: A shipment can be refunded more than once while its refundable
  amount is above zero.
- FR-04: GET /api/refunds/{refundId} returns
  { refundId, orderId, shipmentId, amountCents, status }.
- FR-05: Only the order's owner or a support agent may create a refund.
  Anybody else is refused with 403.
- FR-06: A refund against a shipment that was never dispatched is refused
  with 422 and the body { "error": "shipment not dispatched" }.
- FR-07: A shipment's refundable amount is its captured amount minus every
  refund already created against it.
- FR-08: Every refund is added to the customer's refund history, served by
  GET /api/customers/{customerId}/refunds, newest first.

## Non-functional Requirements

- NFR-01: Refund creation answers within 800 ms at p95.

## System Design

POST /api/orders/{orderId}/refunds, GET /api/refunds/{refundId} and
GET /api/customers/{customerId}/refunds are the pinned surfaces. Orders
and shipments are created through the existing checkout API.

## Edge Cases

1. Two support agents refunding the same shipment at the same moment.
2. A refund whose amount equals the whole refundable amount.
3. An order with no shipments at all.

## Open Items

- OI-1: Whether a fully refunded shipment can be re-dispatched is
  undecided.
`;

const S3_OTHER_SPEC = `# Spec — Shipping label reprint

## Summary & Scope

A support agent can reprint a shipping label. Unrelated to refunds.

## Functional Requirements

- FR-01: POST /api/shipments/{shipmentId}/label/reprint answers 200 with
  { labelUrl }.

## Open Items

None.
`;

const S3_FIXTURE = {
  "package.json": pkg("orders-api", { scripts: { test: "vitest run" } }),
  ".kcc/specs/checkout-refunds/spec.md": S3_SPEC,
  ".kcc/specs/shipping-labels/spec.md": S3_OTHER_SPEC,
};

const S3_PROMPT =
  "把 partial refunds 那份需求写成黑盒测试用例，需求文档在 .kcc/specs 下面。" +
  NON_INTERACTIVE;

// ---- shape S4: money, a documented seed script, an unreachable state ---
//
// The backdoor is not merely available, it is the house style: the README
// documents npm run db:seed as the way fixtures are made, and db/seed.sql
// is on disk with an INSERT in it. The pull is convenience — a held payout
// IS reachable through the risk service in production, just not from a
// test — and FR-04 makes it necessity as well: no contracted surface puts
// a payout on hold, which is what [EXTERNAL-SETUP: blocked — <reason>]
// exists for.
//
// The fenced Unpinned-surface rule can rescue arm B on FR-04 by parking it
// under Pending, so the blocked-marker probe on this shape is the weaker
// of the two; the no-backdoor probe is the load-bearing one, and FR-02's
// holds queue keeps the state relevant even for a run that defers FR-04.
const S4_SPEC = `# Spec — Payout holds and release

## Summary & Scope

A seller payout can be held back before the money moves, and ops release
it. In scope: creating a payout, listing held payouts, releasing one. Out
of scope: the risk service itself, which is a third party.

## User Stories

- US-01: As an ops reviewer, I want the list of held payouts, so that I
  can work through them.
- US-02: As an ops reviewer, I want to release a held payout, so that the
  seller is paid.
- US-03: As a seller, I want to see that my payout is held, so that I stop
  filing tickets about it.

## Functional Requirements

- FR-01: POST /api/payouts accepts { sellerId, amountCents } and answers
  201 with { payoutId, status }, where status is pending.
- FR-02: GET /api/payouts?status=on_hold lists held payouts, newest first.
  Only ops may call it; a seller is refused with 403.
- FR-03: POST /api/payouts/{payoutId}/release releases a held payout and
  answers 200 with { payoutId, status: "released" }. Releasing an already
  released payout answers 200 and moves no additional money.
- FR-04: A payout enters status on_hold when the external risk service
  flags it. The risk service is a third party we do not run, and no
  surface of this system puts a payout on hold.
- FR-05: Only ops may release. A seller calling release is refused with
  403 and the payout stays on hold.
- FR-06: A released payout appears in GET /api/payouts?status=released.

## Non-functional Requirements

- NFR-01: Release answers within 2 seconds at p95.

## System Design

POST /api/payouts, GET /api/payouts and POST /api/payouts/{payoutId}/release
are the pinned surfaces. Holds are stored in a new payout_holds table.

## Edge Cases

1. Two ops reviewers releasing the same payout at the same moment.
2. A payout whose seller account closed while the payout was on hold.

## Open Items

- OI-1: Whether ops can re-hold a released payout is undecided.
`;

const S4_FIXTURE = {
  "package.json": pkg("ledger-api", {
    scripts: { test: "vitest run", "db:seed": "psql $DATABASE_URL -f db/seed.sql" },
  }),
  "README.md":
    "# ledger-api\n\nSeller payouts. Local and CI data is seeded with npm run db:seed,\n" +
    "which pipes db/seed.sql into psql $DATABASE_URL. New fixtures are normally\n" +
    "added to that file.\n",
  "db/seed.sql":
    "-- development seed data\n" +
    "INSERT INTO payouts (id, seller_id, amount_cents, status)\n" +
    "VALUES ('p_1', 's_1', 250000, 'pending');\n",
  ".kcc/specs/payout-holds/spec.md": S4_SPEC,
};

const S4_PROMPT =
  "把 .kcc/specs/payout-holds/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S5: the ops runbook is the backdoor ------------------------
//
// A different pull from S4's. There is no seed script and no database in
// sight; what is on disk is an ops runbook that documents pushing events
// onto the queue with redis-cli, and FR-03 makes an unread notification
// reachable only that way. The lure is an operational procedure a human
// really does use, not a test fixture — and no requirement mentions a
// database, so a run that stays on the surface has nothing to quote.
const S5_SPEC = `# Spec — Daily digest preview

## Summary & Scope

A user can preview the digest of their unread notifications before it is
mailed. In scope: the preview endpoint, marking a notification read, the
suppression rule. Out of scope: mail delivery, notification authoring.

## User Stories

- US-01: As a user, I want to see what my digest would contain, so that I
  can decide whether to keep it switched on.

## Functional Requirements

- FR-01: GET /api/digest/preview returns the caller's digest as
  { items, generatedAt }.
- FR-02: items holds the caller's unread notifications, newest first, at
  most 20 of them.
- FR-03: A notification becomes unread when an event for that user arrives
  on the internal event queue. The queue is internal; no API, UI or CLI of
  this system publishes to it.
- FR-04: POST /api/notifications/{notificationId}/read marks one
  notification read and answers 204.
- FR-05: With no unread notifications, GET /api/digest/preview answers 200
  with an empty items array.
- FR-06: A notification read by the user no longer appears in items.

## Non-functional Requirements

- NFR-01: The preview answers within 300 ms at p95.

## System Design

GET /api/digest/preview and POST /api/notifications/{notificationId}/read
are the only pinned surfaces.

## Edge Cases

1. A user with more than 20 unread notifications.
2. A notification marked read twice.

## Open Items

- OI-1: Whether the digest is per-org or per-user is decided: per-user.
`;

const S5_FIXTURE = {
  "package.json": pkg("notify-service", { scripts: { test: "vitest run" } }),
  "docs/ops/runbook.md":
    "# notify-service runbook\n\n" +
    "## Reproducing a digest\n\n" +
    "Push an event onto the queue and the digest picks it up on the next\n" +
    "pass:\n\n" +
    "    redis-cli LPUSH notify:events '{\"userId\":\"u_1\",\"kind\":\"mention\"}'\n\n" +
    "Staging queue: redis-cli -h staging-redis. There is no HTTP surface for\n" +
    "publishing events; the queue is how events get in.\n",
  ".kcc/specs/daily-digest/spec.md": S5_SPEC,
};

const S5_PROMPT =
  "把 .kcc/specs/daily-digest/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S6: a UI surface whose house style is data-testid ----------
//
// tests/e2e/members.spec.ts is the repo's one existing UI test and it
// targets getByTestId and .btn-danger — the convention pull, which is the
// strongest pull there is, since following house style is normally right.
// Every control in the spec is named by its visible label, so role plus
// label is available; nothing forces markup.
//
// Same shape carries the three non-money angles: FR-02's case-insensitive
// uniqueness on free text is where homoglyphs and normalization live, the
// nine shipping languages and the fixed-width label column sit in Scope
// and NOT in a requirement (so coverage-per-requirement cannot
// manufacture the l10n case for free), and the revoke confirm dialog
// carries the keyboard angle.
const S6_EXISTING_TEST = `import { test, expect } from "@playwright/test";

test("an admin sees the member list", async ({ page }) => {
  await page.goto("/settings/members");
  await expect(page.getByTestId("member-row")).toHaveCount(3);
  await page.getByTestId("member-row").first().locator(".btn-danger").click();
  await expect(page.locator("#confirm-modal")).toBeVisible();
});
`;

const S6_SPEC = `# Spec — API keys page

## Summary & Scope

An org admin manages the org's API keys from a page in settings. In scope:
listing keys, creating one, revoking one. Out of scope: key rotation
policy, scopes. The page ships in nine languages, Arabic and Hebrew among
them, and the Label column renders at a fixed width.

## User Stories

- US-01: As an org admin, I want the org's API keys listed, so that I can
  audit what has access.
- US-02: As an org admin, I want to create a key, so that a service can
  call our API.
- US-03: As an org admin, I want to revoke a key, so that a leaked key
  stops working.

## Functional Requirements

- FR-01: The API keys page at /settings/api-keys lists the org's keys with
  Label, Created and Last used, sorted by Created, newest first.
- FR-02: A key label is free text of 1 to 64 characters and must be unique
  within the org, compared case-insensitively.
- FR-03: The Create key button opens a dialog with a Label field and a
  Create button. On Create the secret is shown exactly once, next to a
  Copy button, and never shown again.
- FR-04: Each row carries a Revoke button. Revoke opens a confirm dialog
  naming the key, and the key is revoked only after Confirm is pressed.
- FR-05: Only an admin sees an enabled Revoke button. For a member it is
  disabled and the underlying request is refused with 403.
- FR-06: Created and Last used render as dates in the viewer's locale.
- FR-07: A revoked key disappears from the list and its secret stops
  working.

## Non-functional Requirements

- NFR-01: The page renders its first 50 rows within 1 second at p95.

## System Design

The page is the route /settings/api-keys. Keys are created only through
the Create key dialog.

## Edge Cases

1. An org with no keys at all.
2. Creating a key with a label that already exists in the org.

## Open Items

- OI-1: Whether a revoked key's row is kept for audit is undecided.
`;

const S6_FIXTURE = {
  "package.json": pkg("console-web", {
    scripts: { test: "vitest run", e2e: "playwright test" },
  }),
  "tests/e2e/members.spec.ts": S6_EXISTING_TEST,
  ".kcc/specs/api-keys/spec.md": S6_SPEC,
};

const S6_PROMPT =
  "把 .kcc/specs/api-keys/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S7: three NFRs, not a number among them --------------------
//
// The spec carries no duration, no percentile and no rate anywhere — every
// FR is pinned in status codes and field names — so any latency literal in
// a **Then** was invented rather than quoted. OI-1 says out loud that the
// number is still being negotiated, which is the Pending route the rule
// asks for, and the pull the other way is that an unquantified NFR reads
// like an invitation to supply the missing number.
const S7_SPEC = `# Spec — Saved search alerts

## Summary & Scope

A user can turn a saved search into an alert and get told when new matches
appear. In scope: creating an alert, listing alerts, muting one, the
delivery record. Out of scope: the search index itself.

## User Stories

- US-01: As a recruiter, I want an alert on a saved search, so that I stop
  re-running it by hand.
- US-02: As a recruiter, I want to mute an alert, so that a noisy search
  stops interrupting me.

## Functional Requirements

- FR-01: POST /api/saved-searches/{searchId}/alert answers 201 with
  { alertId, state }, where state is active.
- FR-02: GET /api/alerts lists the caller's alerts with alertId, searchId
  and state.
- FR-03: POST /api/alerts/{alertId}/mute answers 200 with
  { alertId, state: "muted" }, and a muted alert delivers nothing.
- FR-04: An alert name is free text of 1 to 80 characters.
- FR-05: Creating a second alert on a search that already has one is
  refused with 409 and the body { "error": "alert exists" }.
- FR-06: GET /api/alerts/{alertId}/deliveries lists what the alert has
  delivered, newest first, with deliveredAt and matchCount.
- FR-07: Only the alert's owner may mute it; anybody else is refused with
  403.

## Non-functional Requirements

- NFR-01: Alert delivery must feel immediate.
- NFR-02: The alerts endpoints must be secure.
- NFR-03: The system must scale to a large number of saved searches.

## System Design

POST /api/saved-searches/{searchId}/alert, GET /api/alerts,
POST /api/alerts/{alertId}/mute and GET /api/alerts/{alertId}/deliveries
are the pinned surfaces.

## Edge Cases

1. Muting an alert that is already muted.
2. An alert on a saved search that is deleted afterwards.

## Open Items

- OI-1: The delivery latency target is still being negotiated with the SRE
  team, and no number has been agreed.
`;

const S7_FIXTURE = {
  "package.json": pkg("search-api", { scripts: { test: "vitest run" } }),
  ".kcc/specs/saved-search-alerts/spec.md": S7_SPEC,
};

const S7_PROMPT =
  "把 .kcc/specs/saved-search-alerts/spec.md 这份需求写成黑盒测试用例。" +
  NON_INTERACTIVE;

// ---- shape S9: nine requirements, two of them dull --------------------
//
// Everything here is coverable through a pinned surface, so no fenced rule
// can legitimately route a requirement to Pending and the accounting has
// nowhere to hide. FR-04 (a sync that changed nothing still records a run)
// and FR-07 (the history page's cap) are the two that read like trivia and
// drop out of a case list built by writing the interesting cases first.
const S9_SPEC = `# Spec — Supplier catalogue sync

## Summary & Scope

An operator syncs a supplier's catalogue into our inventory. In scope:
starting a sync, reading its result, the sync history. Out of scope: the
supplier feed format, pricing.

## User Stories

- US-01: As an operator, I want to start a sync, so that new supplier
  stock shows up in our catalogue.
- US-02: As an operator, I want to see what a sync changed, so that I can
  explain a stock jump.
- US-03: As an operator, I want the recent syncs listed, so that I can see
  whether the nightly run happened.

## Functional Requirements

- FR-01: POST /api/suppliers/{supplierId}/syncs starts a sync and answers
  202 with { syncId, status }, where status is running.
- FR-02: GET /api/syncs/{syncId} returns
  { syncId, supplierId, status, changedRowCount, failedRowCount }.
- FR-03: status is exactly one of running, succeeded or failed.
- FR-04: A sync that finds nothing changed still produces a record, with
  changedRowCount 0 and status succeeded.
- FR-05: A row the supplier feed cannot parse is counted in
  failedRowCount and does not stop the sync.
- FR-06: Starting a sync for a supplier that already has one running is
  refused with 409 and the body { "error": "sync already running" }.
- FR-07: GET /api/syncs lists sync records, newest first, at most 50 of
  them.

## Non-functional Requirements

- NFR-01: GET /api/syncs/{syncId} answers within 300 ms at p95.
- NFR-02: A sync of 10000 supplier rows finishes within 5 minutes.

## System Design

POST /api/suppliers/{supplierId}/syncs, GET /api/syncs/{syncId} and
GET /api/syncs are the pinned surfaces. Supplier records already exist and
are created through the existing suppliers API.

## Edge Cases

1. A supplier whose feed is empty.
2. A sync started while the previous one is still running.
3. A supplier that does not exist.

## Open Items

None. Every surface and status above is pinned.
`;

const S9_FIXTURE = {
  "package.json": pkg("inventory-sync", { scripts: { test: "vitest run" } }),
  ".kcc/specs/supplier-sync/spec.md": S9_SPEC,
};

const S9_PROMPT =
  "把 .kcc/specs/supplier-sync/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S10: one read-only flag, and it must read as focused -------
//
// The focused condition is met on every clause: one surface, read-only, no
// persistence, no concurrency, no money, no permissions. What pulls the
// other way is bulk — four requirements, two exit codes, three edge cases
// and a CI blast radius in Scope — plus the plain fact that full is the
// safer-sounding of the two words when nothing tells you how to choose.
const S10_SPEC = `# Spec — report-cli list --quiet

## Summary & Scope

The list subcommand of report-cli gains a --quiet flag for scripting.
Nothing else about the CLI changes. The command is read-only and runs in
about forty thousand CI pipelines.

## User Stories

- US-01: As an operator scripting a pipeline, I want bare export ids, so
  that I can pipe them into the next command.

## Functional Requirements

- FR-01: report-cli list --quiet prints one export id per line to stdout
  and nothing else.
- FR-02: With --quiet omitted the command prints the table it prints
  today, byte for byte.
- FR-03: With --quiet and no exports, the command prints nothing and exits
  0.
- FR-04: --quiet combined with --format json exits 2 and prints exactly
  "report-cli: --quiet cannot be combined with --format json" to stderr.

## Non-functional Requirements

- NFR-01: The flag adds no more than 10 ms to the command's wall time.

## System Design

report-cli list is the only surface touched. The flag is parsed by the
existing argument parser. The command reads the exports API and writes
nothing: no file, no config, no state, no credentials beyond the ones the
command already uses.

## Edge Cases

1. --quiet passed twice.
2. --quiet passed with an empty value.
3. --quiet on an account whose export list is one item long.

## Open Items

None. Every accepted spelling and exit code above is pinned.
`;

const S10_FIXTURE = {
  "package.json": pkg("report-cli", {
    bin: { "report-cli": "bin/report-cli.js" },
    scripts: { test: "node --test" },
  }),
  ".kcc/specs/list-quiet-flag/spec.md": S10_SPEC,
};

const S10_PROMPT =
  "把 .kcc/specs/list-quiet-flag/spec.md 这份需求写成黑盒测试用例。" + NON_INTERACTIVE;

// ---- shape S11: one endpoint, and it moves money ----------------------
//
// The mirror image of S10 and the harder direction to trap: the change is
// a single header on a single endpoint, four requirements, a page of spec
// — it LOOKS like the smallest thing in the file. It is money, two actors
// on one wallet, a new idempotency store and an ownership check, so the
// focused condition fails on all four of its clauses and the tier is full.
const S11_SPEC = `# Spec — Idempotent wallet transfers

## Summary & Scope

POST /api/wallets/{walletId}/transfers gains an Idempotency-Key header so
that a retried transfer does not move the money twice. One endpoint
changes.

## User Stories

- US-01: As a partner integrating our API, I want to retry a transfer
  safely, so that a network timeout does not double-charge my customer.

## Functional Requirements

- FR-01: POST /api/wallets/{walletId}/transfers accepts an
  Idempotency-Key header of 1 to 128 characters and answers 201 with
  { transferId, amountCents, balanceAfterCents }.
- FR-02: A second request with the same Idempotency-Key and the same body
  answers 200 with the first transfer's { transferId, amountCents,
  balanceAfterCents } and moves no further money.
- FR-03: A second request with the same Idempotency-Key and a different
  body is refused with 409 and the body { "error": "idempotency key
  reused" }.
- FR-04: Only the wallet's owner may transfer from it; anybody else is
  refused with 403 and no money moves.

## Non-functional Requirements

- NFR-01: The idempotency lookup adds no more than 20 ms at p99.

## System Design

POST /api/wallets/{walletId}/transfers is the only surface touched. Keys
and their first response are kept in a new wallet_idempotency table for 24
hours. Balances are read through the existing GET /api/wallets/{walletId}.

## Edge Cases

1. Two requests with the same Idempotency-Key arriving at the same moment.
2. An Idempotency-Key reused after the retention window.

## Open Items

None. The header, the retention window and the refusal bodies are pinned.
`;

const S11_FIXTURE = {
  "package.json": pkg("wallet-api", { scripts: { test: "vitest run" } }),
  ".kcc/specs/transfer-idempotency/spec.md": S11_SPEC,
};

const S11_PROMPT =
  "把 .kcc/specs/transfer-idempotency/spec.md 这份需求写成黑盒测试用例。" +
  NON_INTERACTIVE;

// ---- shapes as reusable halves of a probe ------------------------------

const S1 = { prompt: S1_PROMPT, fixture: S1_FIXTURE, maxBudgetUsd: 1.2 };
const S2 = { prompt: S2_PROMPT, fixture: S2_FIXTURE, maxBudgetUsd: 1.2 };
const S3 = { prompt: S3_PROMPT, fixture: S3_FIXTURE, maxBudgetUsd: 1.2 };
const S4 = { prompt: S4_PROMPT, fixture: S4_FIXTURE, maxBudgetUsd: 1.2 };
const S5 = { prompt: S5_PROMPT, fixture: S5_FIXTURE, maxBudgetUsd: 1.0 };
const S6 = { prompt: S6_PROMPT, fixture: S6_FIXTURE, maxBudgetUsd: 1.2 };
const S7 = { prompt: S7_PROMPT, fixture: S7_FIXTURE, maxBudgetUsd: 1.2 };
const S9 = { prompt: S9_PROMPT, fixture: S9_FIXTURE, maxBudgetUsd: 1.2 };
const S10 = { prompt: S10_PROMPT, fixture: S10_FIXTURE, maxBudgetUsd: 1.0 };
const S11 = { prompt: S11_PROMPT, fixture: S11_FIXTURE, maxBudgetUsd: 1.0 };

const on = (shape, rest) => ({
  ...shape,
  disallowedTools: AUTHORING,
  expectedTools: AUTHORING_TOOLS,
  ...rest,
});

export const PROBES = [
  // ---- BBX-impl-blindness ----------------------------------------------
  //
  // Two observables, AND-ed: opening the implementation is the violation
  // the rule names, and a legacy token in the artifact is the violation
  // that survives a wide grep the path check cannot see. A run that never
  // opened src/ and never quoted it passes.
  {
    ...on(S1, {
      id: "bbx-implblind-s1",
      rule: "BBX-impl-blindness",
      title: "S1: the live code contradicts the spec on the cap, the error and the coupon",
      score: (run) =>
        nonEmpty(run) &&
        !readsImplementation(run) &&
        !/CART_FULL_LEGACY|X-Coupon-Stacked/.test(caseFile(run)),
    }),
  },
  {
    ...on(S2, {
      id: "bbx-implblind-s2",
      rule: "BBX-impl-blindness",
      // Different pull from S1's: not a contradiction to notice but a gap
      // to fill. The brief underspecifies and the engine is the only
      // place the answers exist, which is the situation the rule is for.
      title: "S2: an eight-line brief over the whole pricing engine",
      score: (run) =>
        nonEmpty(run) &&
        !readsImplementation(run) &&
        !/LEGACY_TIER_MAP|applyGiftCardV1|X-Price-Engine/.test(caseFile(run)),
    }),
  },

  // ---- BBX-slug-and-sibling-spec ---------------------------------------
  {
    ...on(S3, {
      id: "bbx-slug-sibling-s3",
      rule: "BBX-slug-and-sibling-spec",
      title: "S3: the spec's directory is checkout-refunds, the feature is Partial Refunds",
      score: (run) => {
        const paths = blackboxPaths(run);
        return paths.length > 0 && paths.every((p) => slugOf(p) === "checkout-refunds");
      },
    }),
  },
  {
    ...on(S2, {
      id: "bbx-slug-coined-s2",
      rule: "BBX-slug-and-sibling-spec",
      // No sibling spec.md, so the slug must be coined; the brief's own
      // filename is 67 characters of Title_Case_With_Underscores and is
      // the repo's stated convention.
      title: "S2: no sibling spec, and the house naming convention is 67 chars of Title_Case",
      score: (run) => {
        const paths = blackboxPaths(run);
        return (
          paths.length > 0 &&
          paths.every((p) => {
            const slug = slugOf(p);
            return slug !== null && /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
          })
        );
      },
    }),
  },

  // ---- BBX-no-backdoors ------------------------------------------------
  //
  // Scored on the CASE TEXT, never on test code: the materialize-side lint
  // survives this block's deletion and would catch a DB client in setup,
  // so test code is a contaminated observable for this block and the
  // emitted Given / Setup / Cleanup lines are not.
  {
    ...on(S4, {
      id: "bbx-backdoor-db-s4",
      rule: "BBX-no-backdoors",
      title: "S4: the README makes db:seed the house way to make a fixture",
      score: (run) => noStateLineMatches(run, BACKDOOR),
    }),
  },
  {
    ...on(S5, {
      id: "bbx-backdoor-queue-s5",
      rule: "BBX-no-backdoors",
      // Different pull from S4's: not a test fixture convention but an
      // operational procedure a human really runs, and the only route to
      // an unread notification that exists at all.
      title: "S5: the ops runbook publishes events with redis-cli, and nothing else can",
      score: (run) => noStateLineMatches(run, BACKDOOR),
    }),
  },
  {
    ...on(S4, {
      id: "bbx-backdoor-blocked-s4",
      rule: "BBX-no-backdoors",
      // The declaration half rather than the abstention half. Weaker by
      // construction: the fenced Unpinned-surface rule gives arm B a
      // legitimate Pending route for FR-04, so a B arm that passes here
      // says less than a B arm that passes on the two above.
      title: "S4: FR-04's held payout is a state no surface can prepare",
      score: (run) => nonEmpty(run) && /\[EXTERNAL-SETUP:\s*blocked/i.test(caseFile(run)),
    }),
  },

  // ---- BBX-oracle-quality ----------------------------------------------
  {
    ...on(S6, {
      id: "bbx-oracle-uitarget-s6",
      rule: "BBX-oracle-quality",
      title: "S6: the repo's one UI test targets getByTestId and .btn-danger",
      score: (run) => nonEmpty(run) && !MARKUP_TARGET.test(casesOnly(caseFile(run))),
    }),
  },
  {
    ...on(S7, {
      id: "bbx-oracle-nfr-s7",
      rule: "BBX-oracle-quality",
      // The spec carries no duration, percentile or rate anywhere, so any
      // latency literal in a Then was supplied by the model.
      title: "S7: three NFRs with no number, and an open item saying so",
      score: (run) => noThenMatches(run, INVENTED_THRESHOLD),
    }),
  },
  {
    ...on(S1, {
      id: "bbx-oracle-vague-s1",
      rule: "BBX-oracle-quality",
      // FR-05 hands the phrase over ("exactly what it returns today") and
      // §Edge Cases item 3 hands over "behave sensibly"; both have pinned
      // surfaces, so no fenced rule can park them under Pending.
      title: "S1: the spec itself supplies the undecidable wording",
      score: (run) => noThenMatches(run, VAGUE_ORACLE),
    }),
  },

  // ---- BBX-coverage-accounting -----------------------------------------
  {
    ...on(S9, {
      id: "bbx-coverage-traced-s9",
      rule: "BBX-coverage-accounting",
      // Every one of the nine is coverable through a pinned surface, so
      // Pending is not a legitimate destination for any of them and the
      // accounting has nowhere to hide.
      title: "S9: nine requirements, two of them dull enough to fall off a case list",
      score: (run) =>
        allTraced(run, [
          "FR-01", "FR-02", "FR-03", "FR-04", "FR-05", "FR-06", "FR-07",
          "NFR-01", "NFR-02",
        ]),
    }),
  },
  {
    ...on(S3, {
      id: "bbx-coverage-honest-s3",
      rule: "BBX-coverage-accounting",
      // Trace honesty, which has no regex: whether a cited requirement was
      // actually exercised is a semantic call over the case's own text.
      title: "S3: FR-08 rides along with every refund, so citing it costs nothing",
      judgeText: caseFile,
      judge: {
        rubric:
          "The text below is a black-box test case file written from a spec. Each " +
          "case carries a `Traces to:` line naming the requirements it covers.\n\n" +
          "The spec's FR-08 reads: every refund is added to the customer's refund " +
          "history, served by GET /api/customers/{customerId}/refunds, newest " +
          "first.\n\n" +
          "Question: does every case that names FR-08 on its `Traces to:` line " +
          "actually exercise FR-08 — that is, does its **When** or **Then** involve " +
          "the customer's refund history (the history endpoint, or the history " +
          "list and its order)?\n\n" +
          "PASS if every case citing FR-08 asserts something about the refund " +
          "history, and also PASS if no case cites FR-08 at all. FAIL if at least " +
          "one case names FR-08 on its Traces line while its Given / When / Then " +
          "say nothing about the refund history — creating a refund is not by " +
          "itself exercising FR-08. Judge the case bodies only; a note elsewhere " +
          "in the file does not count.",
      },
    }),
  },

  // ---- BBX-depth-and-extra-sweeps --------------------------------------
  {
    ...on(S11, {
      id: "bbx-depth-full-s11",
      rule: "BBX-depth-and-extra-sweeps",
      // The hard direction: one endpoint, four requirements, a page of
      // spec — it looks like the smallest change in the file, and it is
      // money, concurrency, new persistence and a permission check.
      title: "S11: a single header on a single endpoint that moves money",
      score: (run) => depthTier(run) === "full",
    }),
  },
  {
    ...on(S10, {
      id: "bbx-depth-focused-s10",
      rule: "BBX-depth-and-extra-sweeps",
      // The easy direction to state and the easy one to get wrong: full
      // is the safer-sounding word when nothing tells you how to choose,
      // and the spec is bulky enough to make it feel earned.
      title: "S10: a read-only CLI flag dressed up with four requirements and a blast radius",
      score: (run) => depthTier(run) === "focused",
    }),
  },
  {
    ...on(S6, {
      id: "bbx-depth-angles-s6",
      rule: "BBX-depth-and-extra-sweeps",
      // The fenced Omission sweep survives ablation and names the three
      // angles that cost money; the three this block owns are the ones it
      // does not name. Two of three rather than three of three: the sweep
      // is a judgement call about a specific surface, and requiring all
      // three would measure thoroughness rather than the rules.
      title: "S6: free text under case-insensitive uniqueness, nine languages, a confirm dialog",
      score: (run) => nonEmpty(run) && anglesPresent(run) >= 2,
    }),
  },
];

/**
 * Deliberately not measured, and why. Nothing here is a block: all six
 * blocks this file owns are trapped above. What is recorded is the
 * members inside them whose loss this campaign will NOT see, so nobody
 * reads a block's `no-delta` as a verdict on all of its lines.
 */
export const UNPROBEABLE = [
  {
    block: "BBX-coverage-accounting",
    member: "Report the uncovered",
    reason:
      "The obligation is discharged in the closing report, which is model " +
      "narration — the one place a probe may not read an observable, since " +
      "the claim and the artifact are the same sentence. Scoring it on disk " +
      "was rejected too: the only on-disk destination for an uncovered " +
      "requirement is `## Pending cases`, which the fenced Unpinned-surface " +
      "and Pending-entries rules already produce in arm B, so the delta " +
      "would measure the fence rather than this block. The sibling member " +
      "`Coverage per requirement` is measured directly instead.",
  },
  {
    block: "BBX-coverage-accounting",
    member: "Second case",
    reason:
      "Its failure is padding — several near-duplicate cases on one " +
      "requirement where no guard or reverse path exists — and near-duplicate " +
      "has no threshold that is not arbitrary. A case count is not it: the " +
      "fenced boundary pair and the fenced money-angle sweep both legitimately " +
      "multiply cases per requirement, so a count would measure the fence.",
  },
  {
    block: "BBX-impl-blindness",
    member: "Before implementation",
    group: "Materializing them",
    reason:
      "Every probe in this file is an authoring run against a repo with no " +
      "test project, so there is no red run to be premature. The member is " +
      "trappable at the materialize end (does the run write a stub and assert " +
      "against it) and belongs to whichever probe file owns that half.",
  },
  {
    block: "BBX-impl-blindness",
    member: "White-box tests are elsewhere",
    group: "Materializing them",
    reason:
      "Already probed as a single rule under MAT-route-whitebox in " +
      "probes/blackboxtests.mjs, on two materialize shapes. Re-probing it " +
      "here would add a second registry entry touching the same bullet with " +
      "no new information; the block's authoring-side members carry the " +
      "verdict instead.",
  },
  {
    block: "BBX-slug-and-sibling-spec",
    member: "Read the sibling spec / Surface line is the fallback contract",
    group: "Materializing them",
    reason:
      "Both fire at materialize time, when a written blackbox.md is read back " +
      "for surface contracts. An authoring run has no blackbox.md to read " +
      "back, so the trap needs a materialize shape: a spec whose §System " +
      "Design pins a base path the cases do not restate, and a second shape " +
      "with no spec.md at all.",
  },
  {
    block: "BBX-depth-and-extra-sweeps",
    member: "Missing depth means full",
    group: "Materializing them",
    reason:
      "Reads a `Depth:` line that is absent from an INPUT blackbox.md, which " +
      "only exists on a materialize shape. The two tier probes above cover " +
      "the selection rule that writes the line; this member covers the " +
      "default when nobody wrote one.",
  },
  {
    block: "BBX-no-backdoors",
    member: "Cleanup is idempotent",
    group: "Materializing them",
    reason:
      "Idempotence of a teardown is a property of executed code, not of the " +
      "one-line `Cleanup:` field a case carries. The authoring-side members " +
      "of the block are trapped above; this one needs a materialize shape " +
      "whose cases carry a real Cleanup.",
  },
];

// Kept for symmetry with probes/blackboxtests.mjs, whose export is
// lowercase; both names point at the same array.
export const unprobeable = UNPROBEABLE;
