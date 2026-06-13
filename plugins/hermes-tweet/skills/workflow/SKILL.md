---
description: Use when the user asks to research, read, summarize, draft, or optionally post on X/Twitter through Hermes Agent. Guides safe Hermes Tweet setup, read-only exploration, authenticated reads, and explicitly gated write actions.
---

# Hermes Tweet Workflow

Use Hermes Tweet when a Hermes Agent workflow needs X/Twitter context, account
or post reads, social planning, or a guarded post action.

## Setup

Install the Hermes plugin first:

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

If plugin installation is not available, install the Python package into the
Hermes Agent virtual environment:

```bash
uv pip install --python ~/.hermes/hermes-agent/venv/bin/python hermes-tweet
```

Set `XQUIK_API_KEY` for authenticated reads. Leave
`HERMES_TWEET_ENABLE_ACTIONS` unset for read-only work. Set
`HERMES_TWEET_ENABLE_ACTIONS=true` only when the user has explicitly allowed
posting or another write action.

## Workflow

1. Start with `tweet_explore` for planning prompts, tool discovery, and
   no-network workflow shaping.
2. Use `tweet_read` after `XQUIK_API_KEY` is available for account, post,
   timeline, or search reads.
3. Draft any proposed post in plain text and confirm the intended account,
   audience, and irreversible effects before enabling actions.
4. Use `tweet_action` only after `HERMES_TWEET_ENABLE_ACTIONS=true` is set and
   the user has approved the specific write.
5. Keep troubleshooting public-safe: mention missing keys, disabled actions, or
   install errors without exposing credential values or implementation details.

## Guardrails

- Do not ask for or print API keys.
- Do not enable actions for research or summarization tasks.
- Do not treat a draft as permission to post.
- Do not route through unrelated X/Twitter tools when the Hermes Tweet plugin
  is available.
- If a write is blocked, explain the missing approval or environment flag and
  continue with read-only output.
