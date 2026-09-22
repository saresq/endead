# Endead — Design System Tokens

Single source of truth: `src/styles/tokens.css`.

The skin is **pulp comic, dark first**: warm charcoal panels with cream text,
solid black ink outlines and a hard, unblurred ink offset shadow, floating on
a near-black page. The token names still say "paper" (`--paper`, `--paper-2`,
`--paper-3`); they are the charcoal surfaces. Text is cream, never white, so
long sessions don't halate.
Petrol is the affirmative action, comic red is destructive and every kind of
harm (wounds, spawns, the red danger rank), comic yellow is selected / active /
"your turn", green and blue are success and info. Primary and destructive must
never share a fill — that is why `--primary` exists apart from `--accent`.

The PIXI canvas renderer uses a parallel hex-literal table at
`src/client/config/BoardTheme.ts`. CSS vars are unreadable from PIXI, so the
two are hand-kept in sync — the comments in `BoardTheme.ts` reference the
matching CSS token name. When you change a palette anchor in `tokens.css`,
update the corresponding entry in `BoardTheme.ts`.

## Rules

1. **No colour literals outside `tokens.css`.** `base.css`, `layout.css`,
   `utilities.css` and everything under `components/` reference tokens only.
   `transparent`, `currentColor` and colours inside `@media (forced-colors)`
   are the only exceptions.
2. **Text on a surface** is `--text`, `--text-2`, `--text-muted` or a
   coloured text token (`--accent-text`, `--primary-text`, `--success`,
   `--info`); each clears 4.5:1 on all three surfaces.
3. **Text on a bright fill** (`--highlight`, a player colour, a `*-lift`
   board fill) is `--ink`. Text on `--accent`, `--primary` or a `*-strong`
   fill is `--text-inverse`. `--success` / `--info` are light: a filled
   button or badge carrying text uses `--success-strong` / `--info-strong`.
   Text over the board keeps an ink outline so it reads over tile art.
4. **No decoration layers.** No grain, noise, scanlines, vignettes, rust
   stains, hazard tape, corner brackets, chamfer `clip-path`s or glow shadows.
5. **No looping skin animation.** Functional motion only (die roll-in, board
   cues, sheet transitions, toasts), and it honours `prefers-reduced-motion`.

## Palette

| Token | Role |
|---|---|
| `--page`, `--page-2` | near-black ground: menu, lobby, board, scrim base |
| `--paper`, `--paper-2`, `--paper-3` | charcoal panels/cards, raised rows and hover, inputs and wells |
| `--ink` | outlines, shadows, text on yellow and other bright fills |
| `--text`, `--text-2`, `--text-muted` | cream body, secondary, muted text |
| `--text-on-page` | text over the page or the board |
| `--text-inverse` | text on `--accent` / `--primary` / `*-strong` fills |
| `--primary`, `--primary-text`, `--primary-hover`, `--primary-soft` | petrol fill (Create room, Start game, End turn), petrol text, pressed fill, petrol tinted row |
| `--accent`, `--accent-text`, `--accent-hover`, `--accent-soft` | red fill, red text, pressed fill, red tinted row — destructive and harm only |
| `--highlight`, `--highlight-soft` | selected / active / your turn, and its tinted row (carries `--text`) |
| `--success`, `--info` (+ `-strong`, `-soft`), `--warning`, `--danger`, `--danger-orange` | status |
| `--line`, `--line-strong` | hairlines and dividers |
| `--scrim` | modal and overlay backdrop |
| `--player-1..6` (+ `-soft`) | player identity; equal to `PlayerIdentities.ts` |
| `--zombie-*` (+ `-soft`) | zombie types; equal to `BoardTheme.ts` and `ZombieTypeConfig.ts` |

Every pair the skin uses clears WCAG AA (4.5:1 for body text, 3:1 for large
text and non-text indicators). `--accent` (`#bc392a`, a printed brick red) is
kept light enough that a red fill on the dark page still clears 3:1. The
reasoning behind each anchor, in OKLCH, sits beside it in `tokens.css`.

## Surfaces

A paper panel is exactly this:

```css
background: var(--paper);
color: var(--text);
border: var(--border);            /* 2px solid ink; --border-heavy = 3px */
border-radius: var(--radius);     /* 6px; --radius-sm 4px for small chips */
box-shadow: var(--shadow);        /* 3px 3px 0 ink; --shadow-lg for modals */
```

`--border` and `--border-heavy` are **full shorthands**, not widths. When a
rule needs its own colour, compose it from `--border-width` /
`--border-width-heavy`.

A pressed control translates onto its own shadow and drops it — never a
layout-affecting change:

```css
:active { transform: translate(var(--press-offset), var(--press-offset)); box-shadow: none; }
```

`--halftone` is the one texture in the system: a flat dot field used on the
menu and lobby page ground only.

## Type

Three web families. Bangers and Geist load from Google Fonts in `index.html`;
Satoshi is self-hosted (`public/fonts/Satoshi-Variable.woff2`, `@font-face` in
`base.css`). Each has one job:

- `--font-display` — **Bangers** (one weight). **18px and up only**: the
  wordmark, modal and screen titles, the room code, the game-over verdict.
  Its irregular comic contours smear into mush below that, which is why it is
  no longer the face for labels. Do not add `font-weight` to it.
- `--font-ui` — **Satoshi** (variable, 300–900). Every caps label, button,
  chip, badge, kicker and readout heading, 12–16px. Full-width letterforms,
  so caps stay legible at 12px; tracking stays at 0.08em or less.
- `--font-body` — **Geist** (variable, 100–900). Running text, item stats,
  values, inputs. Built for UI at small sizes; nothing goes below 12px.

`--font-stencil` is an alias of `--font-ui`; `--font-sans`, `--font-mono` and
`--font-hud` are aliases of `--font-body`, so existing call sites keep working.
Do not introduce a fourth family. `body` sets `font-variant-numeric:
tabular-nums` so readouts align.

If you reach for `--font-display` on something smaller than 18px, you want
`--font-ui`.

## Danger level

The current danger level is one token, `--dl-accent` (plus `--dl-accent-text`
for the label on it), set by `[data-danger="blue|yellow|orange|red"]` on the
root element and neutral ink when unset. It colours **the top bar's bottom
edge and the danger pill (`.hud-danger`), and nothing else**. Danger level
never changes page, panel or text colours, and never starts an animation.

`--dl-accent-text` is `--text-inverse` on the blue and red fills and `--ink` on
yellow and orange, so the pill's 10px label clears 4.5:1 at every level.

## Animation

- Compositor-friendly only: `transform`, `opacity`, sparingly `clip-path`.
- The global rule in `base.css` neutralises durations under
  `prefers-reduced-motion`; new animations must not bypass it.
- Standard durations live in tokens (`--duration-fast`, `-normal`, `-slow`).
