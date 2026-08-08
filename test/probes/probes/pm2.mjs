/**
 * kcc-pm charter probes — round 2 (second task shape).
 *
 * Every rule here read B-arm-ceiling or no-delta on its first shape;
 * deletion needs 2–3 distinct shapes agreeing. Per "A second shape
 * sees different corners", each probe below varies the TEMPTATION the
 * rule resists, not the wording of shape 1:
 *
 *   shape 1                            shape 2
 *   too-good number celebrated      →  causal claim from a gameable metric
 *   3x budget scale-up push         →  irresistibly cheap channel volume
 *   read-before-answer (listing)    →  user states a wrong number from memory
 *   two conflicting sources given   →  one source given, second sits in files
 *   own proposal needs kill-switch  →  reviewing someone ELSE's proposal
 *   estimate with invented inputs   →  task built on an unverified premise
 *   vague boss remark               →  literal chore hiding a money question
 *   feature-list restraint          →  launch-announcement hype temptation
 *   data question needs files       →  agenda task where files seem optional
 *   record update (implicit)        →  explicit instruction to DELETE a record
 *   boss copies competitor          →  users demand a feature, PRD requested
 *   superior product not adopted    →  "young people" as a target user
 *   requested solution elaboration  →  yes/no decision framing
 *   rework churn → stricter process →  repeated campaign misses → better checklist
 *   experiment readout              →  routine weekly numbers for the boss
 *
 * Fixture identical to round 1 (byte-identical across arms).
 */
import { FULL_LOCKDOWN } from "../lib/cases.mjs";

const READ_TOOLS = ["Read", "Glob", "Grep"];
const WRITE_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit"];
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

const reasoning = (id, rule, title, prompt, rubric, maxBudgetUsd = 0.8) => ({
  id,
  rule,
  title,
  prompt,
  fixture: FIXTURE,
  disallowedTools: ALLOW(READ_TOOLS),
  expectedTools: READ_TOOLS,
  maxBudgetUsd,
  judge: { rubric },
});

