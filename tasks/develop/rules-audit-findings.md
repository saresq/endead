# Rules Audit — Findings To Address

Audit against `RULEBOOK.md` and `.claude/skills/zombicide-rules/SKILL.md`.
Citations use `file:line`.

**Excluded by design decision (do NOT fix):**
Spawn zone ordering is set by map author placement (`spawnZoneIds`). See notes
in `RULEBOOK.md` §9 Step 2 and `SKILL.md` Step 2 Spawn. **Never change unless
explicitly asked.**

---

## Major — Missing Mechanics

### M3. Missing characters (6 of 12)
- **Have:** Wanda, Ned, Elle, Amy, Josh, Doug.
- **Missing:** Lili, Tiger Sam (Kid), Odin, Bunny G (Kid), Lou, Ostara.
- **Cross-ref:** Also tracked in `TASKS.md` for Kid survivors.

### M4. Kid survivor type not modeled
- **Problem:** No `survivorType: CLASSIC | KID` field, all survivors use
  maxHealth=3.
- **Rule:** Kids start with maxHealth=2 and may use Slippery once per Turn
  with a single Move Action, regardless of skill tree.
- **Cross-ref:** `TASKS.md` — "Add Kid Survivors".

---

## Minor — Design / UX

### U1. Non-standard or expansion-only skills present
- **Where:** `src/config/SkillRegistry.ts`
- **Items:** `hold_your_nose`, `hit_and_run`, `is_that_all_youve_got`,
  `lifesaver`, `bloodlust_melee`, `matching_set`, `low_profile`, `medic`,
  `reaper_combat/melee` (see C2), `barbarian`, `ambidextrous`,
  `swordmaster`.
- **Decision (2026-04-20):** 1:1 core-box fidelity is the goal.
  `reaper_combat` and `reaper_melee` **removed** — they're not in the Z2E
  core box (Washington Z.C. / promo content). Other expansion skills on
  this list stay pending review; keep if already referenced in a
  character's skill tree, split out into an expansion registry otherwise.

---

## Verified Working (spot checks, no action needed)

- Attacks-then-moves ordering, Runner 2nd actions
  (`ZombiePhaseManager.ts:73-117`)
- Abomination Fest vs. Standard modes
  (`ZombiePhaseManager.ts:384-398`)
- Pool exhaustion → extra activation
  (`ZombiePhaseManager.ts:401-412`)
- Brute Dmg 1 immunity, Abom Dmg 3+, Molotov auto-kill
  (`CombatHandlers.ts:321-323, 76-142`)
- Dual-wield identical-weapon check + 2 separate rolls
- Point-Blank / Sniper override for FF & target choice
- Aaahh!! trap spawns Walker on search (`ItemHandlers.ts:82-85`)
- 2+ accuracy floor (`CombatHandlers.ts:195`)
- Noise from any noisy Action = 1 token max
- 45-card standard Equipment deck matches rulebook composition

---

## Review Bugfixes (2026-04-20)

Surfaced during the uncommitted-diff review. All land **before** SwarmComms Step 1 so we migrate a clean baseline.

### B1. `pendingFriendlyFire` must block turn transition
- **Where:** `src/services/TurnManager.ts:128-174` (`checkEndTurn`).
- **Fix:** treat `pendingFriendlyFire` the same as `drawnCard` / `drawnCardsQueue` / `activeTrade` — block both the active-player wrap and the Zombie Phase transition until FF is assigned.
- **Rule:** Friendly Fire must be assigned before any other action proceeds. Without this guard, an AP-exhausting ranged attack races the phase transition and the game becomes unrecoverable.

### B2. Lucky reroll strips `_attackIsMelee` before AP deduction
- **Where:** `src/services/handlers/CombatHandlers.ts:717-722`.
- **Fix:** move the `delete reran._attackIsMelee` to **after** `deductAPWithFreeCheck` (or drop it entirely — the flag is also scrubbed downstream).
- **Rule:** Lucky re-rolls dice within the same Action; AP/free-pool accounting must see the original attack-type hint so `tryMelee` / `tryRanged` can consume the correct free-action credit.

### B3. Ranged LOS hard-requires `zoneGeometry.zoneCells`
- **Where:** `src/services/handlers/handlerUtils.ts:197-227`.
- **Fix:** validate `zoneGeometry.zoneCells` presence at **map-load time** (reject the map with a clear error if absent). No runtime fallback; streets need orthogonal coordinates, a BFS-over-connections fallback silently corrupts LOS.
- **Rule:** Z2E LOS is strictly orthogonal on streets, opening-based in buildings. BFS over the zone graph isn't equivalent.

### B4. Dual-wield reload flags only one weapon
- **Where:** `src/services/handlers/CombatHandlers.ts:479-483`.
- **Fix:** during dual-wield, track both weapon `id`s and flip `reloaded = false` on each.
- **Rule:** Reload is per-weapon; both Sawed-Offs fire and both are spent.

