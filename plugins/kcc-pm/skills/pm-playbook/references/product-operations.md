# Senior product operations handbook

> This document defines the quality baseline, working principles and
> anti-patterns of the "senior product operations" role.
> Sources: 2026-08 deep research (Huang Youcan, *The Light of Operations*;
> Zhang Liang, *Operations from Scratch*; the Sean Ellis / Qu Hui growth
> hacking system; Brian Balfour / Reforge; Melissa Perri; plus big-tech
> operations practice).

## 1. Role definition

**Operations = every intervention needed to build a better relationship
between the product and its users** (Huang Youcan).

Internet product value = function + experience + **user participation
value** (time and attention / users creating value for each other / users
taking part in design, improvement and word-of-mouth) — operations owns
that third term.

Three levels of operations (work out which one you are at):
1. **Micro operations**: concrete tactics — campaigns, copy, user retention;
2. **Macro operations**: orchestrating multiple tactics, planning strategy, allocating resources;
3. **Building the game**: wiring the supply and demand of several parties into an ecosystem that runs itself.

East/West role mapping: the US has almost no direct equivalent of the
Chinese "operations" role (it is split across marketing / growth /
community); Western Product Ops (Melissa Perri) serves internal product
teams (data, process, tooling standardization) and is "the art of removing
obstacles from evidence-based decision making" — this role covers both.

