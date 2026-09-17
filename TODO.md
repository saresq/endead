# TODO — work parked for the expansion pass

Rules and modes the base game does not need, written down while the reasoning was
fresh so nobody has to re-derive it. Each entry carries the rule text, what the
code would have to change, and what makes it worth doing.

Not the same as `TASKS.md`, which records decisions taken *against* doing
something. These are "yes, but not yet".

---

## Ultrared Mode

An optional mode (`rules/13-game-modes.md#ultrared-mode`). A survivor who reaches Red keeps
earning Adrenaline Points and keeps picking up skills instead of stopping at the
top of the bar. Meant for very large missions and high body counts.

### The rule

- On reaching Red, the Adrenaline tracker goes back to 0, carrying any points
  earned past the 43 the level needed. The survivor **stays at Red Level** and
  keeps every skill.
- Points accrue as normal. Each time the survivor reaches a Danger Level again,
  they gain a skill from that level they have **not** taken yet. Levels whose
  options are all taken give nothing that lap.
- Once every skill on the ID card is taken, reaching Orange and then Red grants a
  skill **chosen freely from the full skill list**, not from the card.

CMON's own worked example, Ostara (`Can Search More Than Once` / `+1 Action` /
`+1 Die: Ranged` / `+1 to Dice Roll: Ranged` after her first lap):

> Second lap — nothing at Blue or Yellow, she has both. At Orange she takes her
> other Orange skill, `+1 Free Move Action`. At Red she picks one of the two
> Red skills left, `+1 Free Combat Action`.
> Third lap — nothing at Blue, Yellow or Orange. At Red she takes the last one,
> `Slippery`.
> From then on: a freely chosen skill at every Orange, and another at every Red.

### What the code needs

The groundwork is already in place — `rules-deviations-pass` made `Survivor.skills`
a multiset read through `skillCount` (`src/config/SkillRegistry.ts`), because
Odin's card grants `+1 Die: Melee` twice and the copies stack. Ultrared leans on
exactly that: repeated picks from the full list stack the same way.

What is missing:

- **`Survivor.experience` is the raw lifetime total**, and `XPManager.getDangerLevel`
  maps it straight onto a level. Ultrared needs the tracker and the level to come
  apart: a per-lap XP figure plus a lap count, with `dangerLevel` pinned at Red
  from the first lap on. The global Danger Level that drives spawns reads
  `survivor.dangerLevel` (`ZombiePhaseManager.getCurrentDangerLevel`), so pinning
  it at Red is also what keeps the zombie deck honest.
- **`Survivor.skillChoices` is one skill per level** (`Partial<Record<DangerLevel, string>>`).
  It would become a list per level, since Orange can be reached twice and Red
  three times before the card runs out. `XPManager.getPendingSkillChoice` then
  offers the options not already in that list, and returns null for a level whose
  list is full.
- **The "card exhausted" case** — offering every skill in `SKILL_DEFINITIONS`
  minus the ones held. Worth filtering: a few skills are starting-only
  (`starts_with_equipment`) and some make no sense twice.
- **Client**: the XP bar has to show which lap it is on rather than a bar that
  sits full forever, and the skill modal needs the long-list variant with search
  or grouping — picking 1 of 3 and picking 1 of ~40 are not the same control.
- **A lobby toggle**, next to Abomination Fest (`config.abominationFest`), since
  it is an optional mode and the host chooses it.

Nothing persists — games live in memory — so there is no migration.

### Why not now

Nobody can reach it. 43 AP is already a long game on the maps that exist, and the
base box is the target. It is also the one rule in `RULES-REVIEW.md` §6 that is
listed as unimplemented rather than fixed, so it is the honest gap, not a hidden
one.

### Revisit when

An expansion lands with missions long enough to lap the Adrenaline bar, or a
player actually hits Red with time left on the clock. The skill-list UI is the
real work; the state change is small.
