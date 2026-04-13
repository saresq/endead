# Endead - UI Redesign Review

Review date: 2026-04-11  
Scope: Verify UI redesign migration completeness, find old patterns, suggest improvements.

---

## 1. Migration Status by Phase

### Phase 1 — Foundation: COMPLETE

| Task | File | Status | Notes |
|------|------|--------|-------|
| Design tokens | `src/styles/tokens.css` | Done | All colors, spacing, typography, shadows, radii as CSS custom properties |
| CSS Reset | `src/styles/reset.css` | Done | |
| Base styles | `src/styles/base.css` | Done | |
| Utilities | `src/styles/utilities.css` | Done | Stack, grid, text utilities |
| CSS barrel | `src/styles/index.css` | Done | Imports all stylesheets |
| Inter font | `index.html` | Done | Google Fonts preconnect + import |
| Icon library | `src/client/ui/components/icons.ts` | Done | Wraps Lucide, exports `icon()` and `renderIcon()` |
| Icons CSS | `src/styles/components/icons.css` | Done | Size variants (sm/md/lg) |
| Responsive layout | `src/styles/layout.css` + `game-layout.css` | Done | Breakpoints, safe areas, game shell |
| Buttons | `src/client/ui/components/Button.ts` + `buttons.css` | Done | `renderButton()` with variants, sizes, icons |
| Forms | `src/styles/components/forms.css` | Done | Input styling |

**Old `src/style.css`**: Deleted from disk (pending git commit). No imports reference it. `main.ts:1` imports `./styles/index.css`.

### Phase 2 — Identity Systems: COMPLETE

| Task | File | Status | Notes |
|------|------|--------|-------|
| Player identities | `src/client/config/PlayerIdentities.ts` | Done | 6 colors + shapes, colorblind-safe |
| Player avatar | `src/client/ui/components/PlayerAvatar.ts` | Done | `renderAvatar()` with sizes, states, glow |
| Player avatar CSS | `src/styles/components/player-avatar.css` | Done | |
| Zombie type config | `src/client/config/ZombieTypeConfig.ts` | Done | 4 types with color, icon, shape, scale |
| Zombie badge | `src/client/ui/components/ZombieBadge.ts` | Done | `renderZombieBadge()`, `renderZombieChip()`, `renderZombieSummary()` |
| Zombie CSS | `src/styles/components/zombie.css` | Done | |

### Phase 3 — Shared UI Systems: COMPLETE

| Task | File | Status | Notes |
|------|------|--------|-------|
| Modal manager | `src/client/ui/overlays/ModalManager.ts` | Done | Focus trap, escape, stacking, ARIA, bottom-sheet, animations |
| Modals CSS | `src/styles/components/modals.css` | Done | |
| Notification manager | `src/client/ui/NotificationManager.ts` | Done | Toast system with variants, priorities, auto-dismiss, progress bars |
| Notifications CSS | `src/styles/components/notifications.css` | Done | |

### Phase 4 — Screens: COMPLETE

| Task | File | Status | Notes |
|------|------|--------|-------|
| Lobby UI | `src/client/ui/LobbyUI.ts` + `lobby.css` | Done | Uses renderButton, renderAvatar, icon() |
| Menu UI | `src/client/ui/MenuUI.ts` + `menu.css` | Done | Uses renderButton |
| Game HUD | `src/client/ui/GameHUD.ts` + `hud.css` | Done | Uses renderActionButton, renderStatBar, renderAvatar, renderItemCard, renderEventEntry, modalManager, notificationManager |
| Trade UI | `src/client/ui/TradeUI.ts` + `trade.css` | Done | Uses renderButton, renderItemCard, renderEmptySlot |
| Pickup UI | `src/client/ui/PickupUI.ts` | Done | Uses renderButton, renderItemCard, renderEmptySlot |

### Deleted Old Code: COMPLETE

| Old File | Status |
|----------|--------|
| `src/style.css` | Deleted (git `D` status) |
| `src/client/ui/SurvivorDashboard.ts` | Deleted (git `D` status) |
| `src/client/PlayerColors.ts` | Replaced by `PlayerIdentities.ts` |

