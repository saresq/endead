# Endead — Design System Tokens

Single source of truth: `src/styles/tokens.css`.

The skin is **pulp comic**: aged-newsprint paper panels with black ink text,
solid ink outlines and a hard, unblurred ink offset shadow, floating on a dark
ink page. The paper is deliberately *not* fresh cream — it is the same 43° hue
at half the saturation and ten points darker, so a full-width panel does not
glare against the page.
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
2. **Coloured text only on `--paper` or `--paper-2`.** `--paper-3` (inputs,
   wells, empty slots) carries `--text` or `--text-muted` only.
3. **Text over `--page` or the board** uses `--paper` or `--highlight`,
   and keeps an ink outline so it reads over tile art.
   Text on an `--accent` or `--ink` *fill* uses `--text-inverse`, which is
   lighter than `--paper` so cream on red still clears 4.5:1.
4. **No decoration layers.** No grain, noise, scanlines, vignettes, rust
   stains, hazard tape, corner brackets, chamfer `clip-path`s or glow shadows.
5. **No looping skin animation.** Functional motion only (die roll-in, board
   cues, sheet transitions, toasts), and it honours `prefers-reduced-motion`.

## Palette

| Token | Role |
|---|---|
| `--page`, `--page-2` | dark ink ground: menu, lobby, board, scrim base |
| `--paper`, `--paper-2`, `--paper-3` | panels/cards, raised rows and hover, inputs and wells |
| `--ink` | outlines, shadows, text on yellow |
| `--text`, `--text-2`, `--text-muted` | body, secondary, muted text on paper |
| `--text-on-page` | text over the page or the board |
| `--text-inverse` | text on `--accent` / `--ink` fills |
| `--primary`, `--primary-text`, `--primary-soft` | petrol fill (Create room, Start game, End turn, outline buttons), petrol text on paper, petrol tinted row |
| `--accent`, `--accent-text`, `--accent-soft` | red fill, red text on paper, red tinted row — destructive and harm only |
| `--highlight`, `--highlight-soft` | selected / active / your turn, and its tinted row |
| `--success`, `--info`, `--warning`, `--danger`, `--danger-orange` (+ `-soft`) | status |
| `--line`, `--line-strong` | hairlines and dividers |
| `--scrim` | modal and overlay backdrop |
| `--player-1..6` (+ `-soft`) | player identity; equal to `PlayerIdentities.ts` |
| `--zombie-*` (+ `-soft`) | zombie types; equal to `BoardTheme.ts` and `ZombieTypeConfig.ts` |

Every pair the skin uses clears WCAG AA (4.5:1 for body text, 3:1 for large
text and non-text indicators). `--accent` is `#c7241c` rather than a deeper
red so a red fill on the dark page still clears 3:1.

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

Three web families, loaded from Google Fonts in `index.html`. Each has one job:

- `--font-display` — **Bangers** (one weight). **18px and up only**: the
  wordmark, modal and screen titles, the room code, the game-over verdict.
  Its irregular comic contours smear into mush below that, which is why it is
  no longer the face for labels. Do not add `font-weight` to it.
- `--font-ui` — **Oswald** (400/500/600/700). Every caps label, button, chip,
  badge, kicker and readout heading, 9–16px. Tall x-height and open apertures,
  so a 9px tracked-out label still reads.
- `--font-body` — **Barlow Condensed** (400/500/600/700). Running text, item
  stats, values, inputs.

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
