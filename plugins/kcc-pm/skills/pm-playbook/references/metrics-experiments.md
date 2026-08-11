# Metric systems and experimentation

> Metrics-informed, not metrics-driven: calibrate judgment with data;
> don't let data replace judgment.

## Framework quick reference

| Framework | In one line | When to use |
|---|---|---|
| North Star (Amplitude) | One leading indicator of a customer-value moment + 3–5 movable input metrics | Aligning multiple teams; translating strategy into execution |
| Qu Hui's six North Star questions | Six tests for a candidate metric | Setting the OMTM / aligning OKRs |
| AARRR pirate metrics | Acquisition-activation-retention-referral-revenue | Growth diagnosis: locating the leakiest stage |
| Google HEART + GSM | Five experience dimensions, derived Goals→Signals→Metrics | Measuring the experience quality of one feature or redesign |
| Trustworthy A/B (Kohavi) | OEC + guardrails + fixed duration + SRM check | Launch decisions on a mature product with traffic |
| Build-measure-learn (Ries) | An MVP is the cheapest way to complete one learning loop | The 0-to-1 stage, where uncertainty is highest |
| ByteDance's experiment culture | "A/B everything", validate before full rollout | Instilling a data culture in an organization |

## Core practices

### North Star discipline
- It must be a **leading indicator of a customer-value moment** (Airbnb: nights booked; Slack: teams passing a message threshold), never a lagging or vanity metric like MRR / DAU / downloads.
- Define 3–5 **input metrics** the team can move directly day to day — the North Star is the output, the inputs are the levers, and daily accountability sits on the levers.
- Qu Hui's six questions: (1) does it reflect core value being experienced? (2) does it reflect the key behavior? (3) does its improvement mean the company is doing better? (4) is it easy to understand and spread? (5) is it leading rather than lagging? (6) is it actionable?

### Using HEART
Happiness / Engagement / Adoption / Retention / Task Success, each derived through Goals→Signals→Metrics. **Pick only the 2–3 dimensions most relevant to the current goal** (a new feature: Adoption + Task Success); don't run all five.

### The iron laws of A/B testing (Kohavi)
1. Before the experiment starts, **write down and freeze**: the hypothesis, the primary metric (OEC), the minimum detectable effect, the required sample size, and the end date.
2. **No peeking**: harvesting the moment you see p<0.05 pushes the false-positive rate above 26%.
3. Every primary metric needs a **guardrail metric** (latency, crash rate, unsubscribe rate, support volume) — a win on the primary with a broken guardrail still cannot ship.
4. **Keep the base rate in mind**: most ideas fail on a mature product (two-thirds ineffective at Microsoft, roughly 80% failures at Bing), and a typical successful experiment lifts only 0.1%–1%.
5. **Twyman's Law**: any number that looks unusually good means "check the instrumentation, data leakage or SRM (sample ratio mismatch)" first, not celebrate.
6. A/B can only compare options; it cannot tell you what users want (Zhang Yiming) — directional judgment comes from empathy and imagination.

### Using the MVP correctly (Ries)
An MVP is "the cheapest way to complete one build-measure-learn loop", not a stripped-down product. If a landing page, a video or a manual Wizard-of-Oz process can validate the value hypothesis, don't write code. Write the value hypothesis first (do they find it valuable once used?) and the growth hypothesis second (how do new users discover it?), design a separate experiment for each, and don't mix them.

### The four-part data report
Observation (what happened) → root cause (why) → recommendation (what to do) → expected impact (with an ROI estimate). A report that only pastes a dashboard screenshot does not pass at senior level.

## Anti-patterns

- Reporting vanity metrics: downloads, registrations, cumulative users — they only go up, they feel good, and they guide no decision.
- Peeking mid-experiment.
- Picking the wrong North Star: a lagging metric, or one the team cannot influence; or having a North Star with no input metrics, so there is no lever to pull.
- Enslavement to metrics: optimizing a local number at the whole product's expense; justifying an experience-damaging change with a local metric lift.
- Misusing the MVP: as an excuse to ship something broken, or the reverse — chasing perfection and never learning.
- Forcing an A/B when traffic is insufficient or the change cannot be randomized.

## Sources

Amplitude, *North Star Playbook* · Qu Hui, *Growth Hacking in Silicon Valley* · Dave McClure AARRR · Kerry Rodden HEART · Ronny Kohavi, *Trustworthy Online Controlled Experiments* · Eric Ries, *The Lean Startup* · ByteDance DataTester practice · Zhang Yiming
