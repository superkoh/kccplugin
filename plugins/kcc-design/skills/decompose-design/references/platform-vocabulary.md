# Platform vocabulary

Primitive names per platform. Used so the skill knows what to
call things when parsing input.

**No idiom rules. No constraint rules. No "should" or "must".**
Judgement is the caller's job.

## navigation

| category | web | iOS | Android |
|----------|-----|-----|---------|
| addressable unit | URL route | `NavigationStack` destination | `NavHost` destination |
| tab bar | `<nav role="tablist">`, custom | `TabView` | `BottomNavigation` |
| top bar | `<header>`, `<nav>` | `NavigationBar`, `.toolbar` | `TopAppBar` |
| back affordance | browser back + in-app back link | swipe-back gesture, navigation-bar chevron | system back, optional app-bar back |
| drawer / side menu | `<aside>`, modal drawer | side panel via `NavigationSplitView` | `NavigationDrawer` |

## gesture

| category | web | iOS | Android |
|----------|-----|-----|---------|
| primary action | click / tap | `onTapGesture`, `Button` action | `onClick`, `Button`, ripple |
| long press | `contextmenu` event | `onLongPressGesture` | `combinedClickable` (long-click variant) |
| drag | pointer events, HTML5 drag-and-drop | `DragGesture` | `detectDragGestures` |
| pinch / zoom | gesture events (non-standard) | `MagnificationGesture` | `detectTransformGestures` |
| hover | CSS `:hover`, pointer events | available via trackpad / pencil | available via ChromeOS mouse |
| back | browser back, `popstate` | swipe-back, `dismiss()` | system back, `onBackPressed` |

## motion

| category | web | iOS | Android |
|----------|-----|-----|---------|
| transition syntax | CSS `transition`, WAAPI | SwiftUI `.animation(...)`, `withAnimation` | Compose `animate*AsState`, `updateTransition` |
| spring primitive | custom (JS) | `Animation.spring(response:, dampingFraction:)` | `spring(dampingRatio:, stiffness:)` |
| enter / exit | CSS `@keyframes`, `animation` | `.transition(.slide)`, custom | `AnimatedVisibility`, `EnterTransition` |
| shared element | View Transitions API | `matchedGeometryEffect` | `SharedElementTransition` |
| haptics | Vibration API (limited) | `UIImpactFeedbackGenerator`, `sensoryFeedback` | `HapticFeedbackType.LongPress` |

## controls

| category | web | iOS | Android |
|----------|-----|-----|---------|
| button | `<button>`, `.btn` | `Button`, `.borderedProminent`, `.bordered` | `Button`, `FilledButton`, `OutlinedButton`, `TextButton` |
| text input | `<input>`, `<textarea>` | `TextField`, `SecureField`, `TextEditor` | `TextField`, `OutlinedTextField` |
| selection | `<select>`, `<input type="radio">`, `<input type="checkbox">` | `Picker`, `Menu`, `Toggle` | `DropdownMenu`, `RadioButton`, `Switch`, `Checkbox` |
| list | `<ul>` / `<ol>`, ARIA `listbox` | `List`, `ForEach` | `LazyColumn`, `LazyRow` |
| modal | `<dialog>`, modal overlay | `.sheet`, `.fullScreenCover`, `.alert` | `Dialog`, `AlertDialog`, `ModalBottomSheet` |

## typography

| category | web | iOS | Android |
|----------|-----|-----|---------|
| system base | `system-ui`, font stack | Dynamic Type (`.body`, `.title`, `.headline`, `.caption`) | Material `Typography.bodyLarge`, etc. |
| size unit | `px`, `rem`, `em` | `pt` | `sp`, `dp` |
| weight | numeric 100–900, keyword weights | `.regular`, `.medium`, `.semibold`, `.bold` | `FontWeight.Normal`, `.Medium`, `.Bold`, etc. |

## density

| category | web | iOS | Android |
|----------|-----|-----|---------|
| base unit | `px`, `rem` | `pt` | `dp` (layout), `sp` (text) |
| dynamic scaling | media queries, `vh` / `vw`, `clamp()` | Dynamic Type, size classes | density buckets (`ldpi`, `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) |

## safe-area / viewport

| category | web | iOS | Android |
|----------|-----|-----|---------|
| notch / status-bar handling | `env(safe-area-inset-*)` | `.safeAreaInset`, `.ignoresSafeArea` | `WindowInsets`, `systemBarsPadding` |
| keyboard avoidance | focus scroll, `resize` | automatic in `ScrollView`, `.ignoresSafeArea(.keyboard)` | `WindowInsets.ime`, `imePadding` |
| viewport declaration | `<meta name="viewport">` | N/A (fullscreen by default) | N/A (fullscreen by default) |
