# Card Registry

**Rulebook:** card *counts* are printed in the components chapter (`rulebook.pdf` p.4). Card *stats* — Range, Dice, Accuracy, Damage, Noise, Dual, Ammo — are printed on the cards themselves, not in the book.

**Authority:** the count columns are verbatim p.4. Every stat column is marked *Not in the rulebook* and named below.

On this page: [Starting Equipment](#starting-equipment-6-cards-grey-backs) · [Standard Equipment](#standard-equipment-45-cards-blue-backs) · [Epic Weapons](#epic-weapons-11-cards-red-backs) · [Aaahh!! card](#aaahh-card) · [Zombie deck](#zombie-deck-40-cards) · [Abomination deck](#abomination-deck-4-cards)

> **Not in the rulebook** — every Range/Dice/Accuracy/Damage/Noise/Dual/Ammo value on this page is transcribed from the printed Equipment cards. The **counts** are verbatim from p.4 and match [02-components.md](02-components.md#mini-cards). Endead's authoritative copy is `src/config/EquipmentRegistry.ts`; this page and that file must agree.
>
> **Six cards the rulebook does depict**, read off its own card art and used to correct this table:
>
> | Card | Rulebook art | Page |
> |---|---|---|
> | Fire Axe | Range 0 · Dice 1 · 4+ · Damage 2 · Silent · opens Doors (Noisy) | p.13 |
> | Chainsaw | Range 0 · Dice 5 · 5+ · Damage 2 · Noisy · opens Doors (Noisy) | p.13 |
> | Pistol | Range 0-1 · Dice 1 · **3+** · Damage 1 · Noisy · Dual · Bullets | p.12, p.13 |
> | Shotgun | Range 0-1 · Dice 2 · 4+ · Damage 2 · Noisy · Shells | p.12, p.27 |
> | Katana | Range 0 · **Dice 2** · 4+ · **Damage 1** · Silent · Dual | p.27 |
> | Sawed-Off | Damage 1 (from the Friendly Fire example, p.28) | p.28 |
>
> The Katana is also confirmed in prose on p.27: *"The Katana has Damage 1, so it cannot hurt the Brute"*, in an example where Ostara rolls **two** dice with it. Every other row in the tables below is unverified against the printed cards.

---

## Starting Equipment (6 cards, grey backs)

| Weapon | Type | Range | Dice | Accuracy | Damage | Noise | Door | Dual | Ammo | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Baseball Bat | Melee | 0 | 2 | 4+ | 1 | Silent | No | No | — | 1 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes (Noisy) | No | — | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes (Noisy) | No | — | 1 |
| Pistol | Ranged | 0-1 | 1 | 3+ | 1 | Noisy | No | Yes | Bullets | 3 |

The player who is dealt the Fire Axe takes the First Player token (p.7).

---

## Standard Equipment (45 cards, blue backs)

| Equipment | Type | Range | Dice | Accuracy | Damage | Noise | Door | Dual | Ammo | Skill | Count |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Aaahh!! | Special | — | — | — | — | — | — | — | — | Spawns a Walker | 4 |
| Bag of Rice | Food | — | — | — | — | — | — | — | — | Consume for 1 AP | 2 |
| Canned Food | Food | — | — | — | — | — | — | — | — | Consume for 1 AP | 2 |
| Chainsaw | Melee | 0 | 5 | 5+ | 2 | Noisy | Yes (Noisy) | No | — | — | 2 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes (Noisy) | No | — | — | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes (Noisy) | No | — | — | 1 |
| Flashlight | Utility | — | — | — | — | — | — | — | — | Search: 2 cards | 2 |
| Katana | Melee | 0 | 2 | 4+ | 1 | Silent | No | Yes | — | — | 2 |
| Kukri | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | — | — | 2 |
| Machete | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | — | — | 4 |
| Molotov | Ranged | 0-1 | — | Auto | All | Noisy | No | No | — | See [Molotov](12-equipment-traits.md#molotov) | 4 |
| Pistol | Ranged | 0-1 | 1 | 3+ | 1 | Noisy | No | Yes | Bullets | — | 1 |
| Plenty of Bullets | Utility | — | — | — | — | — | — | — | Bullets | Re-roll misses (Bullets weapons). Backpack-usable | 3 |
| Plenty of Shells | Utility | — | — | — | — | — | — | — | Shells | Re-roll misses (Shells weapons). Backpack-usable | 3 |
| Sawed-Off | Ranged | 0-1 | 2 | 4+ | 1 | Noisy | No | No | Shells | Reload | 4 |
| Shotgun | Ranged | 0-1 | 2 | 4+ | 2 | Noisy | No | No | Shells | — | 2 |
| Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 2 | Noisy | No | No | Bullets | Sniper | 2 |
| Sub-MG | Ranged | 0-1 | 3 | 5+ | 1 | Noisy | No | Yes | Bullets | — | 2 |
| Water | Food | — | — | — | — | — | — | — | — | Consume for 1 AP | 2 |

Total: 45 cards.

---

## Epic Weapons (11 cards, red backs)

| Weapon | Type | Range | Dice | Accuracy | Damage | Noise | Dual | Ammo | Skill | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Aaahh! | Special | — | — | — | — | — | — | — | Spawns a Walker | 2 |
| Army Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 3 | Noisy | No | Bullets | Sniper | 1 |
| Automatic Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | Noisy | No | Shells | — | 1 |
| Evil Twins | Ranged | 0-1 | 2 | 3+ | 1 | Noisy | Yes | Bullets | — | 1 |
| Golden AK-47 | Ranged | 0-2 | 3 | 4+ | 1 | Noisy | No | Bullets | — | 1 |
| Golden Kukri | Melee | 0 | 2 | 3+ | 2 | Silent | Yes | — | — | 1 |
| Gunblade | Melee/Ranged | 0-1 | 2 | 4+ | 2 | Noisy | No | Bullets | — | 1 |
| Ma's Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | Noisy | No | Shells | Reload | 1 |
| Nailbat | Melee | 0 | 2 | 3+ | 2 | Silent | No | — | — | 1 |
| Zantetsuken | Melee | 0 | 2 | 4+ | 3 | Silent | No | — | — | 1 |

Total: 11 cards.

Epic Weapons are gained from Epic Weapon Crates ([09-player-phase.md](09-player-phase.md#take-or-activate-an-objective)) and from Muscle Cars ([13-game-modes.md](13-game-modes.md#take-a-epic-weapon-crate-in-a-muscle-car)) — always a random one among those still available, followed by a free inventory reorganize.

---

## Aaahh!! card

The rulebook mentions this card only in the Police Car rules (p.32): *"The 'Aaahh!!' card triggers the appearance of a Walker as usual and interrupts the Search (even with a Flashlight, for example)."*

> **Not in the rulebook** — the full behaviour is on the card: when drawn from the Equipment deck it immediately spawns a Walker in the Survivor's Zone, then the card is discarded rather than taken into inventory, and it interrupts the Search.

---

## Zombie deck (40 cards)

The deck's tiers are verbatim from p.35 ([13-game-modes.md](13-game-modes.md#tuning-the-difficulty)):

- **#001–#018** — easier. Lower Zombie amounts, Rush rules still apply, no Abominations at Blue Danger Level.
- **#019–#036** — harder. Greater numbers, especially at low Danger Levels; Abominations can appear at Blue.
- **#037–#040** — Extra Activation cards.

Each card shows a Zombie type and 4 lines (Blue / Yellow / Orange / Red). Read the line matching the highest Danger Level among all Survivors (p.25). The p.25 example card reads 3 / 5 / 7 / 9 Walkers.

**Three Zombie cards the rulebook depicts**, read off its own card art — concrete values to validate `src/config/SpawnRegistry.ts` against:

| Card | Blue | Yellow | Orange | Red | Footer | Page |
|---|---|---|---|---|---|---|
| Walkers | 3 | 5 | 7 | 9 | — | p.25 |
| #011 Brute Rush! | 0 | 1 | 2 | 3 | "Spawn, then Activate" | p.26 |
| #037 Extra Activation | No one | All Walkers | All Walkers | All Walkers | "One Extra Activation" | p.26 |

Note #037 confirms the printed rule that Extra Activation cards do nothing at Blue: the Blue line literally reads *No one*.

Card behaviours are all verbatim in [10-zombie-phase.md](10-zombie-phase.md): [Rush](10-zombie-phase.md#zombie-rush-cards), [Extra Activation](10-zombie-phase.md#extra-activation-cards), [running out of miniatures](10-zombie-phase.md#running-out-of-zombies).

> **Not in the rulebook** — the per-card Zombie amounts are printed on the 40 cards. Endead's numbers were taken from the ZombiDeck companion app and cross-checked against every figure the rulebook does give.

---

## Abomination deck (4 cards)

Separate from the Zombie deck. Drawn when a Zombie card calls for an Abomination and none is on the board (p.17). One card per variant: Patient 0, Hobomination, Abominacop, Abominawild — all four described verbatim in [08-zombies.md](08-zombies.md#the-four-abominations).

The deck can be tailored by removing or adding cards (p.18), and [Abomination Fest](13-game-modes.md#abomination-fest) changes how a draw resolves when one is already on the board.
