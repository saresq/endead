# Breakpoint reference mockups — md: 768px tablet coverage

Frozen design references for the gap between mobile (≤480px) and laptop
(≥1024px). These files are **DESIGN ONLY** — they preview the tablet layout
and are not loaded by the live app.

The follow-up that owns this work is
`handoff/review-followups/07-mid-breakpoint-coverage.md` (severity MAJ,
~3 hr). The mockups here cover the design portion. The live wire-in is
Wave 4 work and intentionally not included in `src/styles/`.

## Frames

| File                   | Surface | Viewport | Behavior at md (768 ≤ w < 1024) |
|------------------------|---------|----------|---------------------------------|
| `lobby-tablet.html`    | Lobby   | 768 × ≥1024 | Two-column grid: briefing + roster + squad list (left) and dossier + loadout + progression + RoE + footer (right). Operative roster expands from 3-up to 4-up. Mobile (<768) and laptop (≥960 inner cap) stay unchanged. |
| `hud-tablet.html`      | HUD     | 768 × 1024  | Squad rail collapses to a horizontal pill strip directly below the topbar (overflow-x scroll). Body splits 60/40 between map and event feed. Action grid renders 6-up in a single row. |

The breakpoints stay aligned with the existing scale:

- `<480px` — mobile stack (no change)
- `≥480px` — mobile-large polish only (no layout change)
- `≥768px` — tablet layout introduced (NEW)
- `≥1024px` — laptop three-column / lobby single-column-wider (no change)
- `≥1280px` — desktop wide (no change)

## Wave 4 wire-in targets (live)

When promoting these frames to live CSS, the canonical files are:

### `lobby-tablet.html` →

- `src/styles/components/lobby.css`
  - Add `@media (min-width: 768px) and (max-width: 1023px)` block near
    the existing `@media (min-width: 960px)` rule.
  - Promote `.lobby__stack` to a 2-column CSS grid. Either introduce a
    `.lobby__columns` wrapper around the panels OR keep `.lobby__stack`
    and assign panels to columns by class (`.lobby-panel--briefing`,
    `--squad`, `--player`, `--roster` → column 1; `--operative`, `--roe`,
    `--footer` → column 2).
  - Promote `.lobby-roster` to `repeat(4, 1fr)` at md.
  - Optionally make `.lobby-panel--footer` `position: sticky; bottom: 12px;`
    so the primary CTA stays visible while the dossier column scrolls.
- No change required in `LobbyUI.ts` if the column-by-class approach is
  taken.

### `hud-tablet.html` →

- `src/styles/components/hud.css`
  - Add `@media (min-width: 768px) and (max-width: 1023px)` block. The
    existing mobile `@media (max-width: 767px)` rule continues to handle
    sub-768 layouts.
  - Override `#game-hud` `grid-template-rows`, `grid-template-columns`,
    and `grid-template-areas` to the 4-row / 2-column shape used in the
    mockup (topbar, rail-l strip, center+rail-r split, actions row).
  - Override `.hud-rail--left` to render a horizontal pill list with
    `display: flex; flex-direction: row;` and `overflow-x: auto`.
  - Override `.hud-actions__grid` to `grid-template-columns: repeat(6, 1fr);`
    at md.
- `src/styles/components/game-layout.css`
  - No structural change required — the `.game-layout` shell already
    stacks topbar/canvas/bottom and the canvas remains the full backdrop.
    Only `hud.css` needs the md override.
- `src/client/ui/GameHUD.ts` and `src/client/ui/components/SquadPlate.ts`
  - May want to opt the squad plate into a `--compact` variant when the
    md media query matches, since the horizontal strip benefits from the
    smaller plate variant that already exists in
    `field-manual.css` (`.fm-squadplate--compact`).
  - No structural rendering change is strictly required — the live HTML
    is reused as-is.

## Constraints honored

- Canonical tokens only (`--bg-*`, `--olive-*`, `--rust-*`, `--amber-*`,
  `--bone-*`, `--rank-*`, `--ready`, `--accent-muted`, `--hazard-*`).
- No new colors introduced.
- No edits to `design-review.html` (frozen artifact).
- No edits to live `src/styles/` — the `md: 768px` rules are inline in
  each mockup so Wave 4 can promote them deliberately.
- Reuses live primitives by linking `src/styles/tokens.css`,
  `base.css`, `utilities.css`, `layout.css`, and the relevant component
  CSS via relative paths.
