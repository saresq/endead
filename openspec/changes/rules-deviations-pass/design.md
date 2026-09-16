## Context

`RULES-REVIEW.md` §4 is the source, plus the §5 simplification table, which already maps three of these items onto helpers it recommends for other reasons.

**Source of truth for any rules question that comes up during implementation:** `RULEBOOK.md` first. Where the rulebook does not answer it, official Guillotine Games / CMON material for Zombicide 2nd Edition — the printed component the rulebook points to, the official FAQ, or published errata. A house ruling is a last resort and must be recorded as a decision here, never invented silently in code.

This is the last of the three rules passes and the least uniform: `D1`, `D2` and `D3` are content — survivor definitions, a starting deal, real card data — while `D4`, `D7`, `D8`, `D9`, `D10` and `D11` are small logic corrections. `D5` is not a bug at all; the review calls breaking noise ties by distance "acceptable automation, not in rules", and this change closes it as a recorded decision rather than leaving it open forever.

Two items depend on compile-time work the review already wants: precomputing the building id per zone replaces the walk in `DoorHandlers.ts:45-81` **and** gives `D7` somewhere to mark the starting building. A `zoneHasZombies` / `zombiesInZone` helper used by Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat is what turns `D8`'s three skill fixes into three call sites rather than three reimplementations of movement rules.

## Goals / Non-Goals

**Goals:**
- The game the rulebook describes: full roster, dealt starting gear, real zombie deck.
- Movement skills that obey the movement rules everything else obeys.
- Less code than before, via the helpers the review already identified.
- `D5` closed with a reason, not carried.

**Non-Goals:**
- Combat (`B1`–`B10`) and cards/inventory (`S1`–`S8`); earlier passes.
- Expansion characters, expansion zombie types, or scenarios beyond the base game.
- Verifying the six existing characters' skill trees. `RULEBOOK.md:584` states the trees live on the physical ID cards, so this needs the same external source as the new ones and is not a reason to hold the rest of the pass.
- A lobby redesign for the larger roster beyond making twelve characters selectable.

## Decisions

### D0. What the rulebook already settles
Checked rather than assumed. `RULEBOOK.md:566-582` carries the full twelve-survivor roster with name, type and starting health, so `D1`'s roster data needs no external source: the six missing survivors are Lili, Odin, Lou and Ostara (Classic, Health 3) plus Tiger Sam and Bunny G (**Kid, Health 2, Slippery once per Turn**). There are two Kids, not one.

What the rulebook explicitly does *not* carry is the skill trees: `:584` says they "are printed on each character's ID Card and vary per character", while giving their shape — Blue fixed, Yellow = +1 Action, Orange = pick 1 of 2, Red = pick 1 of 3. That shape is enough to validate any tree sourced externally.

### D1. Content items are data, not code
`D1`, `D2` and `D3` are registry entries: six survivors in `CharacterRegistry`, the starting weapon set, and real spawn card data in `SpawnRegistry`. The only code they need is removing what hardcodes around them — `maxHealth: 3` at `LobbyHandlers.ts:128` and the `|| SURVIVOR_CLASSES['Wanda']` fallback that turns an unknown character into a silent substitution.

The fallback becomes a rejection. A substitution hides a client bug and produces a game nobody asked for; a rejection surfaces it at the point of failure.

### D2. The starting deal is seeded RNG like everything else
`D2` deals one weapon per survivor from a fixed set. It goes through `src/services/Rng.ts` from `GameState.seed`, per `CLAUDE.md`, so a game is reproducible from its seed. The first player token then follows the Fire Axe instead of being index 0 (`GameState.ts:491`) — one lookup after the deal, not a new concept.

### D3. Route splitting collects all shortest first steps
`ZombieAI.getNextStep` (`:122-152`) returns the first connection it finds. The fix returns every first step tied for shortest, and the caller distributes the group's zombies across them round-robin **per type**, so a mixed group splits evenly by type as the rules say rather than by whatever order the list happens to be in.

Alternative considered: splitting the group as a whole without regard to type. Rejected as not the rule, and no simpler — both are one distribution loop.

