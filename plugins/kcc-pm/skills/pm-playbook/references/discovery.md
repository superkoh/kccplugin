# User insight and requirement discovery

> How to find a real need and validate it. Writing code is the most
> expensive way to validate anything — always the last resort.

## Framework quick reference

| Framework | In one line | When to use |
|---|---|---|
| Continuous discovery + opportunity solution tree (Teresa Torres) | Maintain an outcome → opportunity → solution → test tree through weekly interviews | Moving from shipping features to delivering outcomes |
| JTBD (Christensen) | Users "hire" a product to get a job done; the competition is every alternative | Defining a new product, getting at the essence of a need |
| The Mom Test (Fitzpatrick) | Talk about their life, not your idea | Every single user interview |
| Yu Jun's user model | A user is a bundle of needs, not a person | When a requirement review devolves into "users want X" |
| Yu Jun's user-value formula | Value = (new experience − old experience) − switching cost | Judging whether a feature/product can displace the status quo |
| Liang Ning's pain/pleasure/itch + personas | Pain is fear, pleasure is instant gratification, itch is the imagined self | Characterizing a need, finding the wedge |
| 10/100/1000 (Pony Ma) | 10 surveys, 100 user voices, 1000 pieces of feedback per month | Institutionalizing contact with users |
| Two-sided aha-moment comparison | Compare retained vs churned behavior to find the magic number | Setting the activation target, improving onboarding |

## Core practices

### Interview discipline (the Mom Test's three rules)
1. Talk about their life, not your idea;
2. Ask about concrete past facts, not future opinions — replace "would you use it / would you buy it?" with "when did you last hit this problem? What did you do about it? What did it cost you?";
3. Talk less, listen more.

Test for a real signal: they paid real currency — **time** (booking a next meeting with an agenda, trialling the product), **reputation** (introducing a colleague or their boss) or **money** (a letter of intent, a prepayment). Filter "I usually / I would / I might" as noise; **discard all compliments** — "compliments are the fool's gold of customer learning".

### Continuous discovery cadence (Torres)
- At least one customer interview a week, attended by the "product trio" of PM + design + engineering; interviewing is a continuous rhythm (like brushing your teeth), not a project milestone.
- Every opportunity on the tree must trace back to a real pain story from an interview; opportunities from internal brainstorms are not allowed.
- Compare at least 3 candidate solutions in parallel for the same target opportunity — compare-and-contrast decisions substantially beat single-option "should we or not".

### Yu Jun's two formulas
- **User value = (new experience − old experience) − switching cost.** Three levers: maximize the new experience (new technology / new audience / new channel), minimize the old one (enter through the users whose current experience is worst), and minimize switching cost (drive down all four kinds: awareness, acquisition, usage, transaction).
- Five properties of users: heterogeneity, situationality, plasticity, self-interest, bounded rationality. Every requirement discussion must be bound to a concrete situation — the same person in a different situation is a different user.

### The aha-moment method (where discovery meets growth)
Compare the early behavior of retained users against churned users (looking at retained users alone is survivorship bias), find the behavior unique to and positively correlated with retention, A/B validate the causality, then hardwire it into onboarding. Cases: Facebook's 7 friends in 10 days, LinkedIn's 5 connections in a week, Dropbox's first uploaded file. For reference: a 10% lift in D1 retention can be worth roughly 30% in MAU.

## Principles

- A user is a bundle of needs, not a person (Yu Jun); don't judge, educate or correct user behavior — study "the whole, living person" (Liang Ning).
- Listen to complaints, don't copy the user's solution — WeChat refuses read receipts to leave the recipient room to lie and protect the weaker party (Zhang Xiaolong).
- High-end users don't post in forums, so go lurk in their communities and chase them down (Pony Ma's 10/100/1000).
- Validate a need against the history of prior failures: every great need has already been attempted by someone earlier, at the wrong time and in the wrong way; study why they failed, which PEST variable has changed, and whether the timing window has opened (Wang Huiwen).
- When writing a requirement, state explicitly whether it is a pain (fear), a pleasure (instant gratification) or an itch (the imagined self) — fear is the strongest motivator to pay (Liang Ning).

## Anti-patterns

- The interview becomes a pitch: presenting your idea and collecting "sounds good".
- Project-shaped research: one round of user research at kickoff, then decisions made today on three-month-old understanding.
- Fake needs built in a vacuum: reasoning from technology to use case instead of use case to technology (the "we've integrated an LLM" kind of self-congratulation).
- Imagining users as roles: believing users "ought to" behave a certain way; treating users as abstract "traffic".

## Sources

Teresa Torres, *Continuous Discovery Habits* / producttalk.org · Rob Fitzpatrick, *The Mom Test* · Yu Jun, *Yu Jun on Product Methodology* · Liang Ning, *30 Lectures on Product Thinking* · Zhang Xiaolong, *The Product Philosophy Behind WeChat* (2012) · Pony Ma's product rules (woshipm) · Facebook/LinkedIn aha-moment practice (woshipm)
