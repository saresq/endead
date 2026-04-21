# Game Logic Bugs — Rules Audit 2026-04-20

Consolidated findings from a full game-logic review of the SwarmComms-era
codebase against Zombicide 2nd Edition rules (see `analysis/SwarmComms.md`,
`.claude/skills/zombicide-rules/SKILL.md`, `RULEBOOK.md`).

- **Baseline:** `npm test` green, 158/158.
- **Scope:** combat, zombies & spawning, turns & movement, items & deck.
- **Out of scope:** UI/UX, network sync, persistence, performance.
- **Authoritative source:** `zombicide-rules` skill + `RULEBOOK.md`.
- **Excluded by project decision:** spawn zone ordering is map-author
  controlled (`spawnZoneIds`) — do not "fix" unless asked. See
  `RULEBOOK.md` §9 Step 2.

Severity legend:
- **CRITICAL** — materially breaks gameplay, exploitable, or silently desyncs
  server-authoritative state.
- **MEDIUM** — incorrect but workaround-able or edge-case triggered.
- **MINOR** — cosmetic, unenforced invariant, or dead code.
- **QUESTION** — possible rules variance; needs product decision.

---

## CRITICAL

### C1. Zombies break down closed doors instead of milling outside — ✅ FIXED (Phase 03)
- **Files:** `src/services/ZombieAI.ts:55-61`,
  `src/services/ZombiePhaseManager.ts:82-84`, `:103-105`, `:193-210`,
  `:322-324`, `:344-346`.
- **Code:**
  ```ts
  // ZombieAI.ts:54-61
  // Path blocked — check if a closed door is the obstacle
  const blockedDoor = this.findBlockedDoor(state, currentZone);
  if (blockedDoor) {
    return {
      type: 'BREAK_DOOR',
      toZoneId: blockedDoor
    };
  }
  ```
- **Rule violated:** Zombicide 2E — zombies never open or break doors.
  They stay in the zone adjacent to the closed door and re-roll targeting
  each zombie phase. Doors are survivor-only.
- **Impact:** Fundamentally changes map tension. Barricading behind doors
  is a core defensive tactic that no longer works.
- **Fix hint:** Remove the `BREAK_DOOR` branch and the `breakDoor` path.
  When `getNextStep` returns null because of a closed door, the zombie
  takes `{ type: 'NONE' }` (or equivalent "stay in place").
- **Cross-compounds:** C5 (tie-break fallback) also routes unreachable
  paths into this branch.

---

### C2. End-of-round auto-reloads every reload weapon — ✅ FIXED (Phase 01)
- **File:** `src/services/ZombiePhaseManager.ts:538-540`
- **Code:**
  ```ts
  for (const card of survivor.inventory) {
    if (card.keywords?.includes('reload')) card.reloaded = true;
  }
  ```
- **Rule violated:** Reload-keyword weapons (Sawed-Off, Ma's Shotgun,
  Army Sniper, etc.) require a **Reload action** after each shot to
  re-prime. They do not auto-reload at turn end.
- **Impact:** Makes `handleReload`, the `reloaded=false` flip in
  `CombatHandlers.ts:554`, and the fire-check at `CombatHandlers.ts:92`
  all cosmetic beyond the current turn. Reload-gated weapons become
  strictly better than non-reload peers.
- **Fix hint:** Delete the loop at `ZombiePhaseManager.ts:538-540`.
  `handleReload` already owns the `reloaded=true` flip. Verify no test
  depends on the auto-reload behavior.

---

### C3. Lucky skill is gated once-per-turn instead of once-per-Action — ✅ FIXED (Phase 01)
- **File:** `src/services/handlers/CombatHandlers.ts:758, 781`
- **Code:**
  ```ts
  // :758
  if (survivor.luckyUsedThisTurn) throw new Error('Lucky already used this turn');
  // :781
  state.survivors[intent.survivorId!].luckyUsedThisTurn = true;
  ```
- **Rule violated:** Lucky skill text: *"Re-roll ALL dice **once per
  Action**. New result replaces old."* Each attack Action is a separate
  trigger; a 3-action turn allows 3 Lucky rerolls.