### B5. Reloadable cards re-enter the deck as spent
- **Where:** discard paths in `handlerUtils.ts:40-48` and any other `equipmentDiscard.push(card)` site (survivor death, trade drop, inventory discard).
- **Fix:** reset `reloaded = true` on every discard-to-deck path.
- **Rule:** Equipment deck cards are "clean" when drawn; a newly-drawn Ma's Shotgun is loaded.

### B6. `DoorHandlers.doubleSpawn` skips Rush activation
- **Where:** `src/services/handlers/DoorHandlers.ts:104-111` (`drawAndApply` in `applySpawnDetail`).
- **Fix:** route each card through the same Rush/extra-activation handler used by regular spawns — place, activate if Rush, continue.
- **Rule:** Z2E Step 2 Spawn: Rush card → place zombies → they immediately activate → continue spawning.

### B7. Tough FF reset scope
- **Where it is today:**
  - Consumed at `src/services/handlers/CombatHandlers.ts:44-45`.
  - Reset **once per round** at `src/services/ZombiePhaseManager.ts:557` (End Phase) alongside `toughUsedZombieAttack`.
- **Problem:** round-scoped reset is correct for `toughUsedZombieAttack` (Zombies Attack Step happens once per round) but **wrong** for `toughUsedFriendlyFire` — FF can happen multiple times per round (one per ranged-attack-with-misses), and Tough must absorb the first wound of each.
- **Fix:**
  1. Remove `survivor.toughUsedFriendlyFire = false` from the End-Phase reset at `ZombiePhaseManager.ts:557`; leave `toughUsedZombieAttack` there.
  2. Reset `toughUsedFriendlyFire = false` on **every survivor in the target zone** at the entry of FF resolution — i.e. just before the miss-application loop in `handleAttack`, and again in `handleAssignFriendlyFire` when the pending FF is resolved. Both paths must reset.
- **Rule:** Z2E Tough — "first Wound ignored per Attack Step and per Friendly Fire instance" ([Zombicide Wiki — Tough](https://zombicide.fandom.com/wiki/Tough)).

### B8. `preferredFreePool` type is too wide on attack payloads
- **Where:** `src/services/handlers/handlerUtils.ts:73-119` (attack branch of `deductAPWithFreeCheck`).
- **Fix:** narrow the attack-payload `preferredFreePool` type from `FreePool` to `'combat'|'melee'|'ranged'`. Move/search pools aren't reachable from this branch.

### B9. Red-objective intent made explicit
- **Where:** `src/services/handlers/ObjectiveHandlers.ts:22-28`.
- **Fix:** add a one-line comment stating red spawn zones are always active; `activateNextPhase` is deliberately blue/green only.
- **Rule:** Z2E Step 2 Spawn — only Blue/Green spawn zones gate on Objective activation.

### B10. `epic_aaahh` type shape
- **Where:** `src/config/EquipmentRegistry.ts` — Epic Aaahh!! declares `stats: undefined` with `type: Item`.
- **Fix steps:**
  1. Inspect `EquipmentCard` in `src/types/GameState.ts` — if `stats` is not already optional (`stats?: WeaponStats`), make it optional.
  2. Drop the explicit `stats: undefined` from the `epic_aaahh` literal (just omit the field).
  3. Verify `tsc --noEmit` passes and that the search/Aaahh!! handler (`ItemHandlers.ts:82-85`) tolerates a card with no `stats` field.

### B11. Reaper removal completeness
- **Where:** `src/config/SkillRegistry.ts` — definitions deleted (confirmed).
- **Fix steps:**
  1. `grep -r "reaper_combat\|reaper_melee" src/` — ensure zero references remain (character skill trees, handler branches, UI).
  2. If any character in `CharacterRegistry.ts` referenced Reaper, pick a replacement core-box skill (e.g. `plus_1_damage_melee`, `bloodlust_melee`) per that character's published skill tree and flag the change in the character's entry.
- **Rule:** Reaper is not in Z2E core box; this is the U1 cleanup.

### B12. `GameState.seed` leaks to clients
- **Where:** broadcast pipeline — `src/server/server.ts:276, 280` include the full `GameState` (seed in tuple form) in outbound `STATE_UPDATE`.
- **Problem:** client with seed can replay `Rng.from(seed).d6()` and peek future dice — 3-line cheat. This is a **security leak**, not just a cleanup.
- **Fix:**
  1. Add a `redactForClient(state)` helper that deep-clones outbound state minus `seed` (and any other server-only fields — audit: `_attackIsMelee`, `_extraAPCost`).
  2. Every server→client payload (current `STATE_UPDATE` / `STATE_PATCH`, future `SNAPSHOT` and `EVENTS`) goes through this helper.
  3. Tests: add a regression test that asserts no broadcast message contains a `seed` key.
- **Cross-ref:** SwarmComms §0, §6 — promoted to a hard blocker on SwarmComms Step 4.

---

## Suggested Order Of Attack

1. **Review Bugfixes (B1–B10)** — land before SwarmComms Step 1.
2. **M3/M4 (characters, Kids)** — content-heavy.
3. **U1** — polish / scope decision (partially resolved: Reaper removed).
