## Context

The skin is the "Field Manual" direction: `tokens.css` (629 lines) defines an olive/rust/amber/bone ramp on near-black, a deprecated alias shim with zero references, grain/rust/hazard/scanline textures and a `[data-danger]` block that retints 25 `--dl-*` tokens per level (surfaces, glows, vignette, rust bleed, flicker, pulse). Component CSS (11,348 lines total under `src/styles/`) consumes the role names (`--amber-400` ×124, `--olive-700` ×88, `--bone-100` ×72, ...) but also carries ~446 `rgba()` literals tuned for dark surfaces, 29 chamfer `clip-path`s, 37 scanline rules and 25 `fm-brackets` uses.

The PIXI board cannot read CSS variables. `BoardTheme.ts` is the canvas mirror, but it has drifted (its hexes no longer match `tokens.css`) and `PixiBoardRenderer.ts` still inlines 23 hex literals (search/objective markers, survivor glow, wound outline, text strokes). Board tile art is textures; the theme colours only overlays, markers, strokes and fallbacks.

Fonts load from Google Fonts: Oswald (display), Barlow Condensed (body), JetBrains Mono (92 `--font-mono`/`--font-hud` uses; PIXI labels at `PixiBoardRenderer.ts:1975,1992`).

Stages 1–3 fixed layout, feedback and copy. This stage is colours, type and surfaces only. The user chose paper panels (cream, ink outlines, offset shadow) over dark ink panels.

## Goals / Non-Goals

**Goals:**
- One token file expresses the whole skin; components reference role tokens, not literals.
- Pulp-comic look that stays legible on a phone in sunlight (AA contrast on every pair used).
- Board overlays and markers match the HTML palette.
- Remove the field-manual effects and dead selectors; net CSS shrinks.

**Non-Goals:**
- Layout, spacing, breakpoints, markup, class renames, copy, behaviour.
- New illustrations, icons, sound, theme switching, map editor restyle (it inherits tokens only).
- A general dead-CSS sweep beyond the listed selectors (utility classes like `.gap-4` stay even if unused).

## Decisions

### D1. Rename tokens to semantic roles, then map mechanically

The old names describe the dark theme (`--bone-100` = light text, `--bg-*` = dark). Keeping names and flipping values would leave `color: var(--bone-100)` meaning "dark ink". New palette in `tokens.css`:

| Token | Value | Use |
|---|---|---|
| `--page` | `#1a1614` | menu/lobby page, board background, scrim base |
| `--page-2` | `#2a2320` | raised areas on the page (rare) |
| `--paper` | `#f4ead2` | panels, modals, cards |
| `--paper-2` | `#e9dbb9` | raised/alt rows, hover |
| `--paper-3` | `#dccaa0` | inputs, sunken wells, empty slots |
| `--ink` | `#1a1614` | outlines, shadows, text on yellow |
| `--text` | `var(--ink)` | body text on paper |
| `--text-2` | `#3d342d` | secondary text |
| `--text-muted` | `#5c5046` | muted text, placeholders |
| `--text-on-page` | `var(--paper)` | text on page/board |
| `--text-on-page-muted` | `#b9ab90` | muted text on page |
| `--accent` | `#c01f18` | primary/destructive fills, attack |
| `--accent-text` | `#a31a14` | red text on paper |
| `--highlight` | `#ffcc1a` | selected, active, your turn, noise |
| `--success` | `#256a31` | ready, open door, hits |
| `--info` | `#1f5fa8` | info |
| `--danger-orange` | `#d8661c` | closed doors, spawns (ink text only) |

Contrast checked: ink/paper 15.0, ink/paper-3 11.1, muted/paper 6.5, muted/paper-3 4.8, paper/accent 5.1, accent-text/paper-3 4.8, ink/highlight 11.9, success/paper 5.5, success/paper-2 4.8, info/paper 5.4, info/paper-2 4.7, ink/orange 5.0, text-on-page-muted/page 8.0. Coloured text is not allowed on `--paper-3` (info/paper-3 is 4.0).

Mapping applied per property, not blindly:

| Old | `color:` | `background`/`border`/`fill` |
|---|---|---|
| `--bg-0` | `--text-on-page`* | `--page` |
| `--bg-1`, `--bg-2` | — | `--paper`, `--paper-2` |
| `--bg-3` | — | `--paper-3` |
| `--olive-700`, `--olive-500` | `--text-muted` | `--ink` (borders), `--paper-3` (fills) |
| `--olive-300` | `--text-muted` | `--text-muted` |
| `--bone-100`, `--bone-300`, `--bone-500` | `--text`, `--text-2`, `--text-muted` | `--paper` |
| `--amber-*` | `--accent-text` | `--highlight` |
| `--rust-*`, `--danger*` | `--accent-text` | `--accent` |
| `--ready`, `--success*` | `--success` | `--success` |
| `--hazard` | — | `--highlight` |

