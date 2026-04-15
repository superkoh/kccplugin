## Summary

<!-- What does this PR do and why? One or two sentences is enough. -->

## Plugin(s) affected

<!-- e.g. hello-world, kcc-core, or "framework only" / "docs only" -->

## Test plan

- [ ] `npm run test:offline` passes locally
- [ ] `PLUGIN=<name> npm run test:offline` passes (if scoped to one plugin)
- [ ] New or changed behavior has test coverage under `plugins/<name>/tests/`
- [ ] L3 YAML cases have a `maxBudgetUsd` cap (only if you touched e2e)
- [ ] Schema changes in `test/schemas/` accompany any new manifest field (only if applicable)

## Notes for reviewers

<!-- Anything non-obvious: design tradeoffs, follow-ups, known gaps. -->