No references to `SurvivorDashboard`, `PlayerColors`, or `style.css` remain in the codebase.

---

## 2. Old Patterns Audit

### 2.1 Native JS Dialogs: NOT CLEAN

| Pattern | Occurrences | Files | Status |
|---------|-------------|-------|--------|
| `alert()` | **6** | `MapEditor.ts:1103, 1108, 1135, 1137, 1141, 1152` | Editor only — lower priority |
| `confirm()` | **3** | `MapEditor.ts:1088`, **`PickupUI.ts:36`**, **`LobbyUI.ts:245`** | **Core game UI — must fix** |
| `prompt()` | **2** | `MapEditor.ts:1157`, **`LobbyUI.ts:287`** | **Core game UI — must fix** |

**Critical**: `PickupUI.ts:36` uses `confirm('Skip this item?')` and `LobbyUI.ts:245` uses `confirm('Kick this player?')` — these are core gameplay flows that should use `modalManager.open()` with confirm/cancel buttons. `LobbyUI.ts:287` uses `window.prompt()` for room URL sharing which should be a copy-to-clipboard with notification toast.

The MapEditor's 6 `alert()` + 1 `confirm()` + 1 `prompt()` calls are lower priority since the editor is a dev tool, but should still be migrated for consistency.

### 2.2 showMessage Legacy Wrapper: ACCEPTABLE

`GameHUD.showMessage()` still exists (5 call sites) but is now a thin wrapper around `notificationManager.show()` (`GameHUD.ts:58-60`). Callers:
- `KeyboardManager.ts:113` — "Select a CLOSED DOOR zone to open it."
- `KeyboardManager.ts:147` — "No one else here to trade with."
- `GameHUD.ts:142` — "Select a CLOSED DOOR zone"
- `GameHUD.ts:165` — "Select a Zone to Attack!"
- `GameHUD.ts:453` — "No one else here to trade with."

**Recommendation**: Consider removing the `showMessage` wrapper and having callers use `notificationManager.show()` directly. The wrapper hides the notification variant/priority system.

### 2.3 Inline Styles for Design Values: NEEDS WORK

Found **18 inline style occurrences** that use design values (colors, spacing, font-size) rather than just dynamic data:

**GameHUD.ts** (6 instances):
- Line 298: `style="margin-top:var(--space-2)"` — spacing via inline style, should be a utility class
- Line 318: `style="font-size:var(--text-sm);color:var(--text-muted)"` — should be a CSS class
- Line 345: `style="color:var(--text-secondary);font-size:var(--text-sm)"` — should be a CSS class
- Line 377: `style="text-align:center;color:var(--text-muted);padding:var(--space-6)"` — should be a CSS class
- Line 380: `style="gap:var(--space-2)"` — spacing override, could be a grid variant class
- Line 419: `style="padding:var(--space-2) 0"` — should be a utility class

**TradeUI.ts** (2 instances):
- Line 191: `style="color:var(--text-muted);font-size:var(--text-xs)"` — placeholder text style
- Line 198: `style="color:var(--text-muted);font-size:var(--text-xs)"` — placeholder text style

**LobbyUI.ts** (1 instance):
- Line 145: `style="color:var(--warning);display:inline-flex"` — host crown icon styling

**StatBar.ts** (2 instances — dynamic, acceptable):
- Line 25: `style="color:${opts.color}"` — dynamic color per stat type
- Line 29: `style="width:${pct}%;background:${opts.color}"` — dynamic width + color

**PlayerAvatar.ts** (1 instance — dynamic, acceptable):
- Line 41: `style="background:${identity.primary};color:${identity.onColor};..."` — dynamic per-player colors

**ZombieBadge.ts** (2 instances — dynamic, acceptable):
- Line 23: `style="background:${display.color}"` — dynamic per-zombie-type
- Line 32: `style="border-left-color:${display.color}"` — dynamic per-zombie-type

**GameHUD.ts** (1 instance):
- Line 395: `style="color:var(--text-secondary)"` — end game confirmation text

