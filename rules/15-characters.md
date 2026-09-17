# Characters

**Rulebook:** the roster appears only as art (`rulebook.pdf` p.3, the 12 ID cards) and in the Setup and Companion rules. **The Skill trees are not in the rulebook at all** — they are printed on each Survivor's physical ID Card.

**Authority:** this whole page is marked *Not in the rulebook* except where a rulebook page is cited. The rules that do come from the book are [Survivor types](03-setup.md#survivor-types) (p.7) and [Companions](13-game-modes.md#companions) (p.33).

On this page: [Core box Survivors](#core-box-survivors) · [Survivor types](#survivor-types) · [Tree shape](#tree-shape) · [Starting Equipment](#starting-equipment)

---

## Core box Survivors

> **Not in the rulebook.** Source: the official Survivor ID cards published by CMON at `zombicide.com/pg/<survivor>/`, images at `cdn.svc.asmodee.net/production-zombicide/uploads/image-converter/2022/03/sic-Z2-<Name>.webp`. All twelve were read directly off the cards.
>
> An earlier hand-written summary in this repo named Tiger Sam and Bunny G as the only Kids. The cards show **six** Kids — Lili, Odin, Lou, Ostara, Tiger Sam and Bunny G — and CMON's own rules document confirms Bunny G. That error is the reason [RULEBOOK.md](../RULEBOOK.md) now routes to verbatim text first.

| # | Name | Type | Health | Blue | Orange (pick 1 of 2) | Red (pick 1 of 3) |
|---|---|---|---|---|---|---|
| 1 | Josh | Classic | 3 | Slippery | +1 Die: Melee / +1 Free Combat | +1 Free Move / +1 to Dice Roll: Combat / Lucky |
| 2 | Lili | Kid | 2 | +1 Max Range | +1 Die: Ranged / Sprint | +1 Free Combat / +1 Free Move / +1 to Dice Roll: Combat |
| 3 | Doug | Classic | 3 | Matching Set | +1 Die: Ranged / +1 Free Combat | +1 to Dice Roll: Combat / Ambidextrous / Slippery |
| 4 | Tiger Sam | Kid | 2 | +1 Die: Ranged | +1 Free Move / Sniper | +1 Damage: Ranged / +1 Free Combat / Shove |
| 5 | Elle | Classic | 3 | Sniper | +1 Die: Combat / +1 Free Ranged | +1 Die: Ranged / +1 Free Combat / +1 to Dice Roll: Ranged |
| 6 | Odin | Kid | 2 | +1 Die: Melee | +1 Free Melee / +1 Free Move | +1 Die: Melee / +1 Die: Ranged / +1 Free Combat |
| 7 | Amy | Classic | 3 | +1 Free Move | +1 Free Melee / +1 Free Ranged | +1 Die: Combat / +1 to Dice Roll: Combat / Medic |
| 8 | Bunny G | Kid | 2 | Lucky | +1 to Dice Roll: Melee / Jump | +1 Damage: Melee / +1 Free Combat / Roll 6: +1 Die Combat |
| 9 | Ned | Classic | 3 | +1 Free Search | +1 Die: Ranged / +1 Free Combat | +1 Die: Combat / +1 to Dice Roll: Combat / Shove |
| 10 | Lou | Kid | 2 | Charge | +1 Die: Combat / +1 Free Melee | +1 Free Move / +1 Free Ranged / Medic |
| 11 | Wanda | Classic | 3 | Sprint | +1 to Dice Roll: Melee / Slippery | +1 Die: Combat / +1 Free Melee / +1 Free Move |
| 12 | Ostara | Kid | 2 | Can Search More Than Once | +1 Die: Ranged / +1 Free Move | +1 Free Combat / +1 to Dice Roll: Ranged / Slippery |

Yellow is **+1 Action** for every Survivor.

Every Skill named in the table is defined verbatim in [14-skills.md](14-skills.md).

---

## Survivor types

*Rulebook p.7 — see [03-setup.md](03-setup.md#survivor-types) for the verbatim text.*

- **Classic Survivors** usually start with Health 3.
- **Kids** usually start with Health 2 and can use the Slippery Skill once per Turn with a single Move Action.

> **Not in the rulebook** — which Survivors carry the Kid symbol is on the ID Cards. Six of the twelve: Lili, Odin, Lou, Ostara, Tiger Sam, Bunny G.

---

## Tree shape

The rulebook does give the shape every tree must have, on p.15 ([06-adrenaline-and-danger.md](06-adrenaline-and-danger.md#danger-levels)):

| Level | AP | What the card offers |
|---|---|---|
| Blue | 0 | 1 fixed Skill |
| Yellow | 7 | +1 Action |
| Orange | 19 | choose 1 of 2 |
| Red | 43 | choose 1 of 3 |

Any sourced tree is validated against this shape.

> **Not in the rulebook** — a repeat stacks. Odin's Red offers the `+1 Die: Melee` he already holds at Blue, and taking it rolls a second extra die. Endead reads the copies for every numeric Skill in `src/config/SkillRegistry.ts`.

---

## Starting Equipment

*Rulebook p.6 — see [03-setup.md](03-setup.md#setup-sequence).*

Starting Equipment is dealt randomly and as evenly as possible; no Survivor is tied to a particular card. The grey-back deck's contents are in [16-card-registry.md](16-card-registry.md#starting-equipment-6-cards-grey-backs). The player holding the Fire Axe takes the First Player token.
