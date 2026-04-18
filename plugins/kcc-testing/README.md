# kcc-testing

A Claude Code plugin for the kccplugin marketplace. Collects testing-related tools
(skills / agents / hooks — component mix TBD).

Status: **scaffold only**. Manifest and minimal L2/L4 test samples in place; no
user-facing components yet.

## Layout

```
plugins/kcc-testing/
├── .claude-plugin/plugin.json   # marketplace manifest (L1)
├── README.md
└── tests/
    ├── unit/manifest.test.mjs   # L2 — manifest shape sanity check
    └── sdk/expected.json        # L4 — empty requires (smoke only)
```

Component directories (`commands/`, `skills/`, `agents/`, `hooks/`, `scripts/`)
are intentionally absent until the component mix is decided.

## Running tests

From the repo root:

```bash
PLUGIN=kcc-testing npm run test:offline   # L1 + L2 (free)
PLUGIN=kcc-testing npm run test:l4        # L4 smoke (tiny API cost)
```
