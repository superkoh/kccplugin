# Prioritization and decision-making

> Resources are never enough, so prioritization is what strategy looks
> like day to day. Scores are a conversation tool, not an automatic
> decision machine.

## Framework quick reference

| Framework | In one line | When to use |
|---|---|---|
| RICE (Intercom) | (Reach × Impact × Confidence) / Effort | Many similar candidates needing a debatable first ordering |
| Kano model | Must-be / performance / attractive / indifferent / reverse | Deciding "fix the gap or build the highlight" |
| Cagan's four risks | Value / Usability / Feasibility / Viability | The checklist any idea passes before entering the schedule |
| LNO (Shreyas Doshi) | Sort tasks into leverage / neutral / overhead and invest differently | Personal energy allocation; when busy but unproductive |
| Pre-mortem + three animals | Assume it already failed and work back: Tigers / Paper Tigers / Elephants | 1–3 months into a major project |
| Opportunity-cost thinking | Not "is it worth it", but "is it the most worth it right now" | Every resource decision |
| Three layers of product work (Shreyas) | Impact / Execution / Optics | Misalignment with your manager; diagnosing performative work |

## Core practices

### RICE discipline
- Score Impact on 3 / 2 / 1 / 0.5 / 0.25; Confidence only on 100% / 80% / 50% / 20%.
- **A high scorer with Confidence below 50% gets research first, not a slot** — the scoring sheet is not a decision automaton.

### Kano ordering
Close the must-be gaps first → then invest in the linear performance items → finally add a small number of delighters. Re-test periodically: today's attractive feature degrades into tomorrow's must-be.

### The four risks, each with an owner (Cagan)
- **Value** (will users choose it?) — the PM owns it personally
- **Usability** (can they figure it out?) — design owns it
- **Feasibility** (can we build it?) — the tech lead owns it
- **Business viability** (does it work for legal / finance / sales / brand?) — the PM owns it personally
Before a line of production code is written, kill the biggest risk cheaply with a prototype during discovery.

### The pre-mortem (1 hour)
10 minutes of setup → 10 minutes of silent writing on "assume the project has failed — why?" → 30 minutes of voting and discussion → 10 minutes of action planning. Risk classification:
- **Tiger**: a real threat that will kill you → assign an owner and a mitigation;
- **Paper Tiger**: looks like a threat but isn't → explicitly ignore it;
- **Elephant**: the big thing nobody in the room dares name → force it onto the table.
Build owner-assigned mitigation plans for the top 3–5 tigers and elephants. This vocabulary is what lets a team discuss risk with psychological safety.

### LNO energy allocation
- **Leverage** (10x–100x return: strategy documents, key decisions) → peak state, done excellently;
- **Neutral** (return ≈ investment: coordination, reporting) → good enough;
- **Overhead** (return < investment: routine ceremony) → minimum acceptable quality, done fast.
The core move is permitting yourself to be "not excellent" at N and O tasks so peak energy stays available for L.

### How to say no
Give the opportunity cost rather than a vague stall: "doing X means Y slips a quarter", and let the requester see one transparent set of prioritization rules. Be maximally suspicious of "it's only a small feature". "Let's put it in the backlog" is a cowardly no.

## Principles

- Ask "what if we don't" before every feature ships (Zhang Xiaolong).
- Judge research investment by opportunity cost: the bigger the team, the more expensive building is, and the more research pays; a small experiment may answer faster than a study (Shreyas).
- Actively invite dissent and argue hard before the decision; after it, disagree & commit — 100% execution, no hidden ledger.
- Single-item ROI thinking is a trap: approving a project because "it has positive returns" and never comparing opportunity costs — under finite resources, a positive-ROI project can still be the wrong choice.

## Anti-patterns

- Forcing through low confidence: a 20%-confidence moonshot goes straight into the schedule with no research.
- The people-pleaser: the roadmap becomes a political spoils table.
- Uniform perfectionism: applying the Leverage bar to Overhead tasks.
- Anchored single-option decisions: passing "should we or not" judgment on the only solution you thought of.
- Prioritizing (or setting launch tier) by engineering effort: market and business impact are the drivers.

## Sources

Intercom RICE · Noriaki Kano · Marty Cagan / SVPG on the four risks · Shreyas Doshi (LNO / pre-mortem / three layers of product work, Lenny's Podcast & Superhuman docs) · Des Traynor · Zhang Xiaolong
