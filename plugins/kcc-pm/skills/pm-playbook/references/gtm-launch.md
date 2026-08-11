# GTM and launch management

> Launch is where product and operations meet: a launch is a process, not
> an event. "Not every release deserves a launch."

## Framework quick reference

| Framework | In one line | When to use |
|---|---|---|
| Dunford's five positioning components | Competitive alternatives→unique attributes→value and proof→target segment→market category | Before writing any external narrative; when conversion is off, suspect the story |
| Two-part sales pitch | Sell the worldview (market insight) first, the product second | Sales scripts, demo flow, launch keynote |
| Messaging house | One-line claim + 3–4 pillars + evidence per pillar | Before producing P0/P1 launch material, to unify the story across channels |
| PR/FAQ (Amazon) | Write launch-day press release + internal and external FAQ before you build | Major feature kickoff and GTM kickoff |
| Launch tiers (P0–P2) | Grade by four business-impact questions; each tier binds a fixed activity list | Every iteration's launch planning |
| The four launch gates | Materials / sales enablement / support FAQ / instrumentation — miss one and you don't roll out | 2–4 weeks before a P0/P1 launch |
| Guarded rollout | 1%→5%→10%→25%→50%→100% with two sets of guardrails | Any launch that reaches real users |
| The four-stage adoption funnel | Exposed→Activated→Used→Used Again | Weeks 1–4 after launch, diagnosing "nobody uses it" |
| The 30-day retro | Read the numbers against the goal, output keep/change back into the playbook | A fixed calendar item for every P0/P1 launch |

## Core practices

### The five positioning components (fill them in strictly in order)
1. **Competitive alternatives**: what the customer would use without you — including Excel and doing nothing;
2. **Unique attributes**: what you have that the alternatives don't;
3. **Value and proof**: those attributes turned into customer benefit, plus evidence;
4. **Target segment**: the characteristics of customers who care most about that value;
5. **Market category**: the frame of reference that makes the value obvious.
The starting point is always "what would the customer use without you", never your feature list. Positioning is not a one-off; revisit it periodically as the market shifts.

### Four questions to set the launch tier (unrelated to engineering effort)
Can it bring new or expansion revenue? Can it lift engagement or reduce churn? Does it create market differentiation? What share of customers does it affect?
- **P0**: website refresh + PR/launch event + sales certification + a customer communication plan;
- **P1**: blog + email + in-app announcement + sales brief + help docs;
- **P2**: changelog + help-doc update.
Fix each tier's activity list in advance so resources aren't argued case by case. Exception clause: a small feature that fixes serious churn can be promoted deliberately.

### Launch gates (miss one and you do not roll out)
1. Final marketing materials;
2. Sales script + objection-handling card, with training completion and quiz results **on record** (forwarding a file does not count as done);
3. Support FAQ + a rehearsed escalation path;
4. Instrumentation signed off + the launch dashboard live — **instrumentation is a launch gate, not homework you do after shipping**.

### Rollout discipline
- Fixed rollout steps, each with a minimum observation window; a given user always lands on the same variant.
- Two sets of guardrails plus a pre-set rollback line: technical (error rate, latency, crashes) and business (core conversion, retention, support ticket volume); statistically significant degradation triggers an automatic pause or rollback. The rollback criteria and their owner go in the launch ticket, not into an ad-hoc meeting.
- Small-traffic experiment before full rollout (ByteDance's discipline): significantly negative → stop and re-optimize; not significant → extend or add sample; significantly positive → roll out.
- **Decouple the rollout window from marketing**: no large-scale push, spend or acquisition during a staged rollout; operations takes over only after a stable 100%, in order: in-app notification → push/EDM → community/KOL → paid acquisition. For a content feature, build up the content supply before launch.

### Adoption-funnel diagnosis (weeks 1–4 after launch)
Exposed → Activated → Used → Used Again.
- Low exposure = a discovery problem → targeted in-app announcement;
- Drop-off at activation = a friction problem → add a tooltip/checklist at the specific sticking point;
- No repeat use = a habit problem → triggered nudges and a second onboarding pass.
"Nobody uses the feature" ≠ "users don't need it" — most fixes are an in-app message, not an engineering ticket. Before launch you must write down a quantified adoption target and lock the baseline (the average adoption rate of a core SaaS feature, roughly 24.5%, is a usable reference).

### The 30-day retro as an institution
Bring product, marketing, sales and support together and read the numbers against the goal: adoption vs target, pipeline and closed-won mentions, the top 3 pieces of customer feedback, conversion per channel. Output two columns, keep and change, **written back into the launch playbook** — a retro's product is the input to the next checklist, not an archived document. Give feature flags a lifetime and an owner: clean them up on a deadline after 100% rollout (Uber's Piranha automatically removed around 2,000 zombie flags).

## Anti-patterns

- Treating launch as a one-off event: pack up when it ships, and the adoption curve spikes then dies.
- Setting launch tier by engineering effort: a launch event for a six-month refactor, a silent release for a high-impact small feature.
- Broadcasting every minor update on every channel: manufacturing announcement fatigue; related small features should be bundled into a quarterly launch moment.
- Messaging written from the feature list: it reads like a spec, and the customer can't see "why does this concern me".
- Opening the acquisition taps during a staged rollout: it widens the blast radius and pollutes the experiment data.
- Sales enablement = forwarding a deck.
- Blaming every low adoption number on "users don't need it", then cutting the feature or rebuilding it.
- Retros that get archived instead of written back, so the same mistake recurs every quarter.

## Sources

April Dunford, *Obviously Awesome* and *Sales Pitch* · Amazon Working Backwards PR/FAQ · Intercom / Pragmatic Institute / PMA launch tiers · Sales Enablement Collective · LaunchDarkly guarded rollouts · ByteDance DataTester · Youzan and Tencent rollout practice · Userpilot adoption funnel · PMA retro templates