**MapEditor.ts** (2 instances):
- Line 1075: `style="color: #0f0;"` — hardcoded green for "Map valid"
- Line 1078: `style="color: ${...}"` — hardcoded `#fa0` and `#f44` for warnings/errors

**Summary**: 10 inline styles use token values (should be CSS classes), 5 use dynamic data (acceptable), 2 use hardcoded hex in MapEditor (should use tokens), 2 in components use per-instance dynamic colors (acceptable).

### 2.4 Hardcoded Colors in TypeScript: PIXI RENDERER

The `PixiBoardRenderer.ts` contains **48 hardcoded hex colors** (e.g., `0x1a1a1a`, `0xFF0000`, `0x333333`, `0x225522`). These are PIXI.js numeric format which can't directly use CSS custom properties.

Key examples:
- `line 365`: `0x1a1a1a` — background fill
- `line 484-488`: Zone colors (`0x333333` street, `0x554444` building, `0x225522` valid move, `0x224466` pending move)
- `line 517`: `0xFFFF00` — noise token
- `line 535`: `0xFF0000` — spawn point
- `line 558`: `0xFFD700` — objective token

**Recommendation**: Extract all PIXI colors into a shared `BoardTheme` config object (similar to `ZombieTypeConfig.ts` pattern). This would allow theme changes and keep colors in one place even though they can't use CSS tokens directly.

The `PlayerIdentities.ts` and `ZombieTypeConfig.ts` already follow this pattern well — they define both CSS and numeric color values. The board renderer should do the same.

### 2.4b Hardcoded Colors in CSS Files

Several component CSS files still have hardcoded color values instead of tokens:

- `src/styles/components/item-card.css` — `#fff` at lines ~91, 121, 136
- `src/styles/components/hud.css` — `#fff` at line ~512
- `src/styles/components/buttons.css` — `#fff` at lines ~51, 82
- Multiple files use hardcoded `rgba()` values (hud.css, trade.css, modals.css, buttons.css, item-card.css, player-avatar.css) for backgrounds/overlays that should reference token-derived values

These should use existing tokens like `var(--text-inverse)`, `var(--surface-elevated)`, or new opacity-based tokens.

### 2.5 Old Notification Patterns: CLEAN

No `showMessage` floating text patterns remain. All notifications go through `NotificationManager`. The old `showMessage` method is a proper wrapper.

### 2.6 Custom Modal DIVs: MOSTLY CLEAN

GameHUD's 5 modals (backpack, end game, game over, skill chooser, confirm end) all use `modalManager.open()`. No UI file creates raw `class="modal"` divs.

**However**, `PickupUI` and `TradeUI` manage their own overlay visibility (show/hide via container element) without using `modalManager` at all. They function as overlays but lack modalManager's focus trap, escape-to-close, backdrop click dismiss, and ARIA attributes. See section 4.6 for improvement suggestion.

### 2.7 References to Deleted Files: CLEAN

| Old Reference | Found | Status |
|---------------|-------|--------|
| `SurvivorDashboard` | 0 | Clean |
| `PlayerColors` | 0 | Clean |
| `CombatResolver` | 0 | Clean |
| `TargetSelector` | 0 | Clean |
| `style.css` (import) | 0 | Clean |

---

## 3. Component Adoption Audit

### 3.1 Button Component

| Screen | Uses `renderButton()` | Raw `<button>` HTML | Status |
|--------|----------------------|---------------------|--------|
| MenuUI | Yes (3 buttons) | 0 | Fully migrated |
| LobbyUI | Yes (3 buttons) | 0 | Fully migrated |
| GameHUD | Via renderActionButton + renderButton in modals | 0 in actions | Fully migrated |
| PickupUI | Yes (2 buttons) | 0 | Fully migrated |
| TradeUI | Yes (2 buttons) | 0 | Fully migrated |
| ModalManager | Uses `btn` CSS classes directly | 2 (close buttons) | Acceptable — internal component |
| NotificationManager | Uses `btn` CSS classes directly | 2 (dismiss buttons) | Acceptable — internal component |

### 3.2 Icon Usage

All icons go through `icon()` or `renderIcon()` from `icons.ts`. No raw SVG or emoji icons found in UI files. Lucide is the sole icon source.