- **Impact:** Lucky is significantly weaker than intended.
- **Fix hint:** Track `luckyUsedThisAttack` on the `lastAction` record
  (or equivalent per-Action scope) instead of a per-turn survivor flag.
  Reset on each new ATTACK intent, not on `endRound`.

---

### ~~C4. Molotov deals 1 wound instead of killing all actors in zone~~ (FIXED 2026-04-20, Phase 02)
- **File:** `src/services/handlers/CombatHandlers.ts:164-183`
- **Code:**
  ```ts
  const survivorsInZone = (Object.values(state.survivors) as Survivor[]).filter(
    s => s.position.zoneId === targetZoneId && s.wounds < s.maxHealth
  );
  for (const target of survivorsInZone) {
    if (target.skills?.includes('is_that_all_youve_got') && target.inventory.length > 0) {
      target.pendingWounds = (target.pendingWounds || 0) + 1;
      continue;
    }
    target.wounds += 1;
    // ...
  }
  ```
- **Rule violated:** Molotov: *"Kills ALL actors in target zone
  (including Survivors, including Abominations)"* — it is an auto-hit,
  unlimited-damage zone wipe.
- **Impact:** Throwing a molotov into your own zone no longer ends the
  thrower's life; abominations survive. Molotov effectively becomes a
  1-wound AoE.
- **Fix hint:** Replace `target.wounds += 1` with direct death
  (`target.wounds = target.maxHealth; handleSurvivorDeath(...)`).
  Zombies in zone should all be removed regardless of type. Review how
  `is_that_all_youve_got` interacts — rules likely still allow discard
  to cancel, but the canceled damage is "lethal", not "1".

---

### C5. Movement extra-AP scales per-zombie, not flat +1 — ✅ FIXED (Phase 01)
- **Files:** `src/services/handlers/MovementHandlers.ts:41-45`
  (walk), `:122-127` (sprint), vs. validator `src/services/TurnManager.ts:108-114`.
- **Code:**
  ```ts
  // MovementHandlers.ts:41-45
  if (!isSlippery) {
    const zombieCount = Object.values(state.zombies)
      .filter(z => z.position.zoneId === walkZoneId).length;
    extraAPCost += zombieCount;
  }
  ```
- **Rule violated:** Leaving a zone containing zombies costs **+1 extra
  Action** — **regardless of how many zombies are in the zone**. Not +1
  per zombie.
- **Impact:** Desync between validator and handler:
  - `TurnManager` pre-check uses flat +1, so a 2-AP survivor leaving a
    3-zombie zone passes validation,
  - but the handler then debits 3 extra AP, driving
    `actionsRemaining` negative or under-counting turn progress.
  Exploitable and/or crash-prone depending on downstream checks.
- **Fix hint:** Replace `extraAPCost += zombieCount` with:
  ```ts
  if (zombieCount > 0) extraAPCost += 1;
  ```
  Apply identical fix in the Sprint loop at `:122-127`.

---

### ~~C6. Epic Crate can hand out `epic_aaahh` as an equippable card~~ (FIXED 2026-04-20, Phase 02)
- **Files:**
  - `src/services/handlers/ObjectiveHandlers.ts:44-71` (crate flow)
  - `src/config/EquipmentRegistry.ts:257-261` (`epic_aaahh` card def)
  - `src/config/EquipmentRegistry.ts` (`INITIAL_EPIC_DECK_CONFIG`)
  - `src/services/handlers/ItemHandlers.ts:86-95` (Aaahh! trap —
    **only on Search path**)
- **Code:**
  ```ts
  // ObjectiveHandlers.ts:51-56
  const epicCard: EquipmentCard | null = DeckService.drawEpicCard(state);
  if (epicCard) {
    const s = state.survivors[intent.survivorId!];
    if (!s.drawnCard) s.drawnCard = epicCard;
    else (s.drawnCardsQueue ||= []).push(epicCard);
    // ... emits EPIC_CRATE_OPENED + CARD_DRAWN, no aaahh trap
  }
  ```
