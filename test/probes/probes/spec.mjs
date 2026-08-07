/**
 * Stage 4 — the eight UNCERTAIN principles of `kcc-dev-core:spec`.
 *
 * Design order, per test/probes/README.md: the TASK SHAPE is the unit of
 * design, the ablated rule is only the arm. Six prompts over three
 * fixtures carry all sixteen probes below, and each shape plants a trap
 * the ablated arm should fall into near-deterministically. A shape whose
 * B arm passes because nothing tempted it would teach nothing.
 *
 * SHAPES (see SHAPES below for the prompts)
 *   brief      moderate feature + explicit brevity pressure ("一页以内").
 *              Tempts: under-floor counts, dropped sub-sections, silently
 *              guessed parameters.
 *   frontload  same feature, reviewer asks for System Design FIRST.
 *              Tempts: reordering the fixed section list.
 *   admin      internal single-persona CLI tool, no obvious NFR angle,
 *              four load-bearing decisions the input never settles, and
 *              the user pre-empts the AskUserQuestion round ("别问我").
 *              Tempts: one user story, "NFR 不适用", dropped State
 *              Machine / API sub-sections, guesses stated as fact.
 *   prd        a real PRD in docs/ whose own section order is scrambled
 *              and which carries a 验收标准 (acceptance) section; the user
 *              asks to mirror that order and to fold the AC section in.
 *              Tempts: mirroring the source order, copying test cases in.
 *   cases      spec request bundled with "顺便把验收用例也写了给 QA".
 *              Tempts: a second artifact file.
 *   standup    pure brainstorm, oral audience, no artifact wanted.
 *   prddiscuss pure brainstorm about the PRD sitting in the repo.
 *              Tempts: the skill is in force and spec material is on disk.
 *
 * OBSERVABLES are read off the artifact the model wrote, off writtenPaths,
 * or off a blinded judge given the artifact — never off narration. The
 * artifact is reconstructed by replaying Write + Edit tool inputs
 * (replayWrites); a run that produced its file some other way (a Bash
 * heredoc) is unreadable, and deterministic scorers return null for it so
 * the run is dropped rather than counted as a failure.
 *
 * FIXTURES plant package.json + real source: kcc-dev-core's SessionStart
 * hook injects nothing outside a software project, and without the
 * injection every run voids as "arm sentinel absent". No fixture plants
 * `.git` — that would wake the Stop-hook test audit and add a second
 * uncontrolled instruction to both arms.
 *
 * COST ORDER. Arms run B-first. Within a rule, run the FIRST-listed shape
 * first: `effective` needs one shape, and only a `no-delta` obliges the
 * confirmation shape (README's asymmetric bar). Note too that arm A is
 * byte-identical across every rule sharing a shape — only the sentinel
 * token differs — so one arm-A batch per shape could in principle be
 * scored by all five of that shape's scorers; the current runner does not
 * exploit that.
 *
 * RULE IDS below must exist in rules.mjs (owned elsewhere); the anchors
 * they need are listed in this module's return notes, and two of them
 * need a paired snippet edit or arm B is left incoherent:
 *   SPEC-reverify — `Fix defects in place` says "whatever that check
 *     finds", which dangles once `Re-verify every rule` is gone.
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";

// Network off: the skill tells the model to check official docs before
// carrying an item forward, and a call to a disallowed tool would show up
// as a permission denial that voids the run. Identical in both arms.
const FULL_FS = ["WebFetch", "WebSearch", ...NO_DELEGATION];
// Write and Edit must be EXPECTED, not merely allowed: an unexpected
// successful tool call voids a run, so a probe whose failure mode IS
// writing a file would discard its own failures.
const FS_TOOLS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit"];

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const REPORTS_API = {
  "package.json": JSON.stringify(
    {
      name: "reports-api",
      version: "2.3.1",
      private: true,
      type: "module",
      scripts: { start: "node src/server.js", test: "node --test" },
      dependencies: { express: "^4.19.2", pg: "^8.11.5", bullmq: "^5.7.0" },
    },
    null,
    2
  ) + "\n",

  "src/server.js": `import express from "express";
import { reports } from "./routes/reports.js";
import { requireSession } from "./auth.js";

const app = express();
app.use(express.json());
app.use(requireSession);
app.use(reports);
app.listen(process.env.HTTP_PORT ?? 8080);
`,

  "src/routes/reports.js": `import { Router } from "express";
import { listReports, getReport } from "../db/reports.js";

export const reports = Router();

reports.get("/api/reports", async (req, res) => {
  const { from, to } = req.query;
  res.json(await listReports({ teamId: req.user.teamId, from, to, limit: 200 }));
});

reports.get("/api/reports/:id", async (req, res) => {
  const row = await getReport(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.team_id !== req.user.teamId) return res.status(403).json({ error: "forbidden" });
  res.json(row);
});
`,

  "src/db/reports.js": `import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DB_DSN });

export async function listReports({ teamId, from, to, limit }) {
  const { rows } = await pool.query(
    \`select id, team_id, day, rows_count, created_at
       from reports
      where team_id = $1 and day between $2 and $3
      order by day desc
      limit $4\`,
    [teamId, from, to, limit]
  );
  return rows;
}

export async function getReport(id) {
  const { rows } = await pool.query("select * from reports where id = $1", [id]);
  return rows[0] ?? null;
}
`,

  "src/jobs/queue.js": `import { Queue } from "bullmq";

export const jobs = new Queue("reports", { connection: { url: process.env.REDIS_URL } });

export const enqueue = (name, payload) => jobs.add(name, payload, { attempts: 3 });
`,

  "src/auth.js": `export function requireSession(req, res, next) {
  const s = req.header("x-session");
  if (!s) return res.status(401).json({ error: "unauthenticated" });
  req.user = { id: s, teamId: s.split(":")[0], role: s.endsWith("#admin") ? "admin" : "member" };
  next();
}
`,
};

// Product-side PRD. Its own section numbering runs 三 一 五 二 四 六 on
// purpose — the order trap — and §五 is a ready-made acceptance-case list,
// the routing trap. §六 leaves two decisions open, and the PRD never says
// what happens to a subscription when the user loses access to the team.
const PRD = `# PRD：报表订阅通知 v0.4（草稿，产品侧写的）

## 三、我们想的实现方向
用户在报表页订阅之后，每周一早上把上周的报表推给他。产品这边的想法是复用现在
的报表生成任务，生成完顺手发一封邮件，不要再单开一套系统。

## 一、背景
现在用户要自己进后台点报表看，运营反馈「经常忘」。竞品都有订阅推送。

## 五、验收标准（QA 用）
1. 用户在报表页点「订阅」并选「每周一 09:00」，周一 09:00 前后 10 分钟内收到邮件，
   邮件里带本周报表的链接。
2. 用户取消订阅后，下一个周期不再收到邮件。
3. 报表生成失败时，用户收到一封说明失败原因的邮件，而不是一封空报表。
4. 同一周期内不会给同一个用户发两封相同的邮件。

## 二、这期要做的
- 订阅：用户能订阅 / 取消订阅自己团队的报表。
- 频率：先只支持每周一次，周一早上。
- 通道：邮件。
- 用户能在设置页看到自己订阅了哪些报表。

## 四、异常情况
- 邮箱退信：先记下来，连续三次退信就把这个订阅停掉。
- 报表当天没数据：也发，邮件里说明没数据。

## 六、还没定的
- 要不要支持 Slack？运营很想要，但这期人力不够。
- 免费版用户能不能订阅？商业化那边还没答复。
`;

const REPORTS_API_WITH_PRD = { ...REPORTS_API, "docs/prd-notifications.md": PRD };

// The flags table is (key, enabled) only — a percentage rollout needs a
// schema change, so System Design has real material, and "什么维度算百分比 /
// 谁能改 / 怎么回滚 / 审计留多久" are genuinely unsettled by the input.
const OPS_CONSOLE = {
  "package.json": JSON.stringify(
    {
      name: "ops-console",
      version: "0.9.0",
      private: true,
      type: "module",
      bin: { ops: "src/cli.js" },
      scripts: { test: "node --test" },
      dependencies: { pg: "^8.11.5" },
    },
    null,
    2
  ) + "\n",

  "src/cli.js": `#!/usr/bin/env node
import { getFlag, setFlag, listFlags } from "./store/flags.js";
import { appendAudit } from "./audit.js";

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "flags:list":
    console.log(await listFlags());
    break;
  case "flags:get":
    console.log(await getFlag(rest[0]));
    break;
  case "flags:set": {
    const [key, value] = rest;
    await setFlag(key, value === "on");
    await appendAudit({ actor: process.env.USER, action: "flags:set", key, value });
    break;
  }
  default:
    console.error("usage: ops flags:list | flags:get <key> | flags:set <key> on|off");
    process.exit(2);
}
`,

  "src/store/flags.js": `import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.OPS_DSN });

export const listFlags = async () =>
  (await pool.query("select key, enabled from flags order by key")).rows;

export const getFlag = async (key) =>
  (await pool.query("select key, enabled from flags where key = $1", [key])).rows[0] ?? null;

export async function setFlag(key, enabled) {
  await pool.query(
    \`insert into flags (key, enabled) values ($1, $2)
     on conflict (key) do update set enabled = excluded.enabled\`,
    [key, enabled]
  );
}
`,

  "src/audit.js": `import { appendFile } from "node:fs/promises";

export const appendAudit = (entry) =>
  appendFile(
    process.env.OPS_AUDIT_LOG ?? "/var/log/ops-console.jsonl",
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\\n"
  );
`,
};

// ---------------------------------------------------------------------
// Artifact reconstruction and parsing
//
// Every scorer below reads the document the model committed, not what it
// said about the document. The content comes from the Write/Edit tool
// inputs recorded in the transcript, replayed in order.
// ---------------------------------------------------------------------

/** path -> final content, replaying Write then Edit in emission order. */
export function replayWrites(run) {
  const files = new Map();
  for (const call of run.toolCalls ?? []) {
    const p = call.input?.file_path;
    if (!p) continue;
    if (call.name === "Write") {
      if (typeof call.input.content === "string") files.set(p, call.input.content);
    } else if (call.name === "Edit" && files.has(p)) {
      const find = call.input.old_string ?? "";
      const repl = call.input.new_string ?? "";
      if (!find) continue;
      const before = files.get(p);
      files.set(
        p,
        call.input.replace_all ? before.split(find).join(repl) : before.replace(find, () => repl)
      );
    }
  }
  return files;
}

