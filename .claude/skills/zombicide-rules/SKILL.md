---
name: zombicide-rules
description: Complete Zombicide 2nd Edition rules reference. Use when implementing game logic, fixing rules bugs, resolving combat/movement/spawning mechanics, checking equipment stats, validating turn structure, or understanding any game mechanic. This is the authoritative source for building a 1:1 digital Zombicide clone.
allowed-tools: Read Grep Glob
---

# Zombicide 2nd Edition — rules router

**This skill holds no rules.** It routes to them. The rules live in the repo, transcribed from the
printed CMON *Rules & Missions* rulebook, one chapter per file:

- **[`RULEBOOK.md`](../../../RULEBOOK.md)** (project root) — the index: chapter table, a
  "where a question lives" map, and the conventions.
- **[`rules/`](../../../rules/)** — 18 chapter files. Each cites the PDF page it came from.
- **`rulebook.pdf`** (project root) — the final authority. Read it with `pages:` when a
  transcription is disputed or when you need a Mission's board layout.

A previous version of this skill carried its own copy of the rules. It drifted and was wrong
(it named 2 Kids when the ID cards show 6). **Do not reintroduce a rules body here.**

## Routing

| Question | File |
|---|---|
| Round structure, win/lose | `rules/01-overview.md` |
| Component and card counts | `rules/02-components.md` |
| Setup, first player, Classic vs Kid | `rules/03-setup.md` |
| Zones, Line of Sight, movement geometry | `rules/04-basics.md` |
| Weapon symbols, ammo, Dual, Noise | `rules/05-equipment-cards.md` |
| Adrenaline, Danger Levels | `rules/06-adrenaline-and-danger.md` |
| Hand/Backpack slots | `rules/07-inventory.md` |
| Zombie types, Abominations, Rush | `rules/08-zombies.md` |
| Every Survivor Action, building spawning | `rules/09-player-phase.md` |
| Zombie activation, targeting, splitting, spawn | `rules/10-zombie-phase.md` |
| Dice, Accuracy, Damage, Targeting Priority, Friendly Fire | `rules/11-combat.md` |
| Flashlight, Molotov, Reload | `rules/12-equipment-traits.md` |
| Cars, Dark Zones, Companions, Ultrared | `rules/13-game-modes.md` |
| What a named Skill does | `rules/14-skills.md` |
| A Survivor's Skill tree, Health, type | `rules/15-characters.md` |
| Weapon stats, deck composition | `rules/16-card-registry.md` |
| A Mission's objectives and special rules | `rules/17-missions.md` |
| A figure, the round summary, PDF page → file | `rules/99-quick-reference.md` |

## How to look something up

```bash
grep -rn -i "targeting priority" rules/     # find the rule
grep -rln "Molotov" rules/                  # which chapters touch it
```

Then open that one chapter — they are small enough to read whole, and reading beats grepping
a phrase out of context.

## What the rulebook does not answer

Three things are marked `> **Not in the rulebook**` in `rules/`, with their source named:

- **Skill trees** — printed on each Survivor's ID Card. `rules/15-characters.md`, implemented in
  `src/config/SkillRegistry.ts`.
- **Equipment stats** (Range, Dice, Accuracy, Damage) — printed on the cards. `rules/16-card-registry.md`,
  implemented in `src/config/EquipmentRegistry.ts`. These two must agree.
- **Per-card Zombie amounts** — printed on the 40 Zombie cards. `src/config/SpawnRegistry.ts`.

**Mission board layouts are diagrams only.** `rules/17-missions.md` carries every Mission's
objectives, special rules and tile list verbatim, but the map itself exists only in `rulebook.pdf`
at the page cited under each Mission heading.

## Referencing rules from code

Use a section anchor, never a line number:

```ts
// Kids get Slippery once per Turn, on a single Move (rules/03-setup.md#survivor-types).
```

Headings are stable; line numbers are not. `RULEBOOK.md:NNN` references were removed and must not
come back.
