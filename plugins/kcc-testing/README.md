# kcc-testing

Testing-related tools for the `kccplugin` marketplace.

## Shipped in v0.1

### `write-test-cases` skill

Turns a feature / PRD fragment into a YAML coverage set of
**LLM-executable manual QA test cases** — the kind a human QA would
write, but optimised for an LLM browser / mobile / desktop agent to
drive the real product UI.

- Output: `<project-root>/.kcc/tests/cases/<feature-slug>.yaml`
- Platforms: `web`, `ios`, `android`, `desktop` (Electron / DOM-backed only).
- Built-in lint: testability five-check + UI/UX quantification
  (WCAG / HIG / Material floors auto-injected).

Trigger phrases:
- 写测试用例 / 给这个 feature 出用例 / 帮我覆盖这个需求 / 写 QA 用例
- write test cases / cover this feature with tests / QA cases for this

See `skills/write-test-cases/SKILL.md` for the full run flow,
`skills/write-test-cases/examples/` for three platform-diverse example
YAMLs, and `skills/write-test-cases/references/` for the schema,
lint rules, coverage techniques, and platform locator vocabulary.

## Layout

```
plugins/kcc-testing/
├── .claude-plugin/plugin.json
├── README.md
├── skills/
│   └── write-test-cases/
│       ├── SKILL.md
│       ├── references/
│       └── examples/
└── tests/
    ├── unit/
    │   ├── manifest.test.mjs
    │   └── examples.test.mjs
    └── sdk/expected.json
```

## Running tests

From the repo root:

```bash
PLUGIN=kcc-testing npm run test:offline   # L1 + L2 (free)
PLUGIN=kcc-testing npm run test:l4        # L4 smoke (tiny API cost)
```