### D4. Compile-time building ids serve `D7` and delete a runtime walk
`ScenarioCompiler` already knows which cells belong to which building. Recording a building id per zone at compile time lets `D7` mark the starting building's as spawned right there (`:396`, where `hasBeenSpawned: false` is currently unconditional), and lets `DoorHandlers` look up a building instead of walking the map at `:45-81`. One addition to the compiled scenario, two problems.

### D5. One zombie-presence helper, three skill fixes
Sprint, Charge and Born Leader each deviate because each re-implements part of "what happens when you enter or leave a zone with zombies". With `zoneHasZombies` / `zombiesInZone` shared across Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat, `D8` becomes: Sprint stops rather than throws, Charge checks the middle zone, and Born Leader drops its same-zone condition. Shared path validation for Charge and Bloodlust removes the last copy.

Born Leader's second half — granting an action to a survivor who cannot use it, so it is silently lost — becomes a refusal. Consistent with D1's reasoning: a silent no-op is worse than an error.

### D6. `D10` is a gate, not a new pending-decision type
`fix-critical-rules` already built pending decisions that block play and delay the End Phase, for wound distribution and skill choice. `D10` is that the *server* does not enforce what the client already shows: it accepts other actions from a survivor owing a choice. The fix reuses the existing pending-wounds gate in `ActionProcessor` with `XPManager.getPendingSkillChoice` as the condition. No new mechanism, and other players stay unaffected because the gate is per survivor.

### D7. `D5` (noise ties) is closed as intentional
The rules do not specify a tie-break for equal noise. Breaking by distance is deterministic, matches what a table would do, and the review itself marks it acceptable. It is recorded here as a decision and removed from the review rather than left as a permanent open item.

## Risks / Trade-offs

- [`D2` changes how every game opens and players will notice immediately] → It is the rule, and flagged **BREAKING**. The seeded deal keeps games reproducible for debugging.
- [Six new characters need skill-tree data the rulebook does not carry] → Roster, type and health come from `RULEBOOK.md:566-582`; only the trees need an external official source. A character whose tree cannot be sourced waits rather than shipping invented skills, and the Blue/Yellow/Orange/Red shape at `:584` validates whatever is sourced.
- [Rewriting `SpawnRegistry` with real card data is transcription, and transcription has errors] → Test the deck's composition — counts per card, per danger level — not just that it loads, so a mistyped entry fails a test rather than a game.
- [Rejecting unknown characters could lock players out if a client sends a stale id] → Only reachable from a modified or outdated client; the lobby offers what the server knows.
- [Route splitting changes zombie behaviour players have learned] → It is the rule, and it makes groups less predictable in the direction the game intends.
- [Marking buildings open at the start as spawned could suppress a spawn the author wanted] → It matches the rulebook, and a map author who wants a spawn there can place a spawn zone.
- [This pass touches more files than the other two] → Each item is independent; they can land one at a time, and the helpers land first so the rest shrink.

## Migration Plan

Helpers first, then content, then the small corrections:

1. `zoneHasZombies` / `zombiesInZone`, shared path validation, compile-time building ids, `idsOfType`. No behaviour change; existing tests stay green.
2. `D7` starting building, `D8` Sprint / Charge / Born Leader — small once step 1 exists.
3. `D4` route splitting.
4. `D10` pending skill choice gate, `D11` door-open spawn context, `D9` small corrections.
5. `D1` roster and Kid type, `D2` starting deal and first player, `D3` zombie deck. Content last, because it is the part most likely to need a second source.
6. Dead code removal alongside the commits that touch each area.

Games live in memory, so a deploy restart clears any game started under the old setup. No persisted state to migrate.

## Open Questions

- **Skill trees for all twelve characters.** `RULEBOOK.md:584` states they are printed on the physical ID Cards, so the rulebook cannot answer this. Resolve from official Guillotine Games / CMON material for Zombicide 2nd Edition — ID card listings or scans, the official FAQ, or published errata — and validate each against the shape the rulebook does give: Blue fixed, Yellow = +1 Action, Orange = pick 1 of 2, Red = pick 1 of 3. Until a tree is sourced, that character does not ship. This is the only item in the pass blocked on an external source; everything else is answered by `RULEBOOK.md` or by the review.
