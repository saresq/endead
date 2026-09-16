## Why

Players miss what just happened. The event feed shows only the latest action, auto-dismisses after 3s (taking the Lucky reroll button with it), and full history is hidden behind the Turn chip modal, which groups by player turn but labels groups "Turn N". Zombie-phase wounds are applied with no record at all. Whose turn it is only shows as small text in the top bar, so on a phone at sheet peek a player cannot tell if they are up. This is stage 2 of 4 of the UI rework (stage 1 `board-camera-and-mobile-shell` is done).

## What Changes

- **Latest-event card** replaces the timed feed: it stays until the next event or until dismissed, shows dice as real die faces (pips, short roll-in on arrival) with hits highlighted against the real threshold, and opens the log on tap. No countdown bar.
- **Board cues**: short floating text over the board for attack results (`2 HITS` / `MISS`), survivor wounds (`-1`), spawns (`+3`) and door opens.
- **Event log**: the history modal becomes the log, opened from a Log button in the top bar on every layout (rail, sheet, side) and from the latest-event card. Newest first, grouped by round with a line per player turn, same entry renderer as the card. An unread dot shows when new entries arrived since the log was last opened.
- **Zombie-phase record**: the server records wounds dealt by zombie attacks, so they appear in the card and the log on the entry of whichever action ran the zombie phase (End Turn, or the last action of a turn that ran out of actions).
- **Turn signal**: a turn line in the sheet header (visible at peek) and the rail operative card: `YOUR TURN · N AP`, `WAITING FOR <name>` or `ZOMBIE PHASE`. When the local player's turn starts (including a new round that starts with them): a short toast and a `●` prefix on the document title while the tab is hidden.
- **Lucky reroll**: stays in the latest-event card while it shows that attack; the card has no dismiss button while the reroll is available, so the button cannot be lost.
- **Fixes found on the way**: history entries copy a stale `lastAction`/`spawnContext` from earlier actions; dice are highlighted as hits at `>= 4` regardless of the weapon's accuracy; the old history modal labelled rounds as "Turn N".

Out of scope: copy rewrite and i18n (stage 3), colours and skin (stage 4), layout changes from stage 1, sound (no SFX files exist), capping history size.

## Capabilities

### New Capabilities
- `action-feedback`: latest-event card, board cues, dice presentation, Lucky reroll placement, zombie-phase wound record.
- `event-log`: log access on every layout, grouping and ordering, unread indicator, history entry integrity.
- `turn-signal`: your-turn / waiting indicator in sheet and rail, turn-start toast and tab title.

### Modified Capabilities

(none; `mobile-game-shell` layout requirements are unchanged, the sheet header only gains a text line)

## Impact

- `src/client/ui/GameHUD.ts`: feed → latest-event card, remove auto-dismiss timer, Log button with unread dot in top bar, turn line in sheet header and rail op card, history modal → Event Log (`toggleLog`); history entry rendering moves to `EventEntry.ts`.
- `src/client/ui/components/EventEntry.ts`: one renderer for card and log entries (`renderEventEntry`, `renderDie`: pip dice with threshold, rerolls, spawns, zombie wounds).
- New: `src/client/ui/eventLog.ts` (pure helpers: displayable entries, round grouping, board cues).
- `src/client/AnimationController.ts`: `floatText(zoneId, text, tone)`; `PixiBoardRenderer` adds a top `fxLayer`, exposes `zoneCenter` and `cameraScale`; `src/client/config/BoardTheme.ts`: `cue` colours mirroring existing tokens.
- `src/client/KeyboardManager.ts`: `L` toggles the log (listed in `?` help). `src/client/ui/components/icons.ts`: `ScrollText` icon.
- `src/main.ts`: detect new events on state change and trigger board cues, turn-start toast, title prefix.
- `src/services/ActionProcessor.ts`: copy `lastAction`/`spawnContext` into history only when set by the current action; copy `threshold` and zombie wounds.
- `src/services/ZombiePhaseManager.ts`, `src/services/handlers/CombatHandlers.ts`, `src/types/GameState.ts`: `threshold` on attack feedback, `zombieWounds` record.
- `src/styles/components/hud.css`: card, pip dice (replacing `.event-die`/`.history-die`), log groups, log button dot, turn line (existing tokens only); sheet pre-measure peek offset 76px → 90px.
- Tests: `src/services/__tests__/HistoryIntegrity.test.ts` for history integrity and zombie wound record; `src/client/__tests__/eventLog.test.ts` (filtering, grouping, board cues) and `EventEntry.test.ts` (entry and die rendering).
- No new dependencies. Client and server deploy together (`deploy.sh endead`).
