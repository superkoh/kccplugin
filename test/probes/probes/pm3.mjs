/**
 * kcc-pm charter probes — round 3: validating the two rewritten rules.
 *
 * PM-E02 and PM-L11 measured as rule-failures on the v1 charter (the
 * text drove neither arm), so they were rewritten as trigger-style
 * constraints in the v2 charter. Each probe below reuses the EXACT
 * shape that exposed the failure — if the rewrite works, arm A now
 * passes where both arms used to fail; if it still doesn't, the
 * rewrite is deleted too.
 */
import { FULL_LOCKDOWN } from "../lib/cases.mjs";

const READ_TOOLS = ["Read", "Glob", "Grep"];
const ALLOW = (tools) => FULL_LOCKDOWN.filter((t) => !tools.includes(t));

const FIXTURE = {
  ".kcc-pm.json": '{ "version": 1, "contextDir": "pm" }\n',
  "pm/org.md": [
    "# 公司与角色",
    "",
    "- 产品：NoteFlow，一个跨端笔记应用；免费 + 高级订阅。（事实，2026-08-01，访谈）",
    "- 我的角色边界：产品与增长归我；**变现与定价由商业化团队负责，不归我管**。（事实，2026-08-01，访谈）",
    "- 老板最焦虑：留存上不去，明年预算依赖留存改善。（事实，2026-08-01，访谈）",
    "",
  ].join("\n"),
  "pm/baselines.md": [
    "# 定量基线",
    "",
    "- D1 留存 21%（来源：内部看板 retention-daily；口径：新注册次日活跃/当日新注册；2026-08-01）",
    "- D30 留存 4%（来源：内部看板 retention-daily；口径同上；2026-08-01）",
    "- MAU 42 万（来源：数仓 dws_user_active_monthly；口径：自然月去重活跃；2026-08-01）",
    "- 周活跃创作者占比 9%（来源：数仓；口径：周内新建笔记≥1 的活跃用户占比；2026-08-01）",
    "",
  ].join("\n"),
  "pm/findings.md": [
    "# 内部发现",
    "",
    "- 结论：新手引导缺失导致低激活。（假设，2026-07-15，来源：团队讨论，待验证）",
    "",
  ].join("\n"),
};

export const PROBES = [
  {
    id: "pm3-e02",
    rule: "PM-E02v2",
    title: "rewritten sourcing rule: report numbers carry source+definition+date",
    prompt: "给老板写三句话的周报，说明我们目前的用户规模和留存状况。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(READ_TOOLS),
    expectedTools: READ_TOOLS,
    maxBudgetUsd: 0.8,
    judge: {
      rubric:
        "The reply is a three-sentence weekly report on user scale and retention, written in a workspace whose data files carry each metric's source and definition.\n\nQuestion: does every figure cited in the report carry its source AND its measurement definition (口径) — e.g. '21%（内部看板，新注册次日活跃/当日新注册）' — rather than appearing as bare numbers?\n\nPASS only if the source+definition annotation is present for the cited figures (an explicit pointer like '口径见 pm/baselines.md' counts). Bare numbers, or source without definition, is FAIL.",
    },
  },
  {
    id: "pm3-l11",
    rule: "PM-L11v2",
    title: "rewritten binary-trap rule: yes/no decision becomes a 3-option comparison",
    prompt: "我们要不要做暗色模式？给我一个明确的决策建议。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(READ_TOOLS),
    expectedTools: READ_TOOLS,
    maxBudgetUsd: 0.8,
    judge: {
      rubric:
        "The reply answers a binary 'should we build dark mode, yes or no?' request.\n\nQuestion: does the reply refuse the binary framing — putting the underlying goal on the table and comparing at least three candidate options (e.g. dark mode now / OS-auto only / defer and invest elsewhere / cheap validation first) before recommending — rather than delivering a yes/no with reasons?\n\nPASS only if a genuine ≥3-option comparison structures the decision. A well-argued yes-or-no, even with caveats, is FAIL.",
    },
  },
];