- **Rule violated:** Aaahh! cards must always spawn a Walker in the
  searcher's zone and be discarded immediately. The crate path bypasses
  this — `epic_aaahh` arrives at `drawnCard` where the player can
  EQUIP / KEEP / DISCARD it like a weapon.
- **Impact:** Player gains an extra card draw with no zombie penalty.
  Exploitable.
- **Fix hint:** Either:
  1. Remove `epic_aaahh` entries from `INITIAL_EPIC_DECK_CONFIG` if the
     Epic deck should not contain Aaahh! cards, **or**
  2. Lift the Aaahh! handling from `ItemHandlers.ts:86-95` into a
     shared helper and invoke it from both Search and Epic Crate flows
     before the card reaches the picker.
  Option 2 preserves rules fidelity if Epic Aaahh! is intentional.

---

## MEDIUM

### M1. Sprint throws when stopped by zombies after < 2 zones — ✅ FIXED (Phase 04)
- **File:** `src/services/handlers/MovementHandlers.ts:135-139`
- **Code:**
  ```ts
  if (hasZombiesInTarget) {
    if (i + 1 < 2) {
      throw new Error('Sprint requires moving at least 2 zones but was stopped by zombies');
    }
    stoppedByZombies = true;
  ```
- **Rule violated:** Sprint — *"move up to 3 zones; entering a zone with
  zombies ends the Move."* Partial completion (1 zone) is legal if the
  zombie stopped you there.
- **Impact:** Player is forced to pre-plan a zombie-free 2-zone path or
  have the action rejected. Mechanically restrictive.
- **Fix hint:** Remove the `i + 1 < 2` throw. Legal outcome: consume the
  Sprint action, survivor ends in the zombie zone, `stoppedByZombies`
  flag set.

---

### M2. Reorganize outside a pickup/trade costs 0 AP — ✅ FIXED (Phase 04)
- **Files:**
  - `src/services/TurnManager.ts:83` (validator)
  - `src/services/handlers/TradeHandlers.ts` (`handleOrganize`)
- **Behavior:** `validateTurn` skips AP check when `request.type ===
  'ORGANIZE'` (via `isPickupException` gated on `survivor.drawnCard`),
  but free-slot reorganize outside a trade/pickup still routes through
  `handleOrganize` and never deducts AP.
- **Rule violated:** Reorganize / Trade as a standalone turn action
  costs 1 Action. Free reorganize is only permitted *within* a Trade or
  a Search resolution.
- **Impact:** Unlimited inventory shuffling per turn. Lets a player
  rearrange hand slots to exploit dual-wield / reload states for free.
- **Fix hint:** Gate the validator exception strictly on `drawnCard`
  present OR active trade in progress. Standalone organize = 1 AP.

---

### M3. Trade Start → Cancel is free, repeatable — ✅ FIXED (Phase 04)
- **Files:** `src/services/handlers/TradeHandlers.ts:92-97`,
  `src/services/ActionProcessor.ts:157-162`.
- **Behavior:** Trade sub-actions are free. Starting a trade and then
  cancelling does not charge the Action. Repeatable unboundedly.
- **Rule violated:** Trade is 1 Action. If it's aborted, the Action is
  still spent (the survivor took the trade-Action slot).
- **Impact:** Stall exploits, free inventory inspection of trading
  partner's offer.
- **Fix hint:** Charge 1 AP on `TradeStart`. Refund on `TradeAccept`
  only if rules want "completed trade is free" semantics — more
  conservative: charge once on Start, never refund.

---

### M4. No zombie splitting on tied noise routes — ✅ FIXED (Phase 03)
- **File:** `src/services/ZombieAI.ts:106-110, 132-134`
- **Code:**
  ```ts
  if (noisiest.length === 1) {
    return noisiest[0];
  }
  // Tie-break: use closest among equally noisy zones
  return this.findClosestZone(state, currentZone.id, noisiest);
  ```
- **Rule violated:** *"Equal routes = split evenly by type. Players
  choose remainders."* All zombies at a source zone currently pick the
  same deterministic tied target.
- **Impact:** Hordes collapse into a single path rather than flanking
  from tied routes — weaker AI pressure, reduced scenario difficulty.
