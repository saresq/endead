# Visual Skin Specification

## Purpose

Define the pulp-comic design tokens and their use across the app: palette, type, surface treatment, danger accent, board theme mirror, legibility (contrast, 44px targets, reduced motion), font budget, and removal of the earlier field-manual styles.

## Requirements

### Requirement: Tokens are the single source of the skin
`src/styles/tokens.css` SHALL define every colour, font family, radius, border width and shadow used by the skin, using semantic role names (page, paper, ink, text, accent, highlight, status, player, zombie, danger). Component, base, layout and utility CSS SHALL reference these tokens and SHALL NOT contain colour literals (`#hex`, `rgb()`, `rgba()`, `hsl()`), except `transparent`, `currentColor` and colours inside `@media (forced-colors)` blocks. The field-manual role names (`--bg-*`, `--olive-*`, `--rust-*`, `--amber-*`, `--bone-*`), the deprecated alias shim (`--surface-*`, `--accent-bright`, `--accent-hover`, `--text-primary`, `--text-secondary`) and the texture tokens (`--grain-*`, `--rust-url`, `--hazard-tape-bg`, `--menu-scanlines`, `--hud-scanline-*`) SHALL NOT exist.

#### Scenario: No colour literals in component CSS
- **WHEN** `src/styles/components/*.css`, `base.css`, `layout.css` and `utilities.css` are searched for `#[0-9a-f]{3,8}`, `rgb(`, `rgba(` and `hsl(`
- **THEN** no match is found outside `forced-colors` blocks

#### Scenario: Old token names gone
- **WHEN** `src/` is searched for `--bone-`, `--olive-`, `--amber-`, `--rust-`, `--bg-0` or `--grain-`
- **THEN** no match is found

#### Scenario: Re-tinting from one file
- **WHEN** a developer changes `--highlight` in `tokens.css`
- **THEN** every highlighted state in menu, lobby, HUD and modals changes with it

### Requirement: Pulp-comic surfaces
Menu, lobby, character dossier, HUD panels (top bar, rails, sheet, latest-event card, action buttons), modals, toasts, tooltips, item cards, trade and game-over screens SHALL render as paper panels: `--paper` background, `--text` ink-coloured text, a solid `--ink` outline of 2px (3px for modals and primary buttons) and a hard, unblurred `--ink` offset shadow. The page behind menu and lobby SHALL be `--page` (dark ink) with at most one flat halftone dot pattern. Panels SHALL NOT use grain or noise overlays, scanlines, vignettes, rust stains, hazard-tape stripes, corner brackets, chamfered `clip-path` corners or glow shadows.

#### Scenario: Modal on a phone
- **WHEN** the backpack modal opens on a phone
- **THEN** it shows a cream panel with black text, a thick black outline and an offset black shadow over the dark board

#### Scenario: No field-manual decoration
- **WHEN** the menu, lobby and in-game HUD are inspected
- **THEN** no element has a scanline, grain, hazard-tape, corner-bracket or chamfer decoration

### Requirement: Accent and state colours
Primary actions and destructive actions SHALL use `--accent` (comic red) fills with `--paper` text. Selected, active and "your turn" states SHALL use `--highlight` (comic yellow) fills or outlines with `--ink` text. Success and info SHALL use `--success` and `--info`. Disabled controls SHALL be distinguishable without colour alone (reduced opacity or dashed outline) and keep readable text. The current-turn avatar chip ring and the active squad plate SHALL use `--highlight`.

#### Scenario: Start button in the lobby
- **WHEN** the host sees the lobby
- **THEN** `Empezar` is a red button with cream text and an ink outline

#### Scenario: Active survivor
- **WHEN** it is Ana's turn
- **THEN** Ana's avatar chip ring and squad plate are marked in yellow

#### Scenario: Unavailable action
- **WHEN** an action button is unavailable
- **THEN** it looks disabled without relying on hue alone and its label stays legible

### Requirement: Legibility
Body text and icons SHALL meet WCAG AA contrast (4.5:1 for text under 18.66px bold / 24px regular, 3:1 for larger text and non-text indicators) against the surface they sit on, in every token pair the skin uses. Coloured text (`--accent-text`, `--success`, `--info`) SHALL only sit on `--paper` or `--paper-2`; `--paper-3` (inputs, sunken wells) SHALL carry `--text` or `--text-muted` only. Text over `--page` or the board SHALL use `--paper` or `--highlight`. On coarse pointers interactive controls SHALL keep a hit area of at least 44x44px and text inputs a font size of at least 16px.

#### Scenario: Muted label on an input well
- **WHEN** a muted label sits on `--paper-3`
- **THEN** its contrast ratio is at least 4.5:1

#### Scenario: Bright light on a phone
- **WHEN** the HUD sheet is read on a phone outdoors
- **THEN** all text is dark ink on cream or cream on red, with no thin amber-on-dark text

#### Scenario: Touch targets unchanged
- **WHEN** the skin ships
- **THEN** every control that met 44x44px on coarse pointers before still meets it

