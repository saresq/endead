# Breakpoint snapshots — md: 768 tablet coverage

Static snapshots of the live UI at 2026-04-27 at the md tablet width,
regenerated from the running app. To refresh, run `npm run dev` and
re-snapshot through Playwright at 768 x 1024, then overwrite the
matching file with the captured DOM.

Each file is a standalone HTML page that imports the live `src/styles/`
CSS via relative `<link>` tags so the snapshot renders at parity with
production. No styles are inlined, no DOM is invented.

## Frames

| File | Surface | Viewport | State at capture |
|------|---------|----------|------------------|
| [`lobby-tablet.html`](./lobby-tablet.html) | Lobby | 768 x 1024 | Fresh lobby, host has selected WANDA so the player plate avatar, READY status, the selected roster cell, and the `BEGIN OPERATION · 1/1 READY` primary CTA all populate. |
| [`hud-tablet.html`](./hud-tablet.html) | In-game HUD | 768 x 1024 | Game just started with WANDA active. Turn 01 PLAYER phase, dossier modal closed via Escape. The PIXI canvas in `.hud-map-window` is captured as an empty placeholder so the file renders without PIXI. |

## Live md tablet rules

The md tablet rules captured in these snapshots are owned by the live
component CSS. They are not duplicated into the snapshot files.

### `lobby-tablet.html` ↔ `src/styles/components/lobby.css`

The `@media (min-width: 768px) and (max-width: 1023px)` block (line 1157+)
implements the column-by-class layout the snapshot renders:

- `.lobby-panel--briefing`, `--player`, `--squad`, `--roster` → column 1
- `.lobby-panel--area`, `--roe`, `--footer` → column 2
- `.lobby-roster` becomes `repeat(4, 1fr)` at md
- `.lobby-panel--footer` is `position: sticky; bottom: 12px`

### `hud-tablet.html` ↔ `src/styles/components/hud.css`

The `@media (min-width: 768px) and (max-width: 1023px)` block (line 1018+)
implements:

- `#game-hud` grid: 4 rows / 2 cols with areas
  `topbar topbar / rail-l rail-l / center rail-r / actions actions`
- `.hud-rail--left` collapses to a horizontal pill strip under the topbar
- `.hud-actions__grid` becomes `repeat(6, 1fr)`
- `.hud-actions` is a direct child of `#game-hud` (sibling of the rails),
  matching `GameHUD.buildShell()`

## Conventions

- Canonical tokens only (`--bg-*`, `--olive-*`, `--rust-*`, `--amber-*`,
  `--bone-*`, `--rank-*`, `--ready`, `--accent-muted`, `--hazard-*`).
- Reuses live primitives by linking `src/styles/tokens.css`, `base.css`,
  `utilities.css`, `layout.css`, and the relevant component CSS via
  relative paths. No styles are duplicated in the snapshot files.
- The captured `<html>` attributes (e.g. `class="in-game"`,
  `data-danger="blue"` for the HUD) are preserved.

## Viewing locally

```bash
npm run dev
# then visit
#   http://localhost:5173/design/breakpoints/lobby-tablet.html
#   http://localhost:5173/design/breakpoints/hud-tablet.html
```

## Refresh procedure

1. Start `npm run dev`.
2. Resize the browser to 768 x 1024.
3. Drive the live app to the target state (see the per-file comment at
   the top of each HTML file).
4. Capture the live DOM (`#lobby-ui` for the lobby; `#game-hud` for the
   HUD) and replace the body of the matching HTML file with it. Keep the
   existing `<head>` scaffold (imports + comment block).