- **Fix hint:** Return a distribution (per-type split across tied
  target zones) rather than a single `ZoneId`. Caller must iterate
  zombies and apportion. Remainder prompt → send the choice to the
  active player.

---

### ~~M5. `handleResolveSearch` EQUIP trusts client-supplied slot string~~ — FIXED (Phase 06, 2026-04-21)
`handleResolveSearch` EQUIP branch now whitelists `HAND_1|HAND_2|BACKPACK_0|BACKPACK_1|BACKPACK_2` before any mutation; rejects sentinels (`BACKPACK`, `DISCARD`) and unknown slot names.

---

### ~~M6. Abomination default pool = 4 contradicts Standard-mode cap of 1~~ — FIXED (Phase 05, 2026-04-21)
Default `zombiePool[Abomination]` is now `1` in `src/types/GameState.ts`. Abomination Fest scenarios override explicitly.

---

### ~~M7. Objective XP uses first unmatched `TakeObjective`'s xpValue~~ — FIXED (Phase 05, 2026-04-21)
`ScenarioCompiler` now emits one `TakeObjective` per token zone. `handleTakeObjective` matches by `zoneId` (with payload color/id tiebreaker) and throws on unresolved match — no silent `?? 5` fallback.

---

## MINOR

### ~~m1. Accuracy has no upper clamp~~ — FIXED (Phase 07, 2026-04-21)
`CombatDice.clampThreshold` now clamps to `[2, 6]` so a natural 6 always hits even if a weapon ships with accuracy > 6.

### ~~m2. Ranged Priority-1 tie (Brute vs Abomination) auto-resolved by stable sort~~ — FIXED (Phase 07, 2026-04-21)
New validate-first block in `handleAttack` rejects ranged attacks when both a Brute and an Abomination sit in the target zone and `targetZombieIds` is absent — the client must reprompt the shooter.

### ~~m3. Melee default ordering follows ranged priority when no `targetIds` given~~ — FIXED (Phase 07, 2026-04-21)
Melee attacks into a multi-target zone without `targetZombieIds` are now rejected; the shooter must explicitly assign targets per rules.

### ~~m4. Mid-turn skill unlock does not seed per-turn free pools~~ — FIXED (Phase 06, 2026-04-21)
`XPManager.unlockSkill` now immediately increments the matching per-turn pool (`plus_1_free_{move,search,melee,ranged,combat}`) so the effect applies the same turn the skill is acquired.

### ~~m5. `matching_set` skill splices duplicate bypassing DeckService~~ — FIXED (Phase 06, 2026-04-21)
`DeckService.drawCardWhere(state, predicate, collector)` replaces the direct splice. Handles empty-deck reshuffle (emits `DECK_SHUFFLED`), shuffles the live deck after a successful match per RULEBOOK ("Shuffle deck after"), and any Aaahh!! returned via predicate routes through `handleAaahhTrap`.

### ~~m6. Epic deck has no discard/reshuffle path~~ — FIXED (Phase 07, 2026-04-21)
`handleTakeObjective` now emits `EPIC_DECK_EXHAUSTED` when the Epic deck is drained so the client surfaces the failed draw instead of silently dropping the reward. The map editor should cap Epic Crate objectives at the Epic deck size (follow-up).

### ~~m7. `doubleSpawn` handled but no spawn card sets it~~ — FIXED (Phase 07, 2026-04-21)
`doubleSpawn` field stripped from `SpawnDetail`; branches removed in `ZombiePhaseManager` and `DoorHandlers`; client event renderer cleaned; B6 tests deleted alongside the feature.

### ~~m8. Necromancer unimplemented~~ — DEFERRED (not planned for this version, 2026-04-21)
- Search surfaces only CSS tokens. Necromancer rules (extra spawn,
  kill to remove spawn zone) absent. Out of current scope, flagged.
- Phase 08 closed without implementation by user decision. If revived, re-open a phase file and implement per Zombicide 2E Necromancer rules (spawn-card data, extra-spawn in `ZombiePhaseManager.applySpawnDetail`, escape-zone tracking, kill-to-remove-spawn-zone hook).