/** Final text of the spec the run produced, or null when unreadable. */
export function specText(run) {
  let found = null;
  for (const [p, content] of replayWrites(run)) {
    if (/spec\.md$/i.test(p)) found = content;
  }
  return found;
}

/** Fenced blocks hide headings (the skill's own Output format template). */
const stripFences = (text) => String(text ?? "").replace(/^```[\s\S]*?^```/gm, "");

// Matched in this order: "Non-functional Requirements" contains
// "functional requirement", so the NFR test must run first.
const SECTION_KINDS = [
  ["nfr", /non-?functional|非功能/i],
  ["summary", /summary|scope|概述|摘要|范围/i],
  ["stories", /user stor|用户故事|故事/i],
  ["fr", /functional requirement|功能需求|功能性需求/i],
  ["design", /system design|系统设计|技术设计/i],
  ["edge", /edge case|错误处理|边界|异常/i],
  ["open", /open item|待定|遗留|未决|待办/i],
];

export const CANONICAL = ["summary", "stories", "fr", "nfr", "design", "edge", "open"];

export const classifyHeading = (title) =>
  (SECTION_KINDS.find(([, re]) => re.test(title)) ?? [null])[0];

/** Level-2 headings, classified, first occurrence order, duplicates dropped. */
export function sectionSequence(text) {
  const seen = [];
  for (const m of stripFences(text).matchAll(/^##\s+(.+?)\s*$/gm)) {
    const kind = classifyHeading(m[1]);
    if (kind && !seen.includes(kind)) seen.push(kind);
  }
  return seen;
}

/** Body of one classified section, or null when the section is absent. */
export function sectionBody(text, kind) {
  const lines = stripFences(text).split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start === -1) {
      if (classifyHeading(m[1]) === kind) start = i + 1;
    } else {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n");
}

/**
 * Order only, never presence: the seven-section rule is a separate KEEP
 * principle and is intact in both arms, so a dropped section must not
 * score as a reordering.
 */
export function sectionOrderOk(text) {
  const idx = sectionSequence(text).map((k) => CANONICAL.indexOf(k));
  return idx.every((v, i) => i === 0 || v > idx[i - 1]);
}

export const allSevenPresent = (text) => {
  const seen = new Set(sectionSequence(text));
  return CANONICAL.every((k) => seen.has(k));
};

/**
 * Distinct ids anywhere in the document. Whole-document counting is
 * deliberate: it survives a model that renames the section, and the id
 * prefixes are disjoint (\b makes "NFR-01" invisible to the FR pattern).
 */
const countIds = (text, re) => new Set(stripFences(text).match(re) ?? []).size;

export const countStories = (text) => countIds(text, /\bUS-\d{1,3}\b/g);
export const countFRs = (text) => countIds(text, /\bFR-\d{1,3}\b/g);
export const countNFRs = (text) => countIds(text, /\bNFR-\d{1,3}\b/g);

const SUB_SECTIONS = [
  /architecture|架构/i,
  /data model|数据模型/i,
  /api|interface|接口/i,
  /state machine|状态机/i,
];

/**
 * All four System Design sub-sections physically present. An
 * inapplicable one still has to appear as `N/A — <reason>`, so presence
 * of the heading is the whole check.
 */
export function designSubSectionsOk(text) {
  const body = sectionBody(text, "design");
  if (body === null) return false;
  const heads = [...body.matchAll(/^#{3,4}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  return SUB_SECTIONS.every((re) => heads.some((h) => re.test(h)));
}

export function openItemsSplitOk(text) {
  const body = sectionBody(text, "open");
  if (body === null) return false;
  const heads = [...body.matchAll(/^#{3,4}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  return (
    heads.some((h) => /resolved|已解决|已确认|已澄清/i.test(h)) &&
    heads.some((h) => /carried forward|carry|遗留|待跟进|后续|未决/i.test(h))
  );
}

// Black-box cases that leaked into the spec: an acceptance/test heading,
// Given/When/Then case bodies, a case-table vocabulary, or BB ids. The
// heading test is anchored so a traceability tag pointing at the PRD's
// §五、验收标准 — which is legitimate — does not trip it.
const CASE_MARKERS = [
  // BB-M01 / BB-C01 / BB-N01, and a bare BB-01.
  /\bBB-[A-Z]?\d/,
  /^#{2,6}[^\n]*(?:验收标准|验收用例|测试用例|测试场景|acceptance criteria|test cases?)/im,
  /^\s*(?:[-*+>]\s*)?(?:\*\*)?(?:Given|GIVEN)\b/m,
  /^\s*(?:[-*+>|]\s*)?(?:\*\*)?(?:前置条件|测试步骤|预期结果|操作步骤)/m,
];

export const hasCaseBlock = (text) => CASE_MARKERS.some((re) => re.test(stripFences(text)));

/** Artifacts other than the one spec.md the skill is allowed to produce. */
export const extraArtifacts = (run) =>
  (run.writtenPaths ?? []).filter((p) => !/spec\.md$/i.test(p));

/**
 * Wrap a scorer that needs the document: a run whose artifact cannot be
 * reconstructed (written through Bash, or never written) measured
 * nothing, and is dropped by returning null rather than scored false.
 */
const onSpec = (fn) => (run) => {
  const text = specText(run);
  return text === null ? null : fn(text, run);
};

// ---------------------------------------------------------------------
// Task shapes — the prompt is the task, the arm is the ablation.
// Exported so a future runner can group runs by shape: within one shape
// every rule's arm A is the same document.
// ---------------------------------------------------------------------

const CSV_FEATURE =
  "报表要支持导出 CSV：用户在报表页选好时间范围和团队之后点「导出」，" +
  "数据量大的时候不能卡住页面，导完了通知用户去下载。";

export const SHAPES = {
  brief: {
    fixture: REPORTS_API,
    prompt:
      `帮我把这个需求写成 spec：${CSV_FEATURE}` +
      "别写太长，一页以内，我要贴到 Jira 里。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
  },

  frontload: {
    fixture: REPORTS_API,
    prompt:
      `把这个需求写成 spec：${CSV_FEATURE}` +
      "系统设计那块放最前面，我们 review 只看这块，别让我往下翻。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
  },

  admin: {
    fixture: OPS_CONSOLE,
    prompt:
      "给 ops-console 加个功能：运维同学能在命令行里把某个功能开关按团队灰度，" +
      "比如先开给 10% 的团队，观察几天再全量。把这个写成 spec。" +
      "我现在在外面，有拿不准的地方你自己定，别问我。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
  },

  prd: {
    fixture: REPORTS_API_WITH_PRD,
    prompt:
      "把 docs/prd-notifications.md 写成 spec。章节顺序照着 PRD 里的走，" +
      "我要跟产品逐条对；验收标准那节也一并放进去，QA 那边直接拿去用。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.8,
  },

  cases: {
    fixture: REPORTS_API,
    prompt:
      "报表页要加「保存筛选条件」：用户能把常用的筛选条件存成命名视图，下次直接选。" +
      "把这个写成 spec；顺便把验收用例也写了，QA 那边直接能用。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.5,
  },

  standup: {
    fixture: REPORTS_API,
    prompt:
      "我们那个报表导出老被吐槽慢。三条路子：加缓存、改成异步任务 + 邮件通知、" +
      "直接上数仓。帮我把取舍过一遍，我等下站会上讲，讲两分钟那种。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 0.8,
  },

  prddiscuss: {
    fixture: REPORTS_API_WITH_PRD,
    prompt:
      "docs/prd-notifications.md 你先看一遍。我下午要跟产品对齐，" +
      "帮我理一下这个 PRD 里哪些地方还没想清楚、实现上有哪些坑。不用联网。",
    disallowedTools: FULL_FS,
    expectedTools: FS_TOOLS,
    maxBudgetUsd: 1.0,
  },
};

// Shared by both `Unresolved becomes ASSUMPTION` probes. The rule's
// marginal claim over the surviving KEEP rules (Open Items exists,
// Carried forward is tagged) is the LINKAGE: a decision the spec acts on
// must be visible as the author's guess, not just listed as future work.
const assumptionRubric = (feature, unstated) =>
  `The document below is an engineering spec written from a short request: ${feature}\n\n` +
  `The request never settles any of these, and the author could not ask:\n${unstated}\n\n` +
  "Question: for at least one of those unsettled points, does the spec BOTH commit to a " +
  "specific answer in its body AND mark that answer as the author's own guess — an " +
  "ASSUMPTION / ASSUMED / 假设 marker, or an explicit open/deferred/blocked entry naming " +
  "that same decision?\n\n" +
  "PASS only if the linkage is visible: the reader can tell that a specific choice the spec " +
  "relies on was guessed rather than given. FAIL if every unsettled point is stated as " +
  "settled fact with no marker, or if the open-questions section only lists generic future " +
  "work (extra channels, phase 2, nice-to-haves) without naming a decision the spec itself " +
  "already acted on. Judge the document only; ignore length and polish.\n\n" +
  "If the text under test is empty, answer VERDICT: FAIL.";

export const PROBES = [
  // ---- count floors -------------------------------------------------
  // Trap (brief): a one-page Jira-ready doc is exactly what collapses a
  // story list to two. The feature is NOT small, so the "Under a floor,
  // say why" escape is not legitimately available to either arm.
  // Trap (admin): one persona (运维), one command — the natural output is
  // a single story.
  {
    id: "spec-us-floor-brief",
    rule: "SP-us-floor",
    title: "three user stories survive an explicit one-page brief",
    ...SHAPES.brief,
    score: onSpec((text) => countStories(text) >= 3),
  },
  {
    id: "spec-us-floor-admin",
    rule: "SP-us-floor",
    title: "three user stories out of a single-persona internal tool",
    ...SHAPES.admin,
    score: onSpec((text) => countStories(text) >= 3),
  },

  {
    id: "spec-fr-floor-brief",
    rule: "SP-fr-floor",
    title: "five functional requirements survive an explicit one-page brief",
    ...SHAPES.brief,
    score: onSpec((text) => countFRs(text) >= 5),
  },
  {
    id: "spec-fr-floor-admin",
    rule: "SP-fr-floor",
    title: "five functional requirements out of a one-command feature",
    ...SHAPES.admin,
    score: onSpec((text) => countFRs(text) >= 5),
  },

  // Trap (admin): an internal CLI has no traffic, no UI and no external
  // user — the section reads as not applicable, which is the exact
  // degeneration the floor is claimed to prevent.
  {
    id: "spec-nfr-floor-admin",
    rule: "SP-nfr-floor",
    title: "three NFRs on an internal tool with no obvious NFR angle",
    ...SHAPES.admin,
    score: onSpec((text) => countNFRs(text) >= 3),
  },
  {
    id: "spec-nfr-floor-brief",
    rule: "SP-nfr-floor",
    title: "three NFRs survive an explicit one-page brief",
    ...SHAPES.brief,
    score: onSpec((text) => countNFRs(text) >= 3),
  },

  // ---- section order ------------------------------------------------
  // Trap (prd): the user asks for the SOURCE document's order, and the
  // source is scrambled (三 一 五 二 四 六). Trap (frontload): the user
  // asks for System Design first. Both are forced choices between the
  // user's instruction and the fixed list; the Output format block stays
  // in arm B, which is precisely the "order comes free with the template"
  // claim under test.
  {
    id: "spec-order-prd",
    rule: "SP-section-order",
    title: "keeps the fixed order when asked to mirror a scrambled PRD",
    ...SHAPES.prd,
    score: onSpec((text) => sectionOrderOk(text)),
  },
  {
    id: "spec-order-frontload",
    rule: "SP-section-order",
    title: "keeps the fixed order when asked to lead with System Design",
    ...SHAPES.frontload,
    score: onSpec((text) => sectionOrderOk(text)),
  },

  // ---- black-box cases are elsewhere --------------------------------
  // Trap (cases): "顺便把验收用例也写了" invites a second artifact.
  // Trap (prd): §五 is a ready-made case list the user asked to fold in,
  // which invites an eighth section instead of a second file. Two
  // different violations, so a pass on one is not a pass on the other.
  {
    id: "spec-bb-cases-file",
    rule: "SP-route-blackbox",
    title: "no second artifact when acceptance cases are asked for too",
    ...SHAPES.cases,
    score: (run) => {
      if (extraArtifacts(run).length > 0) return false;
      const text = specText(run);
      return text === null ? null : !hasCaseBlock(text);
    },
  },
  {
    id: "spec-bb-prd-ac",
    rule: "SP-route-blackbox",
    title: "does not fold the PRD's acceptance-case section into the spec",
    ...SHAPES.prd,
    score: (run) => {
      if (extraArtifacts(run).length > 0) return false;
      const text = specText(run);
      return text === null ? null : !hasCaseBlock(text);
    },
  },

  // ---- brainstorming stays in conversation --------------------------
  // Trap: the skill is in force in both arms and the request is
  // spec-adjacent, but nothing was committed and the audience is a
  // two-minute standup. Any file at all is the failure.
  {
    id: "spec-brainstorm-standup",
    rule: "SP-no-file-brainstorm",
    title: "no file for a comparison the user will deliver out loud",
    ...SHAPES.standup,
    score: (run) => (run.writtenPaths ?? []).length === 0,
  },
  {
    id: "spec-brainstorm-prd",
    rule: "SP-no-file-brainstorm",
    title: "no file when asked to talk through a PRD sitting in the repo",
    ...SHAPES.prddiscuss,
    score: (run) => (run.writtenPaths ?? []).length === 0,
  },

  // ---- unresolved becomes ASSUMPTION --------------------------------
  // Trap (admin): four decisions the input never makes, plus 别问我 to
  // close the AskUserQuestion round, plus a flags table with no per-team
  // column so the spec MUST commit to something. Trap (brief): the same
  // pressure arrives as haste rather than absence.
  {
    id: "spec-assume-admin",
    rule: "SP-unresolved-assumption",
    title: "marks a guessed rollout decision as a guess",
    ...SHAPES.admin,
    judgeText: (run) => specText(run) ?? "",
    judge: {
      rubric: assumptionRubric(
        "add a CLI command to an internal ops console that rolls a feature flag out to a " +
          "percentage of teams. The existing flags table stores only (key, enabled).",
        "- who is allowed to flip or roll out a flag\n" +
          "- what the percentage is computed over, and whether a team's bucket is stable\n" +
          "- whether and how a rollout is rolled back\n" +
          "- whether flag changes must be audited, and for how long the audit is kept"
      ),
    },
  },
  {
    id: "spec-assume-brief",
    rule: "SP-unresolved-assumption",
    title: "marks a guessed export parameter as a guess under time pressure",
    ...SHAPES.brief,
    judgeText: (run) => specText(run) ?? "",
    judge: {
      rubric: assumptionRubric(
        "add CSV export to a reports page — the user picks a date range and a team, clicks " +
          "export, the page must not block, and the user is notified when the file is ready.",
        "- the maximum number of rows (or date span) an export may cover\n" +
          "- how long the generated file is kept, and whether its link expires\n" +
          "- whether a user may export another team's reports\n" +
          "- the CSV's encoding, delimiter and date format"
      ),
    },
  },

  // ---- re-verify every rule -----------------------------------------
  // This rule adds no content of its own, so it is measured as
  // conformance of the finished artifact on shapes engineered to make a
  // first draft drop something a re-read would catch.
  // Trap (admin): a stateless CLI feature with no HTTP surface tempts
  // dropping the State Machine and API sub-sections outright instead of
  // writing "N/A — <reason>".
  // Trap (brief): one-page pressure tempts dropping whole sub-headings.
  {
    id: "spec-reverify-admin",
    rule: "SP-reverify",
    title: "all four System Design sub-sections survive an N/A-heavy feature",
    ...SHAPES.admin,
    score: onSpec((text) => designSubSectionsOk(text)),
  },
  {
    id: "spec-reverify-brief",
    rule: "SP-reverify",
    title: "nothing structural is dropped under one-page pressure",
    ...SHAPES.brief,
    score: onSpec(
      (text) => allSevenPresent(text) && designSubSectionsOk(text) && openItemsSplitOk(text)
    ),
  },
];

/**
 * Recorded rather than shipped as a weak probe.
 */
export const UNPROBEABLE = [
  {
    rule: "SP-unresolved-assumption",
    principle: "Unresolved becomes ASSUMPTION",
    scope: "the post-AskUserQuestion branch only",
    reason:
      "The bullet reads 'anything left unresolved AFTER THAT', where 'that' is the one " +
      "AskUserQuestion call. AskUserQuestion cannot be exercised headless (README), so the " +
      "two probes above short-circuit the ask — the admin shape says 别问我 — and measure " +
      "only the branch where nothing was asked. That branch is the one that always fires in " +
      "a non-interactive session, but a verdict from it does not speak to what the rule does " +
      "after a real question round.",
  },
];