### Four stages of growth (Wild, former Alibaba operations director)
Employee value (hit the KPI) → organizational value (propose the
breakthrough that helps the whole department hit its goal) → business
value (understand the underlying logic of the company's business) →
commercial value (top-level design; thinking about how to make the company
money). **To reach director level you must get to the fourth.**

"A sense of the big picture and a sense of timing are what separate junior
operations from senior operations" (Zhang Liang) — knowing what the
product's current stage calls for, and what it doesn't.

## 2. Quality baseline

- **Data sensitivity**: read a change in user behavior out of a retention or conversion anomaly; "the key to reading data is reading the people behind it" (Zhang Liang).
- **Copy that moves and persuades**: write copy that makes users act rather than copy that pleases you; "package it well, avoid clickbait" — trust is the principal on a deferred return.
- **Deep user insight**: touch users directly every week (interviews / living in the user groups / reading support tickets), not just the dashboard.
- **High sensitivity to what's new**: riding trends and borrowing momentum is a base skill.
- **Relentless execution and attention to detail**: pushes timed to the minute, creative tailored per user segment (the Dongqiudi case).
- **Goal orientation and efficiency**: "the gap between operators is rarely in hard skills, it is in how they think" — set the goal and the measurement definition before acting.
- **A long-horizon, deferred-return mindset**: "before arguing about what return you might get, do the thing exceptionally well on the strength of understanding it."
- **A retro habit**: after every project, distil methodology through four steps — revisit the goal → compare results → dig for root causes → generalize the lesson.
- **Experimental thinking**: drive growth through a high-tempo hypothesize-test-learn loop (Sean Ellis).
- **At least one hard-currency skill**: copywriting, content, campaign design, data analysis or strategy — the prerequisite for not being a dogsbody.

## 3. The four key operations mindsets (Huang Youcan)

| Mindset | What it means | The test |
|---|---|---|
| **Process** | On receiving a task, decompose the whole flow until it can't be split further, then hunt for the optimization in each link | Is there an SOP? |
| **Granularity** | Keep 70%+ of what happens knowable and controllable | Have push timing, creative, rules and cadence all been designed? |
| **Leverage** | Do one thing exceptionally well to create a fulcrum, then move something bigger with it | Are resources concentrated to break through, or spread evenly? |
| **Ecosystem** | Wire multi-party supply and demand into a self-turning "game" | Is growth pushed, or is it a flywheel? |

## 4. Working principles (top 18)

1. **Define the goal and its metric before any action**: write down the expected numbers and the success bar before launch, run the four-step retro afterwards, and freeze the lesson into the SOP.
2. **Retention before acquisition**: don't scale spend before the retention curve flattens; "over-focusing on growth early actually accelerates a product's death — early operations must be built around word of mouth" (Huang Youcan / Brian Balfour).
3. **Separate "creating user value" work from "consuming user value" work**: pushing conversion and chasing payment are the latter; make sure the former keeps a large enough share — earn the goodwill before you harvest (deferred return).
4. **Segment, never blast**: tag users by RFM or "lifecycle × value", and give high-value, at-risk and dormant users different channels, copy and incentives.
5. **Move churn management upstream**: define churn on two axes, **time + a key behavior**; build a daily-monitored early-warning tag system; spend first on the "about to churn" users who are still reachable — recall rates for users who already uninstalled are minimal.
6. **Finding the aha moment requires a two-sided comparison**: compare the behavior of retained users against churned users (looking only at retained users is survivorship bias), and A/B validate causality before hardwiring it into onboarding.
7. **Put the North Star through Qu Hui's six questions**: does it reflect core value being experienced? Does it reflect the key behavior? Does its improvement mean the company is doing better? Is it easy to understand and spread? Is it leading rather than lagging? Is it actionable? — reject vanity metrics like cumulative registrations.
8. **Design growth with loops, not funnels**: make explicit how output is reinvested as input (viral / UGC / paid / sales loops); funnels diagnose the leak, loops design the growth mechanism.
9. **Manage content operations as a closed loop**: positioning → topic selection → production (quality bar, cultivating creators, lowering the barrier) → distribution (editorial / algorithmic / search) → measurement → back into topic selection.
10. **Three-phase campaign SOP**: preparation (teaser milestones, testing, materials) → execution (launch milestones, phase breakdown, promotion cadence) → wrap-up (prize fulfilment, feedback collection, retro report). A teaser is not just an announcement — design a hook.
11. **Cold-start a community by controlling quality before volume**: invite seed users directly → let a small circle settle the culture and content bar → lower the production barrier and open up gradually (the Zhihu / Xiaohongshu path).
12. **Use the eight incentives to drive participation**: material reward, chance events, scarcity, competition, showing off / curiosity, emotional identification, status and recognition, perceived bargain — check each one off when designing an incentive.
13. **Run growth experiments at high tempo**: analyze data → idea backlog → rank by impact / confidence / cost → ship experiments on a fixed weekly cadence.
14. **Validate three fits before scaling acquisition**: language-market fit, channel-product fit, product-market fit (Sean Ellis's must-have survey: ≥40% "very disappointed" if they could no longer use it).
15. **Instrument recall end to end**: differentiated copy plus a concrete benefit, sent at the right time; use 24-hour return as the base metric and monitor all downstream behavior, not just click-through.
16. **Decouple the rollout window from the marketing cadence**: no large-scale push, spend or acquisition during a staged rollout; only after 100% and stable metrics do you open, in order, in-app notifications → push/EDM → community/KOL → paid acquisition.
17. **Linear thinking makes for bad operations**: "put in X and Y must come out immediately" contradicts deferred returns — leverage and compounding come from accumulation.
18. **Audit your capability gaps against the market every 3 months**; train extension by relentlessly asking "and then what?" — "the number went up. And then what? What does it mean for the business model?"

## 5. Anti-patterns (correct on sight)

- **Dogsbody operations**: "more than 80% of operators never get past dogsbody work" — pure transactional execution, no methodology distilled, no hard skill.
- **Chasing growth too early**: buying traffic and running referral schemes while the product is still being polished.
- **Vanity-metric orientation**: reporting cumulative registrations or downloads as the goal, hiding the real activity and retention problem.
- **Blasting everyone with no segmentation**: the same push and the same coupon to every user — wastes budget and annoys the high-value ones.
- **Fake activity bought with subsidies**: DAU propped up by red packets, from users who never reached the aha moment; the curve collapses the moment subsidies stop.
- **Campaign ends, everyone scatters**: no teaser design, no phase cadence, no retro; next time starts from zero and quality rests on individual instinct.
- **One-shot recall**: one SMS, click-through only, no segmentation, no downstream behavior.
- **Clickbait and over-packaging**: buys clicks short term, overdraws user trust long term.
- **Blindly copying a competitor's playbook**: cloning referral schemes / check-ins / leaderboards without looking at your own user base and product stage — if the incentive doesn't match the motivation, the mechanism spins in place.
- **Funnel-shaped org fragmentation**: marketing owns only acquisition, product owns only retention, and local optimizations cancel each other out (the structural flaw Reforge criticizes).
- **Survivorship bias in aha-moment hunting**: mistaking a correlated behavior for a cause and changing onboarding without A/B validation.
- **Turning Product Ops into a chore desk**: it exists to clear obstacles from strategic decisions through data, insight and process standardization — not task tracking and schedule management (Perri).

## 6. Maxims worth carrying

- "Operations is every intervention needed to build a better relationship between the product and its users." — Huang Youcan
- "Internet product value = function + experience + user participation value." — Huang Youcan
- "Before arguing about what return I might get, let me do the thing exceptionally well on the strength of understanding it." — Huang Youcan (deferred return)
- "Through a long series of seemingly tedious, unglamorous acts, you give a product its shine." — Huang Youcan
- "More than 80% of operators never get past dogsbody work." — Huang Youcan
- "The key to reading data is reading the people behind it." — Zhang Liang
- "A sense of the big picture and a sense of timing separate junior operations from senior operations." — Zhang Liang
- "Retention is still the king of growth." — Brian Balfour
- "Product operations is the art of removing obstacles from evidence-based decision making." — Melissa Perri
- "To break through to director level you have to start doing top-level design, thinking about how to make the company money." — Wild, former Alibaba operations director

## Related documents

Methodology detail lives in the same directory: [Growth and operations](./growth-operations.md) · [Metrics and experiments](./metrics-experiments.md) · [Monetization](./monetization.md) · [GTM and launch](./gtm-launch.md)
