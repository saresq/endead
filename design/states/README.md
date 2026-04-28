# Lobby / Login state snapshots

Static snapshots of the live UI at 2026-04-27, regenerated from the
running app. To refresh, run `npm run dev` and re-snapshot through
Playwright (or any browser automation) at the listed viewport, then
overwrite the matching file with the captured DOM.

Each file is a standalone HTML page that imports the live `src/styles/`
CSS via relative `<link>` tags so the snapshot renders at parity with
production. No styles are inlined, no DOM is invented.

## Frames

| File | State | Viewport | Live source |
|------|-------|----------|-------------|
| [`waiting.html`](./waiting.html) | Fresh lobby (1/6 squad), no character chosen, STANDBY status; room-ID chip pulses rust to read as "share this code" | 1280 x 900 | `src/client/ui/LobbyUI.ts` |
| [`room-not-found.html`](./room-not-found.html) | Main menu after a failed JOIN against `9X4Z-77LL`. `// ROOM NOT FOUND` kicker + alert banner + rust-error input border | 1280 x 900 | `src/client/ui/MenuUI.ts` |
| [`host-left.html`](./host-left.html) | Lobby with the host-disconnect banner active. Banner HTML matches `LobbyUI.renderHostLeftBanner()`; countdown shown at 3s | 1280 x 900 | `src/client/ui/LobbyUI.ts` |
| [`connection-lost.html`](./connection-lost.html) | Lobby dimmed (`lobby--dimmed` + `aria-hidden="true"`) under the connection-lost scrim. Meta line uses the `RETRYING HANDSHAKE / DROPPED / NEXT` format produced by `refreshConnectionMeta()` | 1280 x 900 | `src/client/ui/LobbyUI.ts` |

## Conventions

- Canonical tokens only — `--bg-*`, `--olive-*`, `--rust-*`, `--amber-*`,
  `--bone-*`, plus the semantic alpha tints already in `tokens.css`.
- Reuses live primitives via `<link>` imports of `src/styles/tokens.css`,
  `utilities.css`, `field-manual.css`, and the relevant component CSS.
  No styles are duplicated in the snapshot files.
- Data attributes, ARIA attributes, and role attributes match what the
  live renderers emit — the design platform may use them.
- Dynamic content (room IDs, callsigns, countdown values, retry meta)
  uses the literal value present at capture time. Refresh by capturing
  again rather than editing in place.

## Viewing locally

The relative `../../src/styles/` paths resolve through any local server
rooted at the repo. The simplest path is the existing dev server:

```bash
npm run dev
# then visit http://localhost:5173/design/states/waiting.html
```

Opening directly with `file://` works for layout but cross-origin Google
Fonts will fall back to the system stencil/mono families.

## Refresh procedure

1. Start `npm run dev`.
2. Drive the live app to the target state (see the per-file comment at
   the top of each HTML file for the live trigger that produces it).
3. Resize the browser to the target viewport in the table above.
4. Capture the live DOM (typically `document.querySelector('#lobby-ui').outerHTML`
   or `#menu-ui` for the menu surface) plus any host-left banner / scrim
   that the live renderer appends.
5. Replace the body of the matching HTML file with the captured DOM. Keep
   the existing `<head>` scaffold (imports + comment block).