### 3.3 PlayerAvatar Adoption

- `LobbyUI.ts` — Uses `renderAvatar()` for player list
- `GameHUD.ts` — Uses `renderAvatar()` for player strip at top of HUD
- `PixiBoardRenderer.ts` — Uses `PlayerIdentities.ts` colors (numeric) for canvas rendering — correct, can't use DOM components on canvas

### 3.4 ItemCard Adoption

- `PickupUI.ts` — Uses `renderItemCard()` and `renderEmptySlot()`
- `TradeUI.ts` — Uses `renderItemCard()` and `renderEmptySlot()`
- `GameHUD.ts` — Uses `renderItemCard()` for backpack modal and weapon display

### 3.5 Other Components

| Component | Used In | Status |
|-----------|---------|--------|
| `renderActionButton()` | GameHUD (6 action buttons) | Fully adopted |
| `renderStatBar()` | GameHUD (HP, XP, AP bars) | Fully adopted |
| `renderEventEntry()` | GameHUD (event log) | Fully adopted |
| `renderZombieBadge()` | EventEntry (spawn events) | Fully adopted |
| `renderZombieChip()` | Defined but usage not confirmed | Needs verification |

---

## 4. Improvements Identified

### 4.1 Extract Inline Styles to CSS Classes

Create utility/component classes for the 9 repeated inline patterns:

```css
/* Suggestion: Add to utilities.css or hud.css */
.text-muted-sm { color: var(--text-muted); font-size: var(--text-sm); }
.text-secondary-sm { color: var(--text-secondary); font-size: var(--text-sm); }
.text-center-muted { text-align: center; color: var(--text-muted); padding: var(--space-6); }
.text-placeholder { color: var(--text-muted); font-size: var(--text-xs); }
```

### 4.2 Create Board Theme Config

Extract the 48 hardcoded PIXI colors from `PixiBoardRenderer.ts` into a `BoardTheme.ts` config:

```typescript
// Suggested: src/client/config/BoardTheme.ts
export const BOARD_THEME = {
  background: 0x1a1a1a,
  zone: { street: 0x333333, building: 0x554444, validMove: 0x225522, pendingMove: 0x224466, exit: 0x224466 },
  token: { noise: 0xFFFF00, spawn: 0xFF0000, objective: 0xFFD700, searchable: 0xFFFFFF },
  wall: { color: 0x000000, width: 4 },
  door: { open: 0x00FF00, closed: 0xFF0000 },
  // ...
};
```

### 4.3 MapEditor Needs Design System

`MapEditor.ts` is the only file with hardcoded hex colors in HTML (`#0f0`, `#fa0`, `#f44`). It should use the same CSS tokens (`var(--success)`, `var(--warning)`, `var(--danger)`).

### 4.4 Remove showMessage Wrapper

`GameHUD.showMessage()` is a legacy wrapper around `notificationManager.show()`. The 6 call sites could be updated to use `notificationManager` directly, which would:
- Expose variant/priority control to callers
- Remove a layer of indirection
- Make the API surface consistent

### 4.5 Event Listener Management

UI components add event listeners via `innerHTML` + delegated clicks, but some also add direct listeners (drag/drop in PickupUI and TradeUI) that aren't cleaned up on re-render. Consider:
- A `cleanup()` pattern before each re-render
- Or switching to fully delegated event handling on the container

### 4.6 PickupUI and TradeUI Modal Migration

`PickupUI` and `TradeUI` render themselves into containers (`this.containerEl`) rather than using `modalManager`. Since they behave as overlays:
- They could benefit from ModalManager's focus trap, escape-to-close, and backdrop
- Currently they manage their own show/hide visibility
- This is a larger refactor but would improve consistency

### 4.7 Accessibility Gaps

While `ModalManager` has good ARIA support (role, aria-modal, aria-label, focus trap):
- `GameHUD` action buttons lack `aria-describedby` for cost/state info
- `LobbyUI` player list has no `role="list"` / `role="listitem"`
- `TradeUI` drag-and-drop has no keyboard alternative
- `PickupUI` drag-and-drop has no keyboard alternative
- Stat bars lack `role="progressbar"` + `aria-valuenow`/`aria-valuemax`

