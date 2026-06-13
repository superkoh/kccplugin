# Hermes Tweet Plugin

Hermes Tweet is a Hermes Agent plugin for X/Twitter research, timeline reading,
and optional posting. It keeps write actions explicitly gated while leaving
read-only discovery workflows available for planning and analysis.

## Install

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

If the Hermes plugin install path is unavailable, install the package into the
Hermes Agent Python environment:

```bash
uv pip install --python ~/.hermes/hermes-agent/venv/bin/python hermes-tweet
```

Set `XQUIK_API_KEY` before using authenticated reads. Set
`HERMES_TWEET_ENABLE_ACTIONS=true` only when the workflow is allowed to post.

## Skill

Use `/hermes-tweet:workflow` when planning social research, reading X/Twitter
signals, drafting posts, or checking whether a write action is allowed.
