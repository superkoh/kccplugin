# Frontend unit testing

The difficulty is not the paradigm — it is that frontend logic tends
to be welded to the DOM, framework lifecycles, and async state. The
strategy is to split by layer and test each layer with the cheapest
tool that observes behavior.

## Layer strategy

| Layer | Contents | How to test | Priority |
|-------|----------|-------------|----------|
| Pure logic | formatters, validators, calculations, reducers, selectors | plain unit tests — identical to backend | high |
| State logic | custom hooks, stores | `renderHook` / drive the store directly | high |
| Component behavior | interaction, conditional rendering, event callbacks | Testing Library | medium |
| Presentational | layout and styling only | skip, or visual regression | low |
| Pages / flows | multi-component, routing, real requests | E2E — the black-box family, not unit tests | — |

**First move: squeeze logic out of components.** Nine times out of
ten a hard-to-test component is one with validation / calculation /
transform logic written inline. Extract it into pure functions or
hooks and the testing difficulty drops to backend level. "This is
hard to test" is a design signal — the coupling is too tight — not a
call for heavier test machinery.

## Component tests: behavior, not implementation

```js
// ❌ implementation details — breaks on a renamed class or state key
expect(wrapper.state('isOpen')).toBe(true);
expect(wrapper.find('.dropdown-menu')).toHaveLength(1);

// ✅ user-observable behavior
await userEvent.click(screen.getByRole('button', { name: 'Choose city' }));
expect(screen.getByRole('listbox')).toBeVisible();
```

Query priority: `getByRole` > `getByLabelText` > `getByText` >
`getByTestId`. The earlier ones double as accessibility checks;
`data-testid` is the fallback, not the default.

## Typical toolkit

- **Vitest** (Vite projects) or **Jest** — runner.
- **@testing-library/react** (or the vue / svelte flavor) — render
  and query.
- **@testing-library/user-event** — realistic interaction; fires the
  full event sequence `fireEvent` skips.
- **MSW** — mock at the network layer; one handler set serves both
  unit and E2E tests.
- **Playwright** — E2E and visual regression (black-box territory).

Verify current versions and maintenance status before adopting —
this ecosystem moves fast.

## Four classic pitfalls

- **Async & timers.** Use `findBy*` (built-in waitFor), not manual
  `setTimeout`. Debounce/throttle needs fake timers — configured to
  match user-event's settings, or interactions hang.
- **Dates & randomness.** Route both through an injectable source
  (`Date.now()` wrapped, generators injected) and control them in
  the test; they are the top two flakiness sources in frontend
  suites.
- **Whole-tree snapshots.** `toMatchSnapshot()` over a component
  tree fails on every styling touch, trains everyone to blindly
  `-u`, and ends up asserting nothing. Snapshot small, specific
  outputs only.
- **One mock boundary.** Agree where mocks live (network layer vs
  module layer) and keep it consistent; MSW pins it at the network
  layer, which is why it is recommended.
