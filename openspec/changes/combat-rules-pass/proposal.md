## Why

`RULES-REVIEW.md` §2 lists ten open combat bugs, `B1`–`B10`, found by reading the server against the Zombicide 2nd Edition rulebook. They are the largest block of "the game does not play by the rules" left in the project, and they are all in one file, `CombatHandlers.ts`. Several are player-visible every game: a Brute fails to shield the Walker behind it, Friendly Fire silently drops misses, Molotov leaves survivors standing in a zone it should clear, and two weapons that say `reload` in their data fire every action.

Two of them are also the reason equipment keywords exist but do nothing: `keywords: ['sniper']` and `keywords: ['reload']` are set in `EquipmentRegistry` and never read.

## What Changes

- **Hits stop being wasted on targets they cannot kill.** Priority-ordered ranged attacks stop assigning once a hit cannot kill the current target, so a Brute shields the lower priorities behind it; melee, which assigns freely, skips unkillable targets instead. (`B1`)
- **Every Friendly Fire miss lands.** Misses are no longer capped at one per survivor in array order, and each one applies its damage. (`B2`)
- **Tough ignores one wound per attack step, not per round.** The flag resets at the start of each zombie set activation and per ranged action rather than once per round, and it subtracts a single wound instead of cancelling a whole Damage-2 miss. The skill description stops saying "every Turn". (`B3`)
- **Molotov kills survivors in the zone**, as the rule says it kills all actors. **BREAKING** for players used to surviving their own Molotov. (`B4`)
- **`sniper` and `reload` keywords are read.** Sniper rifles grant Sniper. Sawed-Off and Ma's Shotgun need an action to reload after firing, reloaded free in the End Phase. (`B5`, `B6`)
- **Gunblade can melee.** A weapon may be melee *and* ranged, and the attack carries which mode the player chose, so range-0 attacks with it get melee skills, no Friendly Fire, and Super Strength. (`B7`)
- **Lucky is once per action, Reaper is once per killing hit**, instead of once per turn and never. (`B8`, `B9`)
- **The client can express the combat choices the rules give it**: free targeting for Sniper and Point-blank, the Brute-vs-Abomination priority tie, Steady Hand and Barbarian. (`B10`)
- **One wound-and-death function** replaces the three parallel paths in `CombatHandlers`, `ZombiePhaseManager.applyZombieAttack` and `handlerUtils.handleSurvivorDeath`, which is what makes `B3` a small fix rather than three. **One `recordKill`** replaces the three kill sites.
- **Dead combat code goes**: `applyLuckyReroll` and its `AttackRollResult` import, `isRanged` (a duplicate of `isRangedWeapon`), `reaperUsed`, and `_attackIsMelee` on state in favour of a parameter.

Not in this change: cards, skills and inventory (`S1`–`S8`) and the rule deviations (`D1`–`D11`), which follow in their own passes per the review's fix order.

## Capabilities

### New Capabilities
- `combat-resolution`: how attack hits and misses are assigned, what a hit that cannot kill does, and how Friendly Fire distributes.
- `weapon-keywords`: what a weapon's declared keywords do — sniper, reload, and weapons usable in both melee and ranged.
- `combat-skills`: when Tough, Lucky, Reaper, Steady Hand and Barbarian apply, and how often.
- `combat-choices`: the choices a player makes during an attack and how the client sends them.

### Modified Capabilities

(none; `openspec/specs/` holds no archived specs.)

## Impact

- `src/services/handlers/CombatHandlers.ts`: the bulk of the change.
- `src/services/ZombiePhaseManager.ts`, `src/services/handlers/handlerUtils.ts`: fold into the shared wound/death function.
- `src/config/EquipmentRegistry.ts`: `reload` state on the card; melee+ranged flag.
- `src/config/SkillRegistry.ts`: Tough description.
- `src/services/XPManager.ts`: Tough no longer reset per round.
- `src/services/ActionProcessor.ts`: Reload action.
- `src/client/InputController.ts`, target picker: free targeting, priority tie, Steady Hand and Barbarian toggles.
- `src/types/Action.ts`: attack intent carries mode and the choice fields that exist but are never sent.
- Vitest per capability. Net code should shrink; the review's §5 table lists which helpers collapse.
- No new dependencies. RNG keeps going through `src/services/Rng.ts` and attack dice through `CombatDice.ts`.
