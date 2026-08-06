/**
 * Stage 1 — the S1 (first-principles) family.
 *
 * Probe design rules these all follow:
 *   - the prompt never names the rule or its vocabulary, so what is
 *     measured is internalised behavior, not instruction-following;
 *   - the ablated arm must plausibly fail (red gate), otherwise the
 *     probe cannot produce a delta;
 *   - one rule per probe, so a delta is attributable.
 *
 * `score` is deterministic and runs locally. `judge` hands a blinded
 * reply to a separate model with a binary rubric; probes carry one or
 * the other, never both.
 */
import {
  opensWithTargetBlock,
  containsTargetBlock,
} from "../lib/score.mjs";

// Tool lockdown is a whitelist expressed as an exhaustive blacklist:
// blocking only the obvious tools is not enough. Measured — with Bash
// denied, one run reached a shell through `Monitor` anyway and spent its
// reply narrating its own tool activity. Anything that can execute,
// delegate, schedule or message is listed here, and run-probe.mjs
// independently voids any run that calls a tool outside a probe's
// declared `expectedTools`, so a newly-shipped CLI tool cannot silently
// distort a campaign.
const NO_DELEGATION = [
  "Agent", "Task", "Skill", "ToolSearch", "TodoWrite",
  "Monitor", "Workflow", "ScheduleWakeup", "SendMessage", "PushNotification",
  "CronCreate", "CronDelete", "CronList", "RemoteTrigger", "DesignSync",
  "EnterWorktree", "ExitWorktree", "ReportFindings",
  "TaskCreate", "TaskGet", "TaskList", "TaskOutput", "TaskStop", "TaskUpdate",
];
const LOCKED = [
  "Read", "Glob", "Grep", "Bash", "Write", "Edit", "NotebookEdit",
  "WebFetch", "WebSearch", ...NO_DELEGATION,
];
const FILE_TOOLS_ONLY = ["Glob", "Grep", "WebFetch", "WebSearch", ...NO_DELEGATION];

export const PROBES = [
  {
    id: "s1a-trigger",
    rule: "S1-whole",
    title: "🎯 block opens the reply on an open-ended request",
    prompt:
      "我们的 Node 服务每天凌晨用一个脚本把前一天的 CSV 报表逐行 INSERT 进 Postgres，" +
      "现在数据量涨到脚本要跑四个小时，帮我优化一下这个导入流程。",
    disallowedTools: LOCKED,
    maxBudgetUsd: 0.6,
    score: (run) => opensWithTargetBlock(run.finalText),
  },

  {
    id: "s1b-skip",
    rule: "S1-skip",
    title: "no 🎯 block on a single-point factual query",
    prompt: "JavaScript 里 Array.isArray([]) 返回什么？",
    disallowedTools: LOCKED,
    maxBudgetUsd: 0.3,
    score: (run) => !containsTargetBlock(run.finalText),
  },

  {
    id: "s1c-preamble",
    rule: "S1-preamble",
    title: "🎯 survives a do-the-work-then-report turn",
    prompt:
      "当前目录下建一个 config.json，内容是 {\"retries\": 3, \"timeoutMs\": 5000}，" +
      "然后再建一个 README.md 说明这两个字段的含义。做完把结果报告给我。",
    disallowedTools: FILE_TOOLS_ONLY,
    expectedTools: ["Write", "Edit", "Read", "Bash"],
    maxBudgetUsd: 0.8,
    // Multi-turn: the reply opens before the work, so the observable is
    // the first assistant text block, not the post-work summary.
    score: (run) => opensWithTargetBlock(run.assistantTexts[0] ?? ""),
  },

  {
    id: "s1d-contrast",
    rule: "S1-contrast",
    title: 'the real-problem facet names the rejected reading ("A, not B")',
    prompt:
      "我们的埋点上报接口最近老是丢数据，帮我加个重试机制吧，" +
      "客户端失败了就重试三次。",
    disallowedTools: LOCKED,
    maxBudgetUsd: 0.6,
    judge: {
      rubric:
        "The reply below answers a request to add client-side retries to an analytics " +
        "ingestion endpoint that is 'losing data'.\n\n" +
        "Question: does the reply explicitly contrast what it believes the REAL problem " +
        "is against a DIFFERENT, named surface reading of the request — i.e. does it say " +
        "in substance 'the real problem is A, not B', where B is the literal request or " +
        "the obvious misreading?\n\n" +
        "PASS only if a specific rejected alternative reading is named. A reply that " +
        "merely restates the task, or that lists considerations without contrasting one " +
        "framing against another, is FAIL. Do not reward general thoroughness.",
    },
  },

  {
    id: "s1e-none",
    rule: "S1-none",
    title: 'empty facets are marked "none" instead of filled with filler',
    prompt:
      "写一个 JS 函数，把形如 [{id, parentId}] 的扁平数组转成树。" +
      "根节点的 parentId 为 null；输入保证 id 唯一、无环、每个非根节点的 parentId 都存在。" +
      "给出实现即可。",
    disallowedTools: LOCKED,
    maxBudgetUsd: 0.6,
    judge: {
      rubric:
        "The task the reply answers stated ALL of its constraints explicitly: unique ids, " +
        "no cycles, every non-root parentId exists, root parentId is null. There is " +
        "genuinely nothing hidden left to assume.\n\n" +
        "Question: in the reply's structured first-principles block (if present), are " +
        "facets with nothing real to report marked with a literal 'none' / '无' rather " +
        "than filled with manufactured content?\n\n" +
        "PASS if empty facets are explicitly marked as empty, or if every facet stated " +
        "carries real, non-restated content. FAIL if any facet is padded — e.g. an " +
        "'assumption' that merely restates a constraint the task already gave, or a " +
        "manufactured risk the task rules out. If the reply has no such block at all, " +
        "answer FAIL.",
    },
  },

  {
    id: "s1f-trap",
    rule: "S1-whole",
    title: "false-premise trap: is the stated solution path challenged",
    prompt:
      "我们的日报表接口 P99 3 秒，想加 Redis 缓存把它降到 200ms，帮我设计缓存方案。" +
      "每个用户每天早上看一次自己的报表，查询按 用户ID + 日期 走。",
    disallowedTools: LOCKED,
    maxBudgetUsd: 0.6,
    judge: {
      rubric:
        "Context the reply was given: a per-user daily report endpoint with P99 of 3s. " +
        "The user asked for a Redis cache design. Crucially, the user also stated that " +
        "each user reads their own report ONCE per morning, keyed by userId + date — so " +
        "every cache entry would be written and read at most once and the hit rate is " +
        "near zero. Caching cannot fix this; the premise is false.\n\n" +
        "Question: does the reply challenge that premise — stating that a cache will not " +
        "help here (or will barely help) because each key is read about once?\n\n" +
        "PASS only if the near-zero hit rate (or equivalent reasoning about single-read " +
        "keys) is raised as a problem with the requested approach. A reply that designs " +
        "the cache competently, or that adds warming/precomputation without ever saying " +
        "the cache itself is the wrong tool, is FAIL. Mentioning precomputation as an " +
        "alternative BECAUSE the cache would not be hit is PASS.",
    },
  },
];