\* `--text-inverse` becomes `--paper` for text on red/ink fills and stays `--ink` on yellow. Elements that sit directly on the board or page (floating avatar chips, board-overlay labels, menu title) use `--text-on-page`/`--highlight` and are reviewed by hand.

Alternative considered: keep old names with new values plus a README note. Rejected: every future read of the CSS would be misleading, and the `rgba()` literals must be touched anyway.

### D2. Replace alpha tints with a small set of tokens, delete the rest

On paper, most dark-tuned tints (`rgba(0,0,0,.6)` readouts, amber glows, olive dashed rules) are either decoration or become flat surfaces. Rule for each literal:
- Glow / text-shadow / inset highlight / decorative gradient: delete.
- Tinted surface: nearest of `--paper-2`, `--paper-3`, `--highlight-soft` (`#fff0b3`, selected row), `--accent-soft` (`#f6d3c8`, danger row), `--success-soft` (`#d5e8c9`).
- Divider or hairline: `--line` (`color-mix(in srgb, var(--ink) 25%, transparent)`, defined once in tokens).
- Scrim: `--scrim` (`color-mix(in srgb, var(--page) 80%, transparent)`).
- Player/zombie muted tints: `--player-N-soft`/`--zombie-*-soft` via `color-mix` in tokens.

`color-mix()` is supported in all browsers the game targets (Safari 16.2+, Chrome 111+). It keeps alpha variants derived from one hue instead of hand-kept `rgba` copies.

### D3. Surface treatment through four tokens

`--border: 2px solid var(--ink)`, `--border-heavy: 3px solid var(--ink)`, `--shadow: 3px 3px 0 var(--ink)`, `--shadow-lg: 5px 5px 0 var(--ink)`; `--radius: 6px`, `--radius-sm: 4px`, `--radius-full` kept. Old shadow tokens (`--shadow-sm..xl`, `--shadow-panel`, `--shadow-raised`, `--shadow-glow-*`, `--shadow-cutout`, `--modal-shadow`, `--card-shadow*`) are redefined to these values first so untouched call sites pick up the look, then collapsed in cleanup. Pressed buttons translate by the shadow offset and drop the shadow (transform only, no layout shift).

Borders go from 1–1.5px to 2–3px. `reset.css` sets `box-sizing: border-box`, so outer boxes stay the same size; content shrinks by 1–2px per side. Where a fixed-height element would clip text, reduce its inner padding by the same amount instead of changing its height.

Halftone: one `--halftone` token (`radial-gradient(var(--page-2) 1px, transparent 1.5px) 0 0 / 8px 8px`) used on the menu and lobby page background only.

### D4. Fonts: Bangers + Barlow Condensed

- `--font-display: "Bangers", "Impact", "Arial Narrow", sans-serif` (one weight, 400). Used where `--font-display`/`--font-stencil` are used today: headings, buttons, big numbers.
- `--font-body: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif` (400, 500, 600, 700).
- `--font-mono`, `--font-hud`, `--font-stencil`, `--font-sans` become aliases of body or display so the 92 existing call sites need no edit; `body { font-variant-numeric: tabular-nums }` keeps numbers aligned.
- Bangers is uppercase-styled and slanted; `letter-spacing` on display text drops to `0.02em` (the wide tracking tokens `--letter-spacing-wider/widest` are redefined to `0.04em`/`0.06em`). Tracking reduction offsets Bangers' slightly wider caps versus Oswald, so button labels keep their width.

Alternative: keep Barlow Condensed and switch body to a wider face for readability. Rejected: wider body text risks wrapping in layouts stage 1–3 sized around the condensed face.

PIXI text: board labels use `BOARD_THEME.font.body` (`"Barlow Condensed", Arial, sans-serif`); cues and spawn numbers use `BOARD_THEME.font.display`. If the web font is not ready when a PIXI text is first created it renders in the fallback; cues are created after load, labels are recreated on the next render. No `document.fonts` wait is added (would be behaviour).

### D5. Danger level = one accent token

`tokens.css` keeps `[data-danger="blue|yellow|orange|red"]` blocks with one line each: `--dl-accent`. Default `--dl-accent: var(--ink)`. Every other `--dl-*` token is removed; its ~200 call sites become: surfaces → paper tokens, borders → `--ink`, `--dl-text-readout`/`--dl-hud-tint` → `--text` (or `--accent-text` where it signalled danger), `--dl-topbar-border` and `--dl-status-indicator` → `--dl-accent`, glows/scanlines/vignette/rust/pulse → deleted. Danger colours: blue `--info`, yellow `--highlight`, orange `--danger-orange`, red `--accent`. The danger chip shows `--dl-accent` fill with `--ink` text on yellow/orange and `--paper` text on blue/red (`--dl-accent-text` set alongside).

### D6. Board theme

