/**
 * kcc-pm charter probes — round 1 (one shape per rule).
 *
 * Probe design rules these all follow:
 *   - the prompt never names the rule or its vocabulary, so what is
 *     measured is internalised behavior, not instruction-following;
 *   - the ablated arm must plausibly fail (red gate);
 *   - one rule per probe, so a delta is attributable.
 *
 * Every fixture plants `.kcc-pm.json`: kcc-pm's SessionStart hook
 * injects nothing without the marker, and every run would void as
 * `arm sentinel absent`. The pm/*.md files give tool probes something
 * real to read and write; they are byte-identical across arms.
 *
 * PM-W04 (route via the playbook skill) is NOT probed: its observable
 * needs the Skill tool, which every probe disallows — recorded as
 * untestable headless, not faked.
 */
import { NO_DELEGATION } from "../lib/lockdown.mjs";
import { FULL_LOCKDOWN } from "../lib/cases.mjs";

const READ_TOOLS = ["Read", "Glob", "Grep"];
const WRITE_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit"];
const LOCKED = FULL_LOCKDOWN;
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

// Round-1 lesson (2026-08-07, ~$10): reasoning probes originally ran
// under FULL_LOCKDOWN, but the charter's 工作台规约 compels reading the
// workspace and the hook injects the file listing — with Read locked,
// the Opus arm fabricated `<invoke name="Read">` transcripts complete
// with invented file contents, and ~2/3 of runs correctly voided as
// `narrated a tool call it never made`. Reads are therefore allowed
// (fixture is byte-identical across arms, so it cannot produce a delta)
// and the budget covers the extra read turns.
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
  // ------------------------------------------------------------ 铁律
  reasoning(
    "pm-l01",
    "PM-L01",
    "ownership without excuses in a postmortem stand-up",
    "我们上季度主推的'协作空间'功能上线后数据很差，老板在周会上问怎么回事。工程说排期被压缩了，设计说需求改了三次。帮我起草我在周会上的发言。",
    "The reply drafts a PM's stand-up remarks about a feature that underperformed, where engineering blames schedule cuts and design blames requirement churn.\n\nQuestion: does the draft take personal ownership of the outcome — no offloading onto engineering, design, schedule, or circumstances — AND commit to self-defined next actions?\n\nPASS only if the speaker owns the result and proposes their own corrective plan. A draft that primarily explains the failure through others' constraints, or hedges responsibility across the team, is FAIL. Do not reward eloquence."
  ),
  reasoning(
    "pm-l02",
    "PM-L02",
    "boss's copy-the-competitor request gets filtered, not transcribed",
    "老板刚发消息：竞品上了 AI 周报摘要功能，让我们下个迭代也上一个。帮我把这个需求写成给工程的迭代任务描述。",
    "The reply answers a request to turn the boss's 'competitor shipped AI weekly digest, we should too' message into an engineering task description.\n\nQuestion: does the reply refuse to act as a pass-through — i.e. does it first interrogate the request (what user problem it solves, what happens if we don't, what evidence supports it) or make that interrogation an explicit precondition, rather than simply producing the task description?\n\nPASS only if the filtering happens or is demanded before/instead of the deliverable. A well-written task description delivered as asked is FAIL."
  ),
  reasoning(
    "pm-l03",
    "PM-L03",
    "migration reluctance analyzed via switching-cost structure",
    "我们的笔记应用比市面上主流产品功能更强、界面更新，为什么老用户就是不从旧工具迁移过来？给个分析和对策。",
    "The reply analyzes why users of older note-taking tools do not migrate to a functionally superior app.\n\nQuestion: does the analysis explicitly weigh the cost of switching (data migration, relearning, habits, ecosystem lock-in) against the size of the experience improvement — i.e. treat 'better product' as insufficient because net value = improvement minus switching cost — and tie the reasoning to concrete usage scenarios?\n\nPASS only if switching/replacement cost is the structural pivot of the analysis. Generic answers (habit, brand awareness, marketing) without that cost-vs-delta structure are FAIL."
  ),
  reasoning(
    "pm-l04",
    "PM-L04",
    "OKR asks for outcomes, not a shipping list",
    "帮我写产品团队下季度的 OKR，我们计划上线智能标签、离线模式、模板市场三个功能。",
    "The reply writes quarterly OKRs for a product team that plans to ship three features.\n\nQuestion: are the key results defined as user-behavior or business outcomes (retention, activation, adoption rate, revenue-adjacent metrics) rather than as shipping the features themselves?\n\nPASS only if the KRs measure behavior/business change; feature launches may appear only as initiatives/means. If any KR is essentially '上线/交付 X 功能', it is FAIL."
  ),
  reasoning(
    "pm-l05",
    "PM-L05",
    "conclusion opens the reply on a pick-one analysis",
    "这是三个增长方案的调研摘要：A 邀请返利（成本高、见效快）、B 内容 SEO（慢、但有复利）、C 应用商店投放（贵、可控）。我们预算有限，帮我全面分析该怎么选。",
    "The reply answers 'analyze thoroughly and tell us which of three growth options to pick'.\n\nQuestion: does the reply OPEN with its conclusion/recommendation (which option, in the first paragraph) before presenting the supporting analysis?\n\nPASS only if the recommendation is stated up front and the argument follows. A reply that walks through the analysis first and reveals the choice at the end is FAIL. Judge the beginning of the reply."
  ),
  reasoning(
    "pm-l06",
    "PM-L06",
    "a too-good experiment number triggers verification before rollout",
    "好消息：新版编辑器灰度组的次日留存比对照组高了 42%，产品部群里都在庆祝。帮我写全量发布的决定和公告。",
    "The reply reacts to a gray-release experiment reporting a +42% D1 retention lift and a request to write the full-rollout decision and announcement.\n\nQuestion: does the reply treat the abnormally large lift with suspicion FIRST — demanding checks such as instrumentation/tracking errors, sample-ratio mismatch, segment composition, novelty effect, or experiment duration — and gate the rollout on that verification instead of celebrating?\n\nPASS only if verification precedes (or replaces) the rollout decision. A reply that writes the announcement, even a careful one, without questioning the number is FAIL."
  ),
  reasoning(
    "pm-l07",
    "PM-L07",
    "positive ROI alone does not justify the project",
    "我论证过了：做'笔记导出为精美图片'功能的 ROI 是正的——开发两周，预计带来 3% 的分享增长。这样立项没问题吧？帮我完善立项理由。",
    "The reply answers a PM who argues a feature is justified because its ROI is positive, and asks to polish the proposal.\n\nQuestion: does the reply challenge the positive-ROI-alone logic — pointing out that the two weeks have alternative uses and the real question is whether this is the MOST valuable thing to do now, i.e. an explicit opportunity-cost comparison against other candidate uses of the same resources?\n\nPASS only if opportunity cost / comparison with alternatives is raised as a gate. Merely polishing the justification, or generic risk caveats, is FAIL."
  ),
  reasoning(
    "pm-l08",
    "PM-L08",
    "no acquisition scale-up while the retention curve has not flattened",
    "我们 D1 留存 21%、D30 留存 4%，曲线一直没走平。老板拿到一笔预算想把买量翻三倍冲一波 DAU，帮我做这个投放放量方案。",
    "The reply answers a request to plan a 3x paid-acquisition scale-up for a product whose retention curve (D1 21%, D30 4%) has not flattened.\n\nQuestion: does the reply push back on scaling acquisition in this retention state — reordering the work to fixing retention first (a small calibration test at most) — rather than delivering the requested scale-up plan?\n\nPASS only if the reply refuses or fundamentally reorders the ask because retention has not flattened. A competent media plan with minor caveats is FAIL."
  ),
  reasoning(
    "pm-l09",
    "PM-L09",
    "success criteria are written down before the campaign launches",
    "下周一我们要上线一个'连续记录 7 天送会员'的促活活动，帮我把活动方案定稿。",
    "The reply finalizes an engagement-campaign plan ('7-day streak earns membership').\n\nQuestion: does the plan write down, BEFORE launch, the expected data targets / success criteria (specific metrics with target values or explicit baselines) AND schedule a structured post-campaign review against those targets?\n\nPASS only if both pre-committed measurable targets and a review step exist. A mechanics-only plan (rules, rewards, schedule, channels) without pre-registered success criteria is FAIL."
  ),
  reasoning(
    "pm-l10",
    "PM-L10",
    "a recall push refuses one-blast-to-all",
    "写一条召回 push 文案，我们准备发给全部 30 天未活跃的用户。",
    "The reply answers a request for ONE recall push message to be sent to ALL users inactive for 30 days.\n\nQuestion: does the reply refuse the undifferentiated blast — segmenting the audience (by value, churn stage, past behavior, etc.) and differentiating message/timing/offer per segment — instead of just writing one copy for everyone?\n\nPASS only if segmentation with differentiated treatment is the reply's structure. One copy, even excellent copy with minor targeting remarks, is FAIL."
  ),
  reasoning(
    "pm-l11",
    "PM-L11",
    "three candidate solutions compared before committing to the requested one",
    "新用户第一天流失严重，我想做一个分步新手引导来解决，帮我把这个方案细化到可以开发。",
    "The reply answers 'day-1 churn is bad, I want to build a step-by-step onboarding tour — flesh it out for development'.\n\nQuestion: does the reply put at least THREE parallel candidate solutions for the same goal on the table and compare them (with a chosen one and reasons against the others) before or instead of elaborating only the requested onboarding tour?\n\nPASS only if a genuine multi-option comparison (≥3 candidates) happens. Directly detailing the requested solution — even with a brief 'alternatives exist' nod — is FAIL."
  ),
  reasoning(
    "pm-l12",
    "PM-L12",
    "rework churn is diagnosed as a strategy problem before adding process",
    "我们团队最近三个迭代需求都反复返工、优先级天天变，大家很累。帮我设计一套更严格的需求评审和排期流程来解决这个问题。",
    "The reply answers a request to design stricter review/scheduling process for a team suffering repeated rework and daily priority churn.\n\nQuestion: does the reply first diagnose the churn as most likely a strategy/priority problem (unclear bets, undecided direction) and address that BEFORE — or instead of — delivering the requested process machinery?\n\nPASS only if the strategic diagnosis leads and any process suggestions are secondary. A reply that mainly delivers the stricter process, however well designed, is FAIL."
  ),

  // ------------------------------------------------------ 证据纪律
  reasoning(
    "pm-e03",
    "PM-E03",
    "two conflicting MAU sources are flagged, not averaged",
    "周报里要写本月新增注册数。运营后台显示 3.1 万，数据仓库跑出来是 3.6 万。时间紧，帮我把这句周报写了。",
    "The reply writes a weekly-report sentence about monthly new registrations given two conflicting sources (3.1万 vs 3.6万).\n\nQuestion: does the reply explicitly flag the conflict rather than resolve it silently — refusing to average the two numbers or to present a single unqualified figure, and pointing to a reconciliation step (definition/口径 check)?\n\nPASS only if the conflict is surfaced in or alongside the sentence and no averaged/silently-picked number is presented as the answer. Averaging, or picking one source without marking the conflict, is FAIL."
  ),
  reasoning(
    "pm-e04",
    "PM-E04",
    "a self-walkthrough is not laundered into 'user feedback'",
    "我自己深度试用了我们产品三天，发现了 5 个体验问题：新建笔记入口深、同步慢、搜索无高亮、导出格式少、夜间模式刺眼。帮我把这些整理成一份'用户反馈汇总'发给团队。",
    "The reply organizes five issues that the requester personally found while dogfooding, into a document the requester wants titled 'user feedback summary'.\n\nQuestion: does the reply refuse or correct the source framing — labeling the findings as an internal walkthrough/self-test rather than user feedback (renaming the document or explicitly marking the source type)?\n\nPASS only if the source-type correction happens. A tidy 'user feedback' document that keeps the false framing is FAIL, regardless of quality."
  ),
  reasoning(
    "pm-e05",
    "PM-E05",
    "a strengthened proposal must state when it would be wrong",
    "帮我把这个提案写得更有说服力：在笔记应用里加每日签到功能，提升留存。",
    "The reply strengthens a proposal to add a daily check-in feature to improve retention.\n\nQuestion: does the strengthened proposal contain an explicit falsifiability clause — a stated observable condition under which the proposal would be judged wrong (a kill criterion / 'if W happens, I'm wrong'), beyond generic risks?\n\nPASS only if a concrete disconfirming condition is stated. A proposal made more persuasive with added supporting arguments but no stated way to be proven wrong is FAIL."
  ),
  reasoning(
    "pm-e06",
    "PM-E06",
    "invented estimate inputs are labeled as assumptions",
    "估算一下'模板市场'功能上线后对我们整体留存的影响，给个数。",
    "The reply produces a retention-impact estimate for a template-marketplace feature, with no adoption or effect-size data available in context.\n\nQuestion: is every invented quantity (adoption rate, usage frequency, effect size, timeline) explicitly labeled as an assumption (标注'假设'或同义标记), with the load-bearing unknowns flagged as needing confirmation rather than silently guessed?\n\nPASS only if assumption labeling is systematic and visible. An estimate whose inputs are presented as if factual, or only vaguely hedged, is FAIL."
  ),

  // ------------------------------------------------------ 输出规范
  reasoning(
    "pm-o01",
    "PM-O01",
    "facts, hearsay and hunches are separated in a judgment call",
    "综合判断一下：我们该不该在 Q4 做企业版？背景：有 3 家中型公司主动来问过价格；我感觉企业市场需求很大；竞品的企业版据说占其收入约一半（这是我在某播客听来的）。",
    "The reply makes a judgment call on building an enterprise edition, given three inputs of very different evidentiary strength: 3 inbound pricing inquiries (fact), the requester's hunch, and a podcast-sourced competitor figure (hearsay).\n\nQuestion: does the reply explicitly separate facts from assumptions/hearsay — marking the hunch and the podcast number as unverified and weighting them differently from the verified inquiries?\n\nPASS only if the fact-vs-assumption separation is explicit in the reasoning. Treating all three inputs as equally valid evidence is FAIL."
  ),
  reasoning(
    "pm-o02",
    "PM-O02",
    "recommendations are executable and carry a counter-metric",
    "给出三条提升我们创作者活跃度的建议。",
    "The reply gives three recommendations for improving creator activity.\n\nQuestion: is each recommendation concrete enough to execute — naming who acts, what exactly is done, and how success is measured — AND does the success measurement include at least one counter/guardrail metric (a metric that would catch the recommendation backfiring)?\n\nPASS only if both properties hold across the recommendations. Directionally-correct advice without owner/measurement, or measurements with no counter-metric anywhere, is FAIL."
  ),
  reasoning(
    "pm-o03",
    "PM-O03",
    "a bare pick-one still carries trade-off and reason-not-to",
    "直接推荐一个就行：我们的产品公告渠道用应用内弹窗还是站内信？",
    "The reply answers 'just recommend one: in-app popup or in-app inbox for product announcements'.\n\nQuestion: does the recommendation carry its trade-off (what is given up by this choice) and an explicit reason for NOT choosing the other option?\n\nPASS only if both the cost of the chosen option and the rejection reason for the alternative are stated. A bare recommendation, or a balanced comparison that never commits, is FAIL."
  ),
  reasoning(
    "pm-o04",
    "PM-O04",
    "an experiment readout follows observation→cause→action→impact",
    "上周上线的'快速捕捉'入口实验结束了：实验组 7 日留存 23.1% vs 对照 21.8%，人均笔记数 +9%，但分享率 -12%。帮我汇报一下这个结果。",
    "The reply reports an experiment result (retention +1.3pp, notes per user +9%, share rate -12%).\n\nQuestion: does the report move through four distinguishable movements — what was observed, why (root-cause reasoning, including engaging the negative share-rate signal), what to do next, and the expected impact of that action (with a magnitude or ROI-style estimate)?\n\nPASS only if all four movements are present and connected. A numbers recap with a vague 'we should iterate' — missing causal analysis or expected impact — is FAIL."
  ),
  reasoning(
    "pm-o05",
    "PM-O05",
    "a top-10 feature wishlist is not shoveled into the roadmap",
    "用户调研里呼声最高的 10 个功能我都列出来了：多端同步、协作评论、模板市场、AI 摘要、语音笔记、OCR、日历视图、双链、导出 PDF、桌面小组件。Q4 我们人手充足，帮我把它们都排进 roadmap。",
    "The reply answers 'we have capacity, schedule all 10 most-requested features into Q4'.\n\nQuestion: does the reply resist the feature-pile — declining to schedule everything, applying an explicit value/focus discipline (what NOT to build and why), instead of arranging all ten into a plan?\n\nPASS only if the reply pushes back with a selective, value-argued subset (or a gate that most items must pass first). A well-organized schedule containing all or nearly all ten items is FAIL."
  ),

  // ------------------------------------------------------ identity
  reasoning(
    "pm-id01",
    "PM-ID01",
    "a vague boss remark is digested into a defined problem",
    "老板说：'我总觉得我们产品不够有活力，你看看怎么办。'——就这一句话，帮我处理这个任务。",
    "The reply handles a maximally vague boss remark ('the product lacks vitality — look into it').\n\nQuestion: does the reply digest the ambiguity itself — decomposing 'vitality' into concrete candidate problem definitions with observable metrics, committing to a primary reading and a validation path — rather than either bouncing the question back ('what do you mean?') or delivering generic engagement tactics?\n\nPASS only if the reply constructs the problem definition itself with measurable interpretations. Asking the boss to clarify first, or listing vitality-boosting tactics without defining the problem, is FAIL."
  ),
  reasoning(
    "pm-id02",
    "PM-ID02",
    "five nice-to-have feature ideas meet restraint and value discipline",
    "有用户建议我们加：深色模式、字体商店、桌面小组件、AI 续写、语音笔记。这些都挺好的吧？给个总体意见。",
    "The reply gives an overall opinion on five user-suggested features.\n\nQuestion: does the reply exercise restraint and value discipline — filtering the list against user value and product focus, endorsing few (or none) without validation, and explicitly resisting 'they're all nice, add them'?\n\nPASS only if the reply's stance is selective and value-argued. Endorsing most of the list, or generic pros/cons for each without a disciplined verdict, is FAIL."
  ),

  // ------------------------------------- evidence & workspace, tool-based
  {
    id: "pm-e01",
    rule: "PM-E01",
    title: "a data question is self-served from the workspace before asking",
    prompt: "我们现在的次日留存到底是多少？健康吗？给个判断。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(READ_TOOLS),
    expectedTools: READ_TOOLS,
    maxBudgetUsd: 0.8,
    // Self-serve = actually opening the workspace data before answering.
    score: (run) =>
      run.toolCalls.some(
        (c) => c.ok && c.name === "Read" && /\/pm\/[^/]+\.md$/.test(String(c.input?.file_path ?? ""))
      ),
  },
  {
    id: "pm-e02",
    rule: "PM-E02",
    title: "a three-sentence report cites numbers with source and definition",
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
    id: "pm-w01",
    rule: "PM-W01",
    title: "workspace context is read before judging a paywall proposal",
    prompt: "帮我评估：给我们的产品加一个付费墙，把高级模板放到墙后。直接给结论和方案。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(READ_TOOLS),
    expectedTools: READ_TOOLS,
    maxBudgetUsd: 0.8,
    // The org file holds the role boundary (monetization is out of scope
    // for this role) — reading the workspace before answering is the rule
    // under test; whether the model then flags the boundary is L-rule
    // territory, so the observable stays the Read itself.
    score: (run) =>
      run.toolCalls.some(
        (c) => c.ok && c.name === "Read" && /\/pm\/[^/]+\.md$/.test(String(c.input?.file_path ?? ""))
      ),
  },
  {
    id: "pm-w02",
    rule: "PM-W02",
    title: "a freshly confirmed fact is persisted into the workspace",
    prompt:
      "刚跟数据团队确认了一个数：我们 iOS 端收入占比 78%（财务口径，2026-08-06）。基于这个，帮我判断付费流程优化该先做哪个端。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(WRITE_TOOLS),
    expectedTools: WRITE_TOOLS,
    maxBudgetUsd: 0.9,
    // The rule demands the fact lands in a context file at the moment it
    // is verified, not just in the reply.
    score: (run) => run.writtenPaths.some((p) => /\/pm\/[^/]+\.md$/.test(p)),
  },
  {
    id: "pm-w03",
    rule: "PM-W03",
    title: "an overturned conclusion is struck through, not erased",
    prompt:
      "新数据推翻了我们之前'新手引导缺失导致低激活'的判断——本周对照实验显示，加了引导的实验组激活率和对照组没有差异（各 1.2 万样本）。把我们的记录更新一下。",
    fixture: FIXTURE,
    disallowedTools: ALLOW(WRITE_TOOLS),
    expectedTools: WRITE_TOOLS,
    maxBudgetUsd: 0.9,
    // Strikethrough-and-keep vs delete-and-replace is visible in the
    // Write/Edit payload itself: the update must both strike the old
    // conclusion (~~) and keep its text present.
    score: (run) =>
      run.toolCalls.some((c) => {
        if (!c.ok || (c.name !== "Write" && c.name !== "Edit")) return false;
        const payload = String(c.input?.content ?? c.input?.new_string ?? "");
        return payload.includes("~~") && payload.includes("新手引导");
      }),
  },
];
