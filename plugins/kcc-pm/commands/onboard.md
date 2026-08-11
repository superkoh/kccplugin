---
description: 建立 PM 工作台 / PM onboarding — stand up (or incrementally fill in) the PM workspace for this project via an interview, persisting the business context a PM needs into repo knowledge files for the pm-playbook skill and the pm agent to draw on
argument-hint: "[optional: extra context, e.g. a business summary or the angle to focus on]"
---

# Stand up the PM workspace

Goal: extract the knowledge an LLM cannot know a priori and should never
have to look up twice — from the user and from existing material — and
land it as files in the repo. The user may be newly hired (they need you
to help diagnose the business) or deeply familiar with it (they need to
transfer that knowledge to you). Both cases interview the same way: you
ask, they answer, you write it to disk.

## Mode detection

First check for `.kcc-pm.json` at the project root: present → **incremental
mode**: read every context file and ask only about gaps, stale entries and
things marked for verification; never re-ask what is already recorded.
Absent → fresh onboarding, run the flow below.

## Interview (agent-led)

- You lead the questioning, in batches of **≤5 questions per batch**; digest one batch of answers before sending the next, and the second batch must be sharper because of the first. Two batches are usually enough; a third needs a stated reason.
- The first batch is fixed:
  1. One-sentence product definition: for whom, solving what, making money how (or planning to); if there are several product lines, which is the main one.
  2. Stage and scale: how long since launch, DAU/MAU order of magnitude, is there revenue, hunting for PMF or scaling.
  3. Why this PM role exists: are they inheriting a blank slate, a ruin, or a running machine; who did it before and how.
  4. The one thing the boss / decision-maker is most anxious about (not a job description — the thing that keeps them up at night); and what change six months out would count as having gotten it right.
  5. The biggest problem by internal consensus (the user's own version is fine; capture every version they've heard).
- **The materials list is separate and does not count against the question budget**: access to dashboards and analytics tools, product entry points and test accounts, a one-page background (funding / team size and split / org chart), historical documents (roadmap / weeklies / user research / retros), and who to book a chat with in week one.
- Interview discipline (Mom Test): ask about past behavior and specific decisions, never opinions or visions; tell the user explicitly **"if there isn't one, just say 'there isn't one' — an absence is itself important information"**.
- Every question passes one self-check: would the answer change what you do next? If not, cut it.

## Self-service digging

Where the user has given you a data or document path, dig before you ask:
metadata first, read-only, small probing steps. Record both what you found
and what you "looked for but does not exist"; where there is no access,
log a blind spot and keep the interview moving.

## Writing to disk

The context directory defaults to `pm/` (adjust and record it in the
marker file if the user asks for somewhere else). Produce:

- `pm/org.md` — company and product, business model; the user's role boundary (**state explicitly what is NOT theirs**); the boss's intent and success bar; team and mobilizable resources; data and tooling access.
- `pm/baselines.md` — quantitative baselines: scale, retention, revenue and other key numbers, each with source, measurement definition and date.
- `pm/market.md` — competitors and external environment: state of the main competitors, category playbooks, external risks.
- `pm/findings.md` — findings from internal documents and data: strategy-doc takeaways, data-mining conclusions, **correction log** (overturned assumptions kept with strikethrough), and the **"does not exist" list** (data/documents looked for and not found).
- `pm/capabilities.md` — the workspace's own capability ledger: data access, permissions, blind spots, each with a status (exploring / needs routing / resolved / frozen). Kept apart from business questions; no product conclusions mixed in.
- `.kcc-pm.json` (project root) — `{"version": 1, "contextDir": "pm"}`. The workspace marker and config: the `pm-playbook` skill and the `pm` agent use it to locate the context directory when handling PM tasks.

Writing discipline: record concluded facts, not conversation transcripts;
every fact carries its discovery date and how it was verified; label
facts / assumptions / to-be-verified in separate columns; secrets (tokens,
passwords) never land in a context file.

## Closing out

1. Play back "the business coordinate system as I understand it" (one page max): the main line, the stage, the biggest problem, the role boundary, the most-missing information. Ask the user to correct you, and write the corrections back to the files.
2. Report which files you created, what each one records, and which slots are still empty (empty ones go into the blind-spot list in `pm/capabilities.md`).
3. Propose (don't impose) the next step: for the newly-hired case, an internal interview question list and a 30-day plan; for the already-fluent case, start taking tasks straight away.
