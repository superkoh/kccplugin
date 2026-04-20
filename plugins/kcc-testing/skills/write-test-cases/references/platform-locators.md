# Platform locators

The skill picks the correct locator vocabulary based on the top-level
`platform:` header. Authors should not mix vocabularies within one file.

## web

- Vocabulary: `role=<aria-role>, name="<accessible-name>"`
- Examples:
  - `role=button, name="应用优惠码"`
  - `role=textbox, name="优惠码"`
  - `role=alert` (no name when the element is uniquely identified by role)
  - `role=status, name="优惠码状态"`
- Forbidden: CSS selectors, XPath, positional descriptions ("the button in
  the bottom-right"), color-based descriptions ("the blue button").
- Rationale: accessibility-tree targeting is ~10× more stable for LLM
  executors than visual grounding (ICCV 2025 + Playwright-MCP evidence).

## ios

- Vocabulary: `accessibility-id="<id>", label="<visible-label>"`
- Examples:
  - `accessibility-id="btn_login", label="登录"`
  - `accessibility-id="email", label="邮箱"`
- When only one identifier is available, emit just that one, e.g.
  `accessibility-id="btn_login"`.
- Forbidden: coordinates, XCUITest predicate strings as primary locator.

## android

- Vocabulary: `resource-id="<fully-qualified-id>", content-description="<desc>"`
- Examples:
  - `resource-id="com.app:id/switch_notifications", content-description="通知开关"`
- `resource-id` uses the full package-qualified form to avoid ambiguity.
- Forbidden: bounds-based locators, class-name-only locators.

## desktop

v0.1 scope: Electron / DOM-backed desktop apps reuse the **web** vocabulary
(ARIA role + accessible name). Native desktop frameworks (Qt, GTK, WinForms,
AppKit) are out of scope for v0.1.