### m9. No ZombiePhaseManager or ZombieAI test coverage — ✅ FIXED (Phase 03)
- `src/services/__tests__/` contains no test file for either.
  Given the density of rules in these modules (C1, M4, M6, M7 live
  here), regressions are undetectable.

### m10. `Search 1/turn` — validator accepts, handler rejects — ✅ FIXED (Phase 04)
- **File:** `src/services/TurnManager.ts:88` vs.
  `src/services/handlers/ItemHandlers.ts:51`
- Validator lets a second Search pass when `freeSearchesRemaining > 0`;
  handler throws on `hasSearched`. Inconsistent UX. Rules are correct
  (1 Search/turn includes free ones) — fix the validator to match.

### m11. `born_leader` gives AP instead of free Action — ✅ FIXED (Phase 04, doc-only)
- **File:** `src/services/handlers/SkillHandlers.ts:98`
- `target.actionsRemaining += 1`. Rules say "give 1 free Action". In
  this engine AP == free slot, so functionally equivalent. Flag only.

---

## QUESTIONS / Product Decisions

### ~~Q1. `friendlyFire` is a gameplay toggle~~ — RESOLVED: removed (Phase 07, 2026-04-21)
Decision: remove the toggle entirely. FF is mandatory per rules and always applies on ranged attacks against friendlies in the target zone. `config.friendlyFire` field, initial state, combat-handler gate, and all test fixtures stripped.

### ~~Q2. Starting gear diverges from rulebook starter deck~~ — RESOLVED: defaults fixed; picker UI deferred (Phase 07, 2026-04-21)
Decision: starter-deck fidelity wins. `CHARACTER_DEFINITIONS` defaults now match the grey-back starter deck contents (Baseball Bat ×1, Crowbar ×1, Fire Axe ×1, Pistol ×3). Katana/Machete removed from starting gear. Follow-up: replace deterministic per-character defaults with a player-choice picker at lobby start (each seat claims one card from the pooled grey deck) — tracked as a TODO comment in `src/config/CharacterRegistry.ts`.

### ~~Q3. Flashlight + `search_plus_1` stacking capped at 2 cards~~ — RESOLVED: kept (Phase 07, 2026-04-21)
Decision: keep the 2-card cap (no stacking). Conservative reading of the Equipment deck rules — both effects provide "+1 card to Search" but do not compound. Behavior unchanged; a comment in `ItemHandlers.ts` codifies the reasoning against future drift.

---

## What's Clean (verified)

- Weapon stats (Katana, Pistol, Shotgun, Chainsaw, Sub-MG, Sniper,
  Sawed-Off, Baseball Bat) — match rulebook.
- Danger-level thresholds 0 / 7 / 19 / 43 —
  `src/services/XPManager.ts:6-11`.
- Friendly-fire routing: misses only, Sniper skip, Point-Blank at range
  0 skip, Steady Hand protections — `CombatHandlers.ts:418-431`.
- Noise: max 1 token per attack action (dual-wield included) —
  `CombatHandlers.ts:531-546`.
- Brute/Abomination damage-1 hit consumption —
  `CombatHandlers.ts:488-490`.
- Three-pass zombie activation (attack → move → runner-second) —
  `ZombiePhaseManager.ts:74-107`.
- Extra-activation-at-Blue suppression — `ZombiePhaseManager.ts:383`.
- Pool-exhaustion extra activation unconditional —
  `ZombiePhaseManager.ts:420-426`.
- Danger promotion uses living survivors — `ZombiePhaseManager.ts:213`.
- 45-card standard equipment deck composition + seeded xoshiro128**
  shuffle.

---

## Suggested fix order

1. **C5** (movement AP desync) — silent state corruption, highest risk.
2. **C2** (auto-reload) — trivially deletable loop, large gameplay shift.
3. **C3** (Lucky once-per-Action) — small scope fix.
4. **C4** (Molotov) — contained to one handler branch.
5. **C1** (zombies breaking doors) — touches AI + multiple phase paths;
   needs care.
6. **C6** (Epic Aaahh!) — minor flow refactor to share the trap helper.
7. **M1–M7** in order of scenario impact.
8. **m1–m11**, **Q1–Q3** as time permits.