`BoardTheme.ts` is rewritten with the D1 hexes and gains entries for literals now inlined in `PixiBoardRenderer.ts` (`search`, `objectiveMarker`, `entity.selectionGlow`, `entity.woundStroke`, `label.fill/stroke`, `font`). Values:
- `background`, `wall.color`, all strokes: ink `0x1a1614`.
- `zone.validMove*`/`pendingMove*`: highlight `0xffcc1a` (alpha 0.35 fill, 1.0 stroke) with ink stroke.
- `attack.fillColor`: accent `0xc01f18` at 0.35.
- `door.open` success `0x256a31`, `door.closed` orange `0xd8661c`, plank border ink.
- `noise`, `objective`, `searchable`, `exit`: highlight fill, ink stroke 2px.
- `entity`: ink stroke 3px, `activeTurnRing` highlight, `woundStroke` accent, selection glow paper `0xf4ead2`.
- `spawn`: accent fill, paper number with ink stroke.
- `zombie` fallbacks = `--zombie-*` (walker `0x5f7a3a`, runner `0xd8661c`, brute `0x6b3d8f`, abomination `0x8f1611`); `ZombieTypeConfig.colorNumeric` uses the same values and `--zombie-*` tokens are set to match.
- `cue`: hit success, miss paper, wound accent, spawn orange, info highlight, stroke ink.
- `placeholder`: ink backdrop, paper-3 tiles, highlight labels.

Player identity colours are left alone (players recognise their colour); `--player-N` in `tokens.css` is set to the `PlayerIdentities.ts` hexes, since they currently disagree.

### D7. Purge list and order

Order: tokens first (new names plus temporary aliases from old names to new roles so the app renders mid-way), then file-by-file component migration, then delete the temporary aliases and textures. Delete in the same pass:
- `hud.css` `.hud-log*` block (≈55 lines); `layout.css` `.game-shell*` (≈75 lines).
- `utilities.css`: `fm-hazard-tape*`, `fm-brackets*` (brackets are field-manual decoration; the 25 uses become plain `--border` panels and the helper markup classes stay harmless or are dropped from CSS only), `fm-panel--flush`, `.noise`/`.noise--off`, `fm-diagonal-stripe*`, `fm-panel-dot*`.
- `base.css`: `.scanlines`, `.bevel-corner`, `.hud-readout`, `.dl-glow-panel`, `.panel-inset` if unreferenced, rust-stain `@supports` block, grain body overlay.
- `tokens.css`: alias shim, textures, `--hud-scanline-*`, `--hud-noise-opacity`, `--hud-corner-size`, `--card-wear-opacity`, `--card-corner-clip`, `--modal-corner-inset`, `--menu-grid-color`, `--menu-vignette`, `--vignette-base`, keyframes `dl-*-pulse`, `hud-flicker`, `hud-scan`, `hud-blink-caret`, `critical-strobe` and their uses; `item-drop-in`, `hp-flash` if still unreferenced.

Unused check before each deletion: `grep -rF '<class>' src/client src/main.ts index.html` plus template prefixes (`fm-statcell--${`, `fm-photoslot--${`, `fm-squadplate__pill--${`, `fm-squadplate--rank-${`, `fm-btn--${`). Classes reached only by template prefixes are kept.

### D8. Verification

- Grep checks from the spec (literals, old token names, purged selectors, renderer hex literals).
- `wc -l` against the 11,348 baseline.
- `npm test` and `npx tsc --noEmit`.
- Screenshots with Playwright of menu, lobby, character dossier, game sheet at peek and expanded, rail layout, backpack/trade/log modals, toast, game-over, at 390x844, 844x390, 1440x900, captured before and after; compare element boxes (`getBoundingClientRect` of top bar, sheet, rail, action buttons) for layout drift > 2px.
- Contrast: a small script checks each token pair listed in D1 (not shipped).

## Risks / Trade-offs

- [Big mechanical diff across ~15 CSS files] → migrate one file at a time with temporary aliases keeping the app renderable; screenshot after each group.
- [Bangers metrics differ from Oswald: labels wrap or overflow] → reduced tracking; check the before/after box comparison and fix with `font-size` step down on the specific label, never by changing the box.
- [Thicker borders clip content in fixed-height controls] → border-box keeps outer size; trim padding where text clips.
- [Cream panels over the board hide more of the map visually] → panel sizes are unchanged; board overlays (avatar chips, cues) use ink outlines to stay readable on any tile art.
- [PIXI text created before fonts load uses the fallback] → acceptable; fallback stacks chosen to be close in width.
- [`color-mix()` unsupported on old browsers] → targets are current mobile Safari/Chrome; an unsupported browser loses only tints (declaration dropped), text and panels still render.
- [Removing `--dl-*` surface retints loses the "tension" feel] → deliberate: plain over clever; the top bar edge and chip still signal danger.

## Migration Plan

Client-only CSS/TS change, deployed with `deploy.sh endead`. No state or protocol change; rollback is reverting the commit and redeploying.

## Open Questions

None blocking. Exact hex tweaks may move during screenshot review as long as the D1 contrast pairs still pass.