### 4.8 Hardcoded Timeouts Coupled to CSS Transitions

`ModalManager.ts:189` uses `setTimeout(cleanup, 350)` and `NotificationManager.ts` uses similar hardcoded timeouts for dismiss cleanup. These values must match the CSS transition durations — if the CSS changes, the JS breaks silently (elements removed too early or too late). Should use `transitionend` events instead.

### 4.9 Weapon Buttons in HUD Are Raw HTML

While all 6 action buttons use `renderActionButton()`, the weapon attack buttons in `GameHUD.ts` (around line 315) use raw `<button class="hud-weapon-btn">` HTML elements. These could benefit from the Button component or a dedicated weapon button component for consistency.

### 4.10 MapEditor Is Entirely Unmigrated

`MapEditor.ts` is the single largest source of old patterns. Beyond the 8 native dialogs already noted, it has:
- **Lines 120-147**: Extensive inline `style.cssText` assignments with ~20 hardcoded hex colors (`#111`, `#222`, `#333`, `#444`, `#555`, `#666`, `#888`, `#8af`, `#fff`, `#ccc`, `#0af`, `#f44`, `#28f`, `#fd0`, `#a33`, `#36a`, `#964B00`, `#8B4513`, `#2a6`, etc.)
- All UI built via raw `document.createElement` — does not use any component system (no `renderButton`, no `icon()`, no CSS tokens)
- This is a developer tool so it's lower priority, but it's a significant pocket of legacy UI

### 4.11 Console.log in Client Code

6 `console.log` calls in client-side code (not UI files, but client infrastructure):
- `AudioManager.ts:97` — "Loaded N SFX"
- `AssetManager.ts:67` — "Loaded N sprite assets"
- `InputController.ts:45` — "Input Mode: X"
- `NetworkManager.ts:37` — "Connected to server"
- `NetworkManager.ts:128` — "Reconnect attempt"
- `PixiBoardRenderer.ts:354` — "Drawing Editor Grid"

These should be removed or gated behind a debug flag for production.

### 4.12 LobbyUI Additional Inline Style

`LobbyUI.ts:87` has `style="display:flex;justify-content:center"` that should be a utility class (e.g., `.flex-center` which already exists in `utilities.css`).

### 4.13 GameHUD Custom Button Elements

Beyond the weapon buttons noted in 4.9, the backpack FAB at `GameHUD.ts:326` uses a raw `<button class="hud-backpack-fab">` element, and character class selection buttons in `LobbyUI.ts` also use custom HTML instead of `renderButton()`. These all use appropriate CSS classes and event delegation, but are inconsistent with the component pattern.

### 4.14 Mobile Bottom Sheet Polish

`ModalManager` has a drag handle (`.modal__drag-handle`) for bottom-sheet behavior but:
- No touch drag-to-dismiss gesture handler in JS
- The handle is purely visual — it doesn't actually enable swipe-down-to-close
- Modals animate with CSS transitions but the bottom-sheet specific behavior (partial open, snap points) isn't implemented

---

## 5. Summary

### What's Done Well
- **Full component library** — Button, ActionButton, StatBar, ItemCard, EventEntry, PlayerAvatar, ZombieBadge all properly implemented and adopted
- **Clean modal system** — ModalManager with focus trap, ARIA, stacking, animations — used by all GameHUD modals
- **Clean notification system** — NotificationManager with variants, priorities, progress bars — showMessage properly wraps it
- **Old code fully removed** — style.css, SurvivorDashboard, PlayerColors all deleted with no dangling references
- **Icon consistency** — all icons via Lucide `icon()` helper
- **Design tokens** — comprehensive token system in tokens.css covering colors, spacing, typography
- **Responsive layout** — breakpoints, safe areas, game shell layout all in CSS

---

## 6. Requested Improvements (User Feedback)

### 6.1 Board Entity Differentiation

Currently all entities are plain colored circles with no text or icons. Until proper game assets are created, the board needs better visual differentiation:

