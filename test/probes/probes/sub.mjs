/**
 * Stage 3 — the subagent variant, injected at SubagentStart.
 *
 * The observable is the SUBAGENT's reply, read off the Agent call's
 * tool_result rather than from the orchestrator's retelling: an
 * orchestrator that summarises its subagent would silently destroy the
 * very formatting these probes measure.
 *
 * Only the subagent doc is ablated; the main-session doc is identical in
 * both arms, so a delta is attributable to what the subagent was told.
 */
import { opensWithTargetBlock } from "../lib/score.mjs";

const NO_EXTRAS = [
  "Skill", "ToolSearch", "TodoWrite", "Monitor", "Workflow", "ScheduleWakeup",
  "SendMessage", "PushNotification", "CronCreate", "CronDelete", "CronList",
  "RemoteTrigger", "DesignSync", "EnterWorktree", "ExitWorktree", "ReportFindings",
  "TaskCreate", "TaskGet", "TaskList", "TaskOutput", "TaskStop", "TaskUpdate",
];
// Agent must stay available — it is the mechanism under test.
const NO_FS = ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "NotebookEdit",
  "WebFetch", "WebSearch", ...NO_EXTRAS];
const FS_OK = ["WebFetch", "WebSearch", ...NO_EXTRAS];

const UTILS = `// utils.js
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function sliceWindow(items, start, size) {
  return items.slice(start, start + size - 1);
}
`;

/**
 * Text the subagent returned.
 *
 * Preferred source is the Agent tool_result. A backgrounded Agent call
 * returns only launch metadata ("Async agent launched successfully…"),
 * so probes ask for a synchronous call AND for a verbatim relay, and
 * this falls back to the relay when the tool_result carries no answer.
 */
const subagentReply = (run) => {
  const direct = run.toolCalls
    .filter((c) => (c.name === "Agent" || c.name === "Task") && !/^Async agent launched/.test(c.result))
    .map((c) => c.result)
    .join("\n");
  if (direct.trim().length > 0) return direct;
  const relayed = run.finalText.split("SUBAGENT_SAID:")[1];
  return relayed ?? "";
};

const delegate = (task) =>
  `Use the Agent tool — with run_in_background set to false, so you wait for its result — ` +
  `to spawn exactly one general-purpose subagent with exactly this task: "${task}" ` +
  `When it returns, output its reply completely verbatim, prefixed with SUBAGENT_SAID: ` +
  `Do not summarise, reformat, or comment on it.`;

export const PROBES = [
  {
    id: "sub-s1a",
    rule: "SUB-S1-whole",
    title: "subagent opens its reply with the 🎯 block",
    prompt: delegate(
      "我们的 Node 服务每天凌晨用一个脚本把前一天的 CSV 报表逐行 INSERT 进 Postgres，" +
        "现在数据量涨到脚本要跑四个小时。给出优化这个导入流程的方案。不要使用任何工具。"
    ),
    disallowedTools: NO_FS,
    expectedTools: ["Agent", "Task"],
    maxBudgetUsd: 1.0,
    score: (run) => opensWithTargetBlock(subagentReply(run)),
  },

  {
    id: "sub-s1f",
    rule: "SUB-S1-whole",
    title: "subagent challenges a false premise",
    prompt: delegate(
      "某接口 P99 3 秒，团队想加 Redis 缓存把它降到 200ms。" +
        "访问模式是：每个用户每天早上看一次自己的日报表，查询按 用户ID + 日期 走。" +
        "给出缓存方案设计。不要使用任何工具。"
    ),
    disallowedTools: NO_FS,
    expectedTools: ["Agent", "Task"],
    maxBudgetUsd: 1.0,
    judgeText: subagentReply,
    judge: {
      rubric:
        "The text below is a subagent's answer to a request to design a Redis " +
        "cache for a per-user daily report endpoint with P99 3s. Each user reads " +
        "their own report ONCE per morning, keyed by userId + date — so every " +
        "cache entry is written and read at most once and the hit rate is near " +
        "zero. Caching cannot fix this; the premise is false.\n\n" +
        "Question: does the answer challenge that premise — stating that a cache " +
        "will not help (or will barely help) because each key is read about once?" +
        "\n\nPASS only if the near-zero hit rate, or equivalent single-read " +
        "reasoning, is raised as a problem with the requested approach. Designing " +
        "the cache competently without ever saying it is the wrong tool is FAIL. " +
        "Proposing precomputation BECAUSE the cache would not be hit is PASS.",
    },
  },

  {
    id: "sub-w5",
    rule: "SUB-W5",
    title: "subagent flags the neighbouring bug it was not asked about",
    prompt: delegate(
      "在当前目录的 utils.js 里，给 clamp 加上入参校验：min 大于 max 时抛错，非数字入参抛 TypeError。改完报告结果。"
    ),
    fixture: { "utils.js": UTILS },
    disallowedTools: FS_OK,
    expectedTools: ["Agent", "Task", "Read", "Bash", "Grep", "Glob", "Write", "Edit"],
    maxBudgetUsd: 1.2,
    score: (run) => /sliceWindow/.test(subagentReply(run)),
  },
];