### Requirement: Font budget
The app SHALL load exactly three web font families: `Bangers` as the display face (titles at 18px and up, board cues), `Satoshi` as the label face (caps labels, buttons, chips) and `Geist` as the body face (all other text). Bangers and Geist SHALL load from Google Fonts; Satoshi SHALL be self-hosted from `public/fonts`. `--font-mono` and `--font-hud` SHALL resolve to the body face, and numeric readouts SHALL use tabular figures. Every font stack SHALL end in a system fallback. No rendered text SHALL be smaller than 12px.

#### Scenario: Network requests on first load
- **WHEN** the menu loads with an empty cache
- **THEN** the only font families requested from Google Fonts are Bangers and Geist, and Satoshi loads from `/fonts/Satoshi-Variable.woff2`

#### Scenario: Fonts blocked
- **WHEN** Google Fonts fails to load
- **THEN** the UI renders in the system fallback fonts with no missing text

### Requirement: Danger level accent
The current danger level SHALL be shown through a single token `--dl-accent` set by `[data-danger]` on the root element (blue, yellow, orange, red; neutral ink when unset). It SHALL colour the top bar's bottom edge and the danger chip only. Danger level SHALL NOT change page, panel or text colours and SHALL NOT start pulse, flicker, scanline, vignette or rust effects.

#### Scenario: Danger reaches red
- **WHEN** the danger level changes from orange to red
- **THEN** the top bar edge and danger chip turn red and nothing else in the HUD changes colour

### Requirement: Board theme mirrors the palette
`src/client/config/BoardTheme.ts` SHALL hold every colour the PIXI board uses, with a comment naming the matching CSS token. `PixiBoardRenderer.ts` and `AnimationController.ts` SHALL NOT contain colour literals. The board SHALL use: `--page` background and ink walls; `--highlight` fill with ink stroke for valid and pending moves; `--accent` wash for attack targets; `--highlight` noise and objective markers with ink outlines; `--success` open doors and `--danger-orange` closed doors; survivor tokens with a 3px ink outline, a `--highlight` active-turn ring and an `--accent` wound ring; zombie fallback colours equal to the `--zombie-*` tokens; cue text in the display face in `--success`, `--paper`, `--accent`, `--danger-orange` and `--highlight` with an ink stroke. Player identity colours in `PlayerIdentities.ts` SHALL be unchanged and `--player-N` tokens SHALL equal them.

#### Scenario: Selecting a move
- **WHEN** Ana selects Move
- **THEN** reachable zones show a yellow wash with an ink outline

#### Scenario: Wounded survivor on the board
- **WHEN** Ana's survivor has a wound and it is her turn
- **THEN** her token shows the ink outline, the yellow turn ring and the red wound ring

#### Scenario: No stray colours in the renderer
- **WHEN** `PixiBoardRenderer.ts` and `AnimationController.ts` are searched for `0x[0-9a-fA-F]{6}`
- **THEN** no match is found

### Requirement: Reduced motion and restrained animation
The skin SHALL NOT add looping animations. Existing looping skin animations (danger pulses, flicker, scan, blink caret, critical strobe) SHALL be removed; functional animations from earlier stages (die roll-in, board cues, sheet transitions, toasts) SHALL keep working and keep honouring `prefers-reduced-motion`.

#### Scenario: Reduced motion
- **WHEN** the OS requests reduced motion
- **THEN** no skin element animates and die faces still appear

### Requirement: Dead and field-manual styles removed
The stylesheet SHALL NOT contain `.hud-log` rules (the `.hud-logbtn` button stays), `.game-shell` rules, `fm-hazard-tape*`, `fm-brackets*`, `fm-panel--flush`, the `.scanlines`, `.bevel-corner`, `.hud-readout` and `.dl-glow-panel` base classes, or the rust-stain and grain overlay rules. A class SHALL be deleted only when neither a literal nor a template-string prefix (`fm-statcell--${...}`) references it in `src/client`, `src/main.ts` or `index.html`. Total line count of `src/styles/**/*.css` SHALL be below the 11,348-line baseline.

#### Scenario: Purged selectors
- **WHEN** `src/styles` is searched for `.hud-log ` , `.hud-log__`, `.game-shell` and `fm-hazard-tape`
- **THEN** no match is found

#### Scenario: CSS shrinks
- **WHEN** `wc -l src/styles/*.css src/styles/components/*.css` runs after the change
- **THEN** the total is below 11,348

### Requirement: Visual-only change
The change SHALL NOT alter markup structure, class names still in use, layout dimensions and breakpoints, copy, event handling or game state. Size tokens (`--hud-*-height`, `--hud-*-width`, `--token-size-*`, `--avatar-size-*`, spacing, `--hit`) SHALL keep their values. Existing unit tests SHALL pass unchanged.

#### Scenario: Layout unchanged
- **WHEN** the sheet, rail and side layouts are compared before and after at 390x844, 844x390 and 1440x900
- **THEN** panels, buttons and the board occupy the same boxes; only colours, fonts, borders and shadows differ

#### Scenario: Tests
- **WHEN** `npm test` runs
- **THEN** all tests pass without edits
