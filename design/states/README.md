# Lobby / Login state mockups

Static reference frames for follow-up [#06 Lobby empty / waiting / error
states](../../handoff/review-followups/06-lobby-empty-states.md). Wave 3
deliverable. Each file is a standalone HTML page that imports the live
`src/styles/` CSS so the mockup renders at parity with production chrome.

These are **design only** — no live wiring. Wave 4 picks up the actual
`LobbyUI.ts` / `MenuUI.ts` plumbing from these references.

## Frames

| File | State | Live target (Wave 4) |
|------|-------|----------------------|
| [`waiting.html`](./waiting.html) | Solo player waiting; kicker `WAITING FOR OPERATIVES · 1/6`; room-ID chip pulses rust to read as "share this code" | `src/client/ui/LobbyUI.ts` (`renderBriefingPanel` + `renderSquadPanel`) |
| [`room-not-found.html`](./room-not-found.html) | Login surface with rust-error input border, kicker `// ROOM NOT FOUND`, JOIN button shakes once on submission | `src/client/ui/MenuUI.ts` (room-id field + `infoMessage` strip) |
| [`host-left.html`](./host-left.html) | Rust banner above the briefing panel: `HOST DISCONNECTED · PROMOTING…` with a 3-second countdown | `src/client/ui/LobbyUI.ts` (new banner above stack) |
| [`connection-lost.html`](./connection-lost.html) | Full-panel scrim over the dimmed lobby with bracketed `// CONNECTION LOST` and a `RECONNECT` outline button | `src/client/ui/LobbyUI.ts` (websocket-drop overlay) |

## Conventions

- Canonical tokens only — `--bg-*`, `--olive-*`, `--rust-*`, `--amber-*`,
  `--bone-*`, plus the semantic alpha tints already in `tokens.css`. No new
  colors introduced.
- Reuses live primitives via `<link>` imports of `src/styles/tokens.css`,
  `utilities.css`, and the relevant component CSS. Anything mockup-specific
  (rust pulse, JOIN shake, scrim chrome) is scoped inside the file's own
  `<style>` block and labelled in comments — Wave 4 will decide which of
  those graduate into `lobby.css` / `menu.css`.
- All animations are compositor-friendly (`transform`, `opacity`,
  `box-shadow` at small sizes) and gated on `prefers-reduced-motion: reduce`.
- Hierarchy: degraded states never look like errors-as-features. Rust is
  used for the corrective surfaces; the underlying lobby remains visible
  but dimmed under the connection-lost scrim.

## Viewing locally

These reference imports use relative paths. Open them through any local
static server rooted at the repo so the `../../src/styles/` paths resolve:

```bash
# from the repo root
npx http-server -p 4173 .
# then visit http://localhost:4173/design/states/waiting.html
```

Opening directly with `file://` works for the layout but the Google Fonts
preconnect won't hit (frames will fall back to the system stencil/mono
families).

## Wave 4 hand-off notes

- The rust pulse, JOIN shake, host-left banner, and full-panel scrim are
  scoped inside each frame today. When Wave 4 wires the live components,
  promote the keyframes + the `.lobby-banner` / `.lobby-scrim` /
  `.fm-input--error` / `.fm-btn--shake` / `.fm-btn--reconnect` rules
  into `lobby.css` (or `menu.css` for the input/button error states) so
  they live alongside their siblings.
- Countdown digit on `host-left.html` is a static `3` — Wave 4 should
  drive it from a 3000 ms timer that decrements once per second.
- `aria-live="polite"` on the host-left banner and `role="alertdialog"`
  on the connection-lost scrim are intentional; keep both when wiring.
