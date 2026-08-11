# Product and operations capability in the AI era (2024-2026)

> "Evals are the new PRDs." (Dianne Penn, Anthropic) · "Writing evals is
> going to be a core skill for product managers." (Kevin Weil, OpenAI CPO)

## Framework quick reference

| Framework | In one line | When to use |
|---|---|---|
| The three eval components | Dataset / task / scorer | Taking an AI feature from demo to sustainable iteration |
| Three-step error analysis | Open coding → axial coding → theoretical saturation | The first step, before you build any eval |
| The four elements of LLM-as-judge | Role + context + goal + defined terms, calibrated against humans | Evaluating subjective dimensions at scale |
| Six steps to a golden dataset | The minimum eval you can start in one afternoon | You want an eval culture but no time for a big project |
| Complaint → regression flywheel (Anthropic style) | Turn a user complaint into a regression asset that never recurs | Frequent model swaps; fear of "fix one, break three" |
| Model maximalism (Kevin Weil) | Design for the next tier of model capability, not scaffolding for today's flaws | The schedule stretches past one model iteration cycle |
| HITL confidence thresholds | High confidence executes automatically (reversibly), low confidence escalates to a human | The output triggers a real action (refund, sending mail, changing data) |
| The cost-latency-quality triangle | Lock a quality floor with evals before you talk about saving money | Inference cost is running away |
| Three tiers of AI value | Save time / improve / power up | Assessing the real value of an AI feature proposal |
| The hybrid support model (the Klarna lesson) | AI handles tier-1, humans backstop, a real person is always reachable | Human/machine split in support and operations automation |

## Core practices

### Eval discipline
- For a new AI feature, **write the eval before the PRD**: define good output in one sentence → collect 10 real input samples → write an acceptance bar for each → score the status quo → agree maintenance with engineering. One afternoon is enough (a golden dataset is a living spec that "gets executed each iteration rather than read").
- Dataset: 20–50 items covering core scenarios, edge cases and known bugs; every item unambiguous (two experts judging independently agree); test both positive and negative.
- Iron rule for choosing a scorer: deterministic judgments (keywords / length / format) go to code; subjective dimensions (tone / empathy) go to LLM-as-judge but **must be calibrated regularly against human labels**; human scoring is for calibration only, never for evaluation at scale.
- Two numbers to be suspicious of: a 100% pass rate usually means the questions are too easy, and 33% inter-annotator agreement is a coin flip — align on what "good" means before automating anything.

### Error analysis (the most-skipped step)
Spend a fixed 30–60 minutes a week **reading raw transcripts one by one**: open-code the failure types freely first, then consolidate into 5–6 categories (axial coding), and keep reading until no new failure patterns appear (theoretical saturation). Appoint one "benevolent dictator" with final say over what counts as correct. "Sweat the tokens as much as they sweat the pixels."

### Probabilistic thinking and product form
- Accept that the product sits on components with accuracy anywhere from 60% to 99.5%, and **design for failure by default**: low confidence escalates to a human automatically, AI actions are reversible, and the human has the final call; accuracy ≠ experience (Klarna's AI answered correctly and users were still unhappy).
- Don't present uncertain output with certain visuals: grade the labels, "AI suggested" vs "AI verified"; when the AI fails, preserve the user's work in place and explain — an error must never swallow what the user did.
- **Compute the success-rate product for multi-step chains first**: 80%×50%×40%=10%; for every step you add, first ask whether it can be removed.
- Deliver the result, not the tool: a bare prompt box is a "powerful, inefficient, high-barrier" interaction — lower the barrier with templates and defaults.

### Model maximalism
Models iterate every 3–4 months, cost falls by an order of magnitude a year, and capability arrives in jumps (a jagged edge). The test: "will this workaround still be worth anything after the next model ships?" Hold strong opinions on the theme and weak ones on the specific prototype; at every new model checkpoint, re-assess what was impossible yesterday. "Today's AI models are the worst you'll ever use for the rest of your life."

### Prototype-first
Spend 1–5 hours building an interactive prototype with AI tooling and get stakeholders to *react* to it before writing the document — "ten people have ten ideas; a prototype gives them a shared language" (Teresa Torres). Learn with rough prototypes early and polish with the design system only later, so stakeholders don't mistake it for shippable.

### Four red lines for AI support
1. Always keep a path to a real human (the core lesson from Klarna cutting 700 support staff and having to rehire);
2. Disclose prominently that the counterpart is an AI;
3. Preserve the full conversation context on escalation, and test the escalation path regularly in production;
4. Route complex, emotional or compliance-touching tickets (disputes, account closure) straight to a human.

### What humans remain irreplaceable for
The two things that command the highest premium in the AI era: **judgment** (trade-offs and taste) and **agency** (knowing what to build). Use an LLM to cluster all your feedback at scale and extract themes, but do the value ranking, the resource trade-offs and the ethical calls yourself. Form your own view first, then let the AI be a "thinking partner that argues back" — "a thinking partner does not just agree with you; it should add to you." Managers stay hands-on: "If you're a manager, you have to be hands-on."

## Anti-patterns

- Vibe checks instead of evals: it demos well so it ships — MIT research found 95% of enterprise AI pilots had no measurable ROI.
- Treating the PRD as the finish line: a static document can't keep up with model iteration and rots the moment it's written.
- Watching dashboards instead of reading transcripts.
- Taking LLM-as-judge at face value without human calibration.
- Building heavy scaffolding around the current model's flaws.
- Full AI replacement with the human path removed.
- AI features as bandwagon: doing AI for the sake of having AI.
- Outsourcing value judgments, trade-offs and ethics to the AI.
- Misattributed failure: only about 23% of enterprise AI failures come from model or data quality; the rest are governance, configuration and change management — yet teams blame the model first.

## Sources

Lenny's Podcast/Newsletter (Dianne Penn · Kevin Weil · Hamel Husain & Shreya Shankar · Aman Khan) · Mind the Product, *Evals are the new PRD* · Teresa Torres on AI prototyping · 53AI, "25 core lessons from nearly two years building AI products" · Klarna's public 2024-2025 retros · Volcano Engine's four-stage twelve-step method