**Zombie Initials on Board Circles**  
Each zombie type's circle should display a bold letter initial inside it:
- **W** — Walker (rename from Z to avoid confusion with generic "zombie")
- **R** — Runner
- **B** — Brute (renamed from "Fatty")
- **A** — Abomination

This requires:
- `PixiBoardRenderer.ts:808-827` — Add PIXI.Text child with the initial letter centered inside each zombie circle
- `ZombieTypeConfig.ts` — Add an `initial` field to `ZombieTypeDisplay` (e.g., `initial: 'W'`)
- `GameState.ts:56-59` — Rename `ZombieType.Fatty` to `ZombieType.Brute` (or alias it)
- All references to "Fatty" across the codebase need updating (SpawnRegistry, ZombiePhaseManager, ActionProcessor toughness/XP tables, ZombieTypeConfig display label)

**Spawn Point Icons**  
`PixiBoardRenderer.ts:527-537` — Spawn points are currently red diamonds. They should:
- Display a **skull icon** (Lucide `Skull`) instead of a plain diamond
- Be **numbered** in spawn order (Spawn 1, Spawn 2, etc.) with the number visible on the board
- The number should correspond to the order zones appear in `spawnZones` (sorted by zone ID in `ZombiePhaseManager.ts:148`)

**Spawn Information Legend**  
The spawn context display (event log / notification) should show numbered spawn results:
> "Spawn 1: 3 Runners"  
> "Spawn 2: 1 Brute, 2 Walkers"

This requires updating:
- `EventEntry.ts` — `renderSpawnEntry()` should number each spawn card by spawn point order
- `GameState.ts:299-307` — `spawnContext.cards` already has `zoneId` which can be mapped to spawn order

### 6.2 Zone Indicator Icons

**Noise Token** (`PixiBoardRenderer.ts:515-518`)  
Currently a plain yellow circle. Should be replaced with a **sound/alert icon** (Lucide `Volume2` or `AlertTriangle`). Since this is PIXI canvas, options are:
- Render a PIXI.Text with a unicode speaker symbol
- Pre-render the Lucide icon to a texture and use as PIXI.Sprite
- Draw a simple speaker/alert shape with PIXI.Graphics paths

**Searchable Indicator** (`PixiBoardRenderer.ts:520-524`)  
Currently a tiny white circle (5px radius). Should be replaced with a **Lucide search icon** (`Search`) rendered slightly larger (~12-14px). Same rendering approach as noise token above.

### 6.3 Tooltip Component

A new **tooltip component** is needed that appears on hover (desktop) or long-press (mobile) over any board entity. The tooltip should display context-relevant information:

**Player/Survivor Tooltip:**
- Name, character class
- Danger level (color-coded: Blue/Yellow/Orange/Red)
- HP: X/3 with bar
- AP: X/N remaining
- XP: current value + next threshold
- Equipped weapons (name, range, damage)
- Active skills list

**Zombie Tooltip:**
- Type name (Walker, Runner, Brute, Abomination)
- Toughness (damage needed to kill)
- Actions per turn (1 for most, 2 for Runners)
- Special note for Abomination: "Can only be killed by Damage 3+ weapons or Molotov"

**Objective Tooltip:**
- Objective type and description
- XP reward on completion
- Progress (if applicable, e.g., "2/4 objectives taken")

**Implementation approach:**
- Create `src/client/ui/components/Tooltip.ts` with a `renderTooltip(content: string, x: number, y: number)` function
- Position the tooltip relative to the mouse/touch point, flipping if near screen edge
- Style via `src/styles/components/tooltip.css` using design tokens
- Hook into `PixiBoardRenderer` — on entity hover, determine entity type and build tooltip content
- On mobile, trigger via long-press (300ms+ touch without move)

### 6.4 Turn History Log

Currently `state.history` stores all actions but there's no way to browse them. The "Turn #" display in the HUD top bar should become a **clickable button** that opens a full turn history modal.

