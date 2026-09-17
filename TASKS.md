# Tasks

Work that is not in an OpenSpec change. Anything with a change owns its own task
list — look there first (`openspec list`, `openspec/changes/`, `openspec/specs/`).

This file exists because deferred decisions used to live only in prose inside a
completed change, so they went quiet. Anything decided against belongs here, with
what would change the answer.

---

## Open

Nothing lives only here. Run `openspec list` for what is in flight.

Rules compliance is tracked in `RULES-REVIEW.md`, which is kept current — fixed
items are removed from it, not ticked, so whatever is still listed there is what
is still open. Do not re-list its items here; they drift.

Rules parked for the expansion pass — wanted, just not yet — live in `TODO.md`.
This file is for what was decided *against*.

---

## Deliberately not doing

Each was considered and declined. Listed so it is not rediscovered as a gap.

### Board keyboard navigation

Moving and attacking on the board by keyboard. The action keys (`S`, `N`, `D`,
`O`, `T`, `E`) work and are specified in `openspec/specs/hud-affordances/`; the
board itself is pointer-only.

**Why not:** needs a focus model over zones — roving focus, a focus ring drawn in
PIXI rather than CSS, and per-zone announcement. Real design work, and nobody has
asked. Deferred by `hud-critical-fixes` and again by `desktop-board-deck`.

**Revisit when:** a player needs it, or an accessibility requirement lands. Worth
knowing this is the item that decides whether someone without a pointer can play
at all — it is declined on cost and demand, not on value.

### Structured history payloads

The server composes history `description`s as Spanish sentences through
`es.log.*`; the client renders them. The alternative is sending structured fields
(spawned counts, item ids) and composing the text client-side.

**Why not:** a wide refactor across every handler with no user-visible change.
The copy is already single-sourced in `src/strings/es/`, which was the actual
problem. Raised as finding 5 while planning `lobby-and-spanish-copy`; its
translation half shipped, this half did not.

**Revisit when:** a second locale is added, or description parsing is needed for
something other than display.

### `forced-colors` / `prefers-contrast`

Windows high-contrast and increased-contrast support.

**Why not:** nobody has asked, and the skin already meets AA on every pair it
uses — `hud-critical-fixes` measured the ones that did not and fixed them.
`openspec/specs/visual-skin/` permits colour literals inside `@media
(forced-colors)` blocks, so adding support later needs no token rework.

**Revisit when:** a player reports it, or the project takes on a contrast
requirement.