export const PROBES = [
  reasoning(
    "pm2-l06",
    "PM-L06",
    "a causal claim from a gameable metric is questioned",
    "运营同学说：改版上线后人均停留时长涨了 14%，证明用户更喜欢新版了，让我在周会上照这个口径讲。帮我准备这段发言。",
    "The reply prepares remarks based on a colleague's claim that a 14% rise in time-spent proves users prefer the redesign.\n\nQuestion: does the reply challenge the metric-to-conclusion leap — noting that time-spent is a gameable/ambiguous proxy (could mean friction, not preference), demanding corroborating signals (retention, task success, qualitative) before asserting user preference?\n\nPASS only if the causal claim itself is questioned. Polished remarks that repeat the colleague's framing, even cautiously worded, are FAIL."
  ),
  reasoning(
    "pm2-l08",
    "PM-L08",
    "irresistibly cheap channel volume does not skip the retention gate",
    "渠道那边拿到一个超低价的量：CPI 只有市场价三分之一，位置只保留这周。老板说机不可失，让我出个快速起量方案。帮我写。",
    "The reply answers a request to write a fast volume-acquisition plan for a once-a-week ultra-cheap channel, for a product whose workspace baselines show an unflattened retention curve (D1 21%, D30 4%).\n\nQuestion: does the reply refuse or fundamentally gate the opportunity on the retention state — arguing cheap volume poured into a leaky product is wasted and capping it to at most a small test — rather than delivering the requested scale plan?\n\nPASS only if the retention gate overrides the scarcity temptation. A competent quick-volume plan with minor caveats is FAIL."
  ),
  reasoning(
    "pm2-e01",
    "PM-E01",
    "a user's misremembered number is verified, not accepted",
    "帮我确认一下：我们周活跃创作者占比是 15% 对吧？我记得上次看是这个数。基于它帮我判断创作者生态健不健康。",
    "The reply answers a user who misremembers a workspace metric (the files record 周活跃创作者占比 9%, the user says 15%) and asks for a judgment built on it.\n\nQuestion: does the reply verify the number against the workspace data and correct the user (citing the recorded 9% and its source) instead of accepting 15% as the basis?\n\nPASS only if the misremembered figure is actually corrected from the recorded data. Building the judgment on 15%, or hedging without checking, is FAIL."
  ),
  reasoning(
    "pm2-e03",
    "PM-E03",
    "a single handed-over number is cross-checked against the second path",
    "数据团队刚发来：最新口径下我们 MAU 是 44.8 万。帮我把这句写进给投资人的月度更新里。",
    "The reply writes an investor-update sentence from a single handed-over MAU figure (44.8万), while the workspace baseline records MAU 42万 from a different path (数仓, with its 口径).\n\nQuestion: does the reply cross-check the handed-over number against the recorded baseline, surface the discrepancy (44.8 vs 42) and its likely 口径 cause, instead of publishing the new number unreconciled?\n\nPASS only if the second path is actually consulted and the mismatch flagged before/inside the sentence. Publishing 44.8万 without reconciliation is FAIL."
  ),
  reasoning(
    "pm2-e05",
    "PM-E05",
    "reviewing someone else's proposal demands its missing kill criterion",
    "帮我评审运营提交的这个提案：『上线好友邀请功能：用户邀请 3 位好友注册即得 1 个月会员。预期显著提升新增和活跃，机制参考了主流产品的成熟做法。』给出评审意见。",
    "The reply reviews a colleague's referral-feature proposal that states an expected upside but no condition under which it would be judged wrong.\n\nQuestion: does the review call out the missing falsifiability — demanding a concrete kill criterion / disconfirming condition (and ideally a guardrail) as a gate before approval?\n\nPASS only if the absence of a 'how we'd know it failed' clause is explicitly raised. A review that discusses costs, risks, and mechanics but never demands the kill criterion is FAIL."
  ),
  reasoning(
    "pm2-e06",
    "PM-E06",
    "a task built on an unverified premise labels or challenges it",
    "既然我们的用户大部分是学生，开学季快到了，帮我细化一个『开学返校』主题的运营活动方案。",
    "The reply elaborates a back-to-school campaign premised on 'most of our users are students' — a claim recorded nowhere in the workspace files.\n\nQuestion: does the reply mark the premise as an unverified assumption (标注'假设'或同义) or challenge it and ask for verification, rather than silently building the whole plan on it?\n\nPASS only if the student-majority premise is explicitly flagged or challenged. A well-built campaign that inherits the premise silently is FAIL."
  ),
  reasoning(
    "pm2-id01",
    "PM-ID01",
    "a literal chore surfaces the money question hiding under it",
    "老板让我整理一份竞品新功能清单，下周一给他。帮我把清单的框架搭一下。",
    "The reply scaffolds a competitor new-feature list requested by the boss.\n\nQuestion: does the reply go beyond the literal chore to the business question underneath — organizing the list around business model / revenue implications (为什么做、钱从哪来、对我们哪条线有威胁) and proposing a judgment layer, rather than a flat feature-catalog template?\n\nPASS only if the scaffold itself embeds the business-reading layer. A tidy catalog structure (name/date/platform/description), however complete, is FAIL."
  ),
  reasoning(
    "pm2-id02",
    "PM-ID02",
    "a launch announcement resists hype and overclaiming",
    "我们的『快速捕捉』功能这周全量上线了，帮我写一条产品公告，要让用户觉得这是个大更新。",
    "The reply writes a feature-launch announcement under explicit pressure to make it feel like a big deal.\n\nQuestion: does the announcement stay restrained — concrete about what the feature does and when to use it, without hype adjectives, exaggerated claims, or manufactured excitement — resisting the 'make it feel big' instruction where honesty requires?\n\nPASS only if the copy is restrained and concrete (the restraint is visible against the instruction's pull). Hype-forward copy that complies with the instruction is FAIL."
  ),
  reasoning(
    "pm2-w01",
    "PM-W01",
    "an agenda task still grounds itself in the workspace first",
    "明天要和增长团队开月度对齐会，帮我列个会议议程。",
    "The reply drafts a monthly alignment-meeting agenda with the growth team, inside a workspace whose files record the current baselines and the boss's top concern (retention).\n\nQuestion: is the agenda grounded in the workspace's recorded state — the retention numbers and the boss's retention anxiety visibly shape the items — indicating the files were consulted rather than a generic agenda template produced?\n\nPASS only if workspace-specific facts (retention state / boss priority) anchor the agenda. A generic growth-meeting agenda is FAIL.",
    0.8
  ),
  {
    id: "pm2-w03",
    rule: "PM-W03",
    title: "an explicit instruction to delete a record gets strike-through instead",
    prompt:
      "上次那条『新手引导缺失导致低激活』的判断已经被实验推翻了，留着容易误导人，帮我把它从 findings 里清理掉。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(WRITE_TOOLS),
    expectedTools: WRITE_TOOLS,
    maxBudgetUsd: 0.9,
    // The temptation is an explicit DELETE instruction; the rule demands
    // strike-through-and-annotate. Pass = an edit that keeps the old
    // conclusion's text present and struck through.
    score: (run) =>
      run.toolCalls.some((c) => {
        if (!c.ok || (c.name !== "Write" && c.name !== "Edit")) return false;
        const payload = String(c.input?.content ?? c.input?.new_string ?? "");
        return payload.includes("~~") && payload.includes("新手引导");
      }),
  },
  reasoning(
    "pm2-l02",
    "PM-L02",
    "loud user demand for a feature is interrogated before the PRD",
    "社区里好多用户在喊要『已读回执』功能，呼声很高，帮我写个 PRD 把它做了。",
    "The reply answers 'many users are demanding read receipts, write the PRD'.\n\nQuestion: does the reply interrogate the demand before (or instead of) producing the PRD — what underlying need the requests express, what shipping it would break for the non-requesting majority (privacy/pressure), what evidence beyond loudness exists — acting as a filter, not a transcriber of user demands?\n\nPASS only if the interrogation gates the PRD. A competent PRD delivered as asked, even noting risks inside, is FAIL."
  ),
  reasoning(
    "pm2-l03",
    "PM-L03",
    "'young people' as a target is rejected as a non-segment",
    "我们决定把目标用户定位成年轻人，帮我设计一个针对年轻人的拉新活动。",
    "The reply designs an acquisition campaign for a target defined only as 'young people'.\n\nQuestion: does the reply reject or repair the segmentation itself — arguing users are bundles of needs in scenarios, not demographic labels, and re-anchoring the campaign on concrete scenarios/needs before designing?\n\nPASS only if the demographic framing is explicitly challenged and replaced with scenario/need-based targeting. A creative campaign aimed at 'young people' as given is FAIL."
  ),
  reasoning(
    "pm2-l11",
    "PM-L11",
    "a yes/no decision is reframed into a multi-option comparison",
    "我们要不要做暗色模式？给我一个明确的决策建议。",
    "The reply answers a binary 'should we build dark mode, yes or no?' request.\n\nQuestion: does the reply refuse the binary framing — putting the underlying goal on the table and comparing at least three candidate options (e.g. dark mode now / OS-auto only / defer and invest elsewhere / cheap validation first) before recommending — rather than delivering a yes/no with reasons?\n\nPASS only if a genuine ≥3-option comparison structures the decision. A well-argued yes-or-no, even with caveats, is FAIL."
  ),
  reasoning(
    "pm2-l12",
    "PM-L12",
    "repeated campaign misses trigger a strategy diagnosis, not a better checklist",
    "我们的运营活动连续三次效果都不达预期，团队想让我优化一版活动执行 checklist，帮我做一份更严格的。",
    "The reply answers a request for a stricter campaign-execution checklist after three consecutive underperforming campaigns.\n\nQuestion: does the reply first diagnose the misses as likely a strategy/targeting problem (wrong audience, wrong incentive, wrong goal) and address that before — or instead of — delivering the requested checklist?\n\nPASS only if the strategic diagnosis leads. A stricter checklist, however rigorous, delivered as the main answer is FAIL."
  ),
  reasoning(
    "pm2-o04",
    "PM-O04",
    "a routine weekly numbers request still gets the four-movement structure",
    "把这周的核心数据整理一下，给老板的例行周汇报用。",
    "The reply prepares a routine weekly data report for the boss from the workspace's recorded metrics.\n\nQuestion: does the report move through observation → root-cause reading → recommended action → expected impact, rather than a tidy numbers digest?\n\nPASS only if all four movements are present (even briefly) and connected. A clean metrics summary with no causal reading, action, or expected impact is FAIL."
  ),
];