**History Modal Requirements:**
- Opens via `modalManager.open()` when clicking the turn number in the HUD top bar
- Content is **clearly separated by turn number** with visual dividers/headers
- Each turn section shows:
  - Turn number header (e.g., "Turn 3 — Yellow Danger")
  - **Player Phase**: Each player's actions listed chronologically
    - Move: "Amy moved to z_2_3"
    - Attack: "Josh attacked with Pistol — 2 hits, killed 1 Walker" (with dice roll details)
    - Search: "Ned searched — found Shotgun"
    - Trade: "Amy traded Crowbar to Josh for Pistol"
    - Door: "Wanda opened door to z_1_2"
    - Skill: "Josh chose Sprint skill"
  - **Zombie Phase**: Zombie actions summarized
    - "3 Walkers attacked Amy (1 wound)"
    - "2 Runners moved toward z_3_1"
    - "1 Brute broke door at z_2_0"
  - **Spawn Phase**: Numbered spawn results
    - "Spawn 1 (z_0_2): 2 Walkers"
    - "Spawn 2 (z_5_4): 1 Runner, 1 Brute"

**Implementation approach:**
- `GameHUD.ts` — Make the turn number in the top bar clickable (`data-action="open-history"`)
- Create a history rendering function that groups `state.history` entries by turn
- Use `EventEntry` component patterns for individual action entries
- Use `ZombieBadge` for spawn summaries
- Render in a `modalManager.open({ size: 'lg', title: 'Game History' })` modal
- History entries need better data: current `state.history` stores raw action payloads — the rendering function will need to hydrate them with survivor names, zone IDs, dice results, etc.

---

### What Needs Attention
1. **11 native JS dialog calls** — 3 `confirm()` and 2 `prompt()` in core game UI (PickupUI, LobbyUI), 6 `alert()` + 1 `confirm()` + 1 `prompt()` in MapEditor
2. **10 inline styles** using token values should become CSS classes
3. **Hardcoded colors in CSS** — ~5 `#fff` and ~15 `rgba()` values in component CSS files not using tokens
4. **48+ hardcoded PIXI colors** in renderer should move to a Board Theme config
5. **2 hardcoded hex colors** in MapEditor validation panel
6. **PickupUI/TradeUI** aren't using ModalManager (they manage their own overlay visibility, lack focus trap/ARIA)
7. **Hardcoded JS timeouts** coupled to CSS transition durations (ModalManager, NotificationManager)
8. **showMessage wrapper** could be removed in favor of direct notificationManager usage
9. **Event listener cleanup** on re-render (PickupUI, TradeUI drag handlers)
10. **Accessibility** — drag-and-drop keyboard alternatives, ARIA roles on lists/progress bars
11. **Bottom-sheet gesture** — drag handle is visual only, no JS dismiss behavior
12. **Weapon buttons / backpack FAB / class select buttons** are raw HTML, not using Button component
13. **MapEditor entirely unmigrated** — ~20 hardcoded colors, raw createElement, no component system
14. **6 console.log calls** in client code should be gated or removed
15. **LobbyUI:87** has inline flex style that could use existing `.flex-center` utility
16. **Zombie board circles** need type initials (W/R/B/A) — currently indistinguishable without color
17. **Spawn points** need skull icon + numbering on board and in event log
18. **Noise tokens** are plain yellow circles — need sound/alert icon
19. **Search indicators** are tiny white dots — need Lucide search icon, larger
20. **Tooltip component** needed for hover info on players, zombies, objectives
21. **Turn history modal** needed — click "Turn #" to browse full action/spawn log by turn
22. **Rename Fatty to Brute** across all zombie type references

### Rulebook Cross-Reference Notes (from REVIEW.md)
The rulebook cross-reference identified several issues that affect the UI:
- **Abomination tooltip** should say "Can only be killed by Damage 3+ weapons or Molotov" (not Molotov-only)
- **Zombie type names**: Rulebook uses "Brute" not "Fatty" — rename needed across all UI references
- **Spawn numbering**: Rulebook specifies Starting Spawn Zone goes first, then clockwise — this order should be reflected in the numbered spawn display
- **Targeting Priority** display (if shown in tooltips/combat log): Priority 1 = Brute/Abomination, 2 = Walker, 3 = Runner
