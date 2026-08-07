/**
 * The tools no probe may use, shared by every probe module.
 *
 * A probe measures ONE model's reasoning against ONE injected document. Any
 * tool that hands work to another model, or reaches outside the sealed
 * workspace, both muddies attribution and burns budget — so the list is
 * deny-by-default and errs toward blocking.
 *
 * This lived as a copy-pasted literal in each of the seven probe modules until
 * a real gap cost a run: a blackbox probe voided with "escaped the lockdown via
 * ListAgents" because the agent-roster tools were on nobody's list. Six copies
 * were identical and one had already drifted, so the fix had to land seven
 * times to be real. It is one module now.
 *
 * A run that calls something outside its probe's `expectedTools` is voided
 * rather than scored (see run-probe.mjs), so a new escape hatch shows up as an
 * invalid record naming the tool — add it here when that happens.
 */
export const NO_DELEGATION = [
  // hand work to another model
  "Agent", "Task", "Skill", "ToolSearch", "Workflow",
  // agent / MCP rosters — the ListAgents gap
  "ListAgents", "ListMcpResources", "ReadMcpResource",
  // scheduling and out-of-band messaging
  "Monitor", "ScheduleWakeup", "SendMessage", "PushNotification",
  "CronCreate", "CronDelete", "CronList", "RemoteTrigger", "DesignSync",
  // harness surfaces that are not the thing under test
  "TodoWrite", "ReportFindings", "EnterWorktree", "ExitWorktree",
  "TaskCreate", "TaskGet", "TaskList", "TaskOutput", "TaskStop", "TaskUpdate",
];
