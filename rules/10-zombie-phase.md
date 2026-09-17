# Zombie Phase

**Rulebook:** `rulebook.pdf` chapter #10 — pages 23–26.
**Authority:** verbatim rulebook text. Blocks marked *Not in the rulebook* or *Endead implementation note* are derived and name their source.

On this page: [Step 1: Activation](#step-1-activation) · [Attack](#attack) · [Move](#move) · [Splitting](#splitting) · [Playing Runners](#playing-runners) · [Step 2: Spawn](#step-2-spawn) · [Colored Spawn Zones](#colored-spawn-zones) · [Zombie Rush cards](#zombie-rush-cards) · [Extra Activation cards](#extra-activation-cards) · [Running out of Zombies](#running-out-of-zombies)

---

## Step 1: Activation

*#10 Zombie Phase — p.23*

Once the players have activated all their Survivors, the Zombies activate. No single player controls them. The Zombies act all on their own, performing the following steps in order.

Each Zombie activates and spends its Action on either an Attack or a Move, depending on the situation. **Resolve all the Attacks first, then all the Moves.** Each Zombie performs either an Attack OR a Move with a single Action.

---

## Attack

*p.23*

Each Zombie in the same Zone as Survivors performs an Attack. A Zombie's Attack is always successful and does not require any die rolls.

Survivors in the same Zone split the Zombies' Attacks in any way the players prefer. Each Zombie Attack deals 1 Wound. The tracker in the Survivor's Wound Bar is moved 1 point lower per Wound received. A Survivor is eliminated as soon as their Wound Bar reaches the bottom (usually after taking 3 Wounds for a classic Survivor, 2 Wounds for a Kid). At that point, the game is lost!

Each successful Zombie Attack deals 1 Wound.

Zombies fight in groups. All Zombies activated in the same Zone as a Survivor join the Attack, even if there are so many Wounds being dealt that it would be overkill.

**EXAMPLE 1:** A Walker in a Zone with 2 Survivors inflicts 1 Wound during its Activation. The players choose which Survivor takes the Wound.

**EXAMPLE 2:** A group of 4 Walkers activate in the same Zone as two Survivors. Players choose the way the Wounds are dealt. Since a Survivor is eliminated upon taking their third Wound, thus ending the game, the players choose to deal 2 Wounds to each Survivor. The team must react fast!

---

## Move

*p.24*

The Zombies that did not Attack use their Action to Move 1 Zone toward Survivors:

1. **Zombies select their destination Zone.**
   - The first Zone they select is the one with Survivors in Line of Sight that has the most Noise tokens. Remember, each Survivor counts as a Noise token.
   - If no Survivors are visible, they select the noisiest Zone.

   In both cases, distance doesn't matter. A Zombie always goes for the noisiest target they can see or hear.
2. **Zombies move 1 Zone toward their destination Zone by taking the shortest available path.**

   If there are no open paths to their destination Zone, the Zombies don't move.

*Diagram captions, p.24:*

- Amy's Zone is the noisiest on the board (counting 2 Noise tokens + Amy, for a total of 3 Noise).
- This Walker has a Line of Sight on this destination Zone and Moves 1 Zone toward it.
- The Brute has a Line of Sight on Lou and Moves 1 Zone toward her, despite Lou's Zone not being the noisiest on the board. Line of Sight on a Survivor takes precedence!
- The Abomination has no Line of Sight on any Survivor, so it goes for the noisiest Zone on the board. After defining the shortest available path to Amy's Zone, it Moves 1 Zone to the north.

---

## Splitting

*p.24*

If there is more than one route of the same length to their target Zone, Zombies split into groups of equal numbers separated by type to follow all possible routes. They also split up if different target Zones contain the same number of Noise tokens.

Uneven Zombie groups are split the same way. Decide which splitting group gets the extra Zombie and which direction the uneven split groups go. In case of a single Zombie being offered multiple routes, the players decide which direction it goes.

**EXAMPLE:** A group of 4 Walkers, 3 Brutes, and 1 Runner move toward a group of Survivors. The Zombies can take 2 routes of the same length, so they split into 2 groups.

- 2 Walkers go one way. The other 2 take the other route.
- 2 Brutes go one way. The last one takes the other route (players choose).
- Players choose which route the Runner takes.

*Diagram caption, p.24:* This Zombie group has two open routes of the same length toward Amy's Zone. The Walkers are separated to go both ways. Players choose which path the Brute takes.

---

## Playing Runners

*p.25*

> Runners are fast-moving, tricky, formidable targets. They are a challenge, and I like challenges. Let me show you how to hunt them.
> — Elle

Runners have 2 Actions per Activation. After all Zombies (including Runners) have gone through the Activation Step and resolved their first Action, Runners go through the Activation step again, using their second Action to attack a Survivor in their Zone or Move if there is nobody to Attack.

**EXAMPLE 1:** At the beginning of the Zombie Phase, a Runner stands in the same Zone as a Survivor. The Zombie spends its first Action to Attack, inflicting 1 Wound. Then, the Runner performs its second Action, attacking again for another 1 Wound.

**EXAMPLE 2:** A group of 2 Runners and 1 Brute is 1 Zone away from a Survivor. For their first Action, since they have nobody to Attack in their Zone, the Zombies Move into the Survivor's Zone. The Runners then perform their second Action. Since they now occupy the same Zone as a Survivor, they Attack. Each Runner inflicts 1 Wound.

---

## Step 2: Spawn

*p.25*

Using Zombie Spawn tokens, the Mission map shows where Zombies appear at the end of each Zombie Phase. These are the Spawn Zones.

Zombie Spawn tokens mark the Spawn Zones' locations. The Spawn Start is always the first one to spawn Zombies.

Find the Spawn Start Zombie Spawn token, then draw a Zombie card. Read the Zombie type and the line that corresponds to the Danger Level of the Survivor with the highest Adrenaline (Blue, Yellow, Orange, or Red). Place the indicated amount of the corresponding Zombie type in the Starting Spawn Zone. **The Starting Spawn Zone is always the first one to spawn.**

Repeat this for each Spawn Zone, one after the other, **going clockwise from the Starting Spawn Zone**.

When the Zombie deck runs out, reshuffle all the discarded Zombie cards to make a new deck.

**EXAMPLE:** Doug has 5 Adrenaline Points, placing him in the Blue Danger Level. Lou has 12, which puts her in Yellow. In order to determine how many Zombies spawn, read the Yellow line, which corresponds to Lou, the Survivor with the most Adrenaline Points.

*Diagram captions, p.25 — this Zombie card spawns Walkers:*

- Blue Danger Level: 3 Walkers
- Yellow Danger Level: 5 Walkers
- Orange Danger Level: 7 Walkers
- Red Danger Level: 9 Walkers

> **Endead implementation note — spawn zone ordering.** The rule above is p.25: the Starting Spawn Zone is always first, then clockwise from it. In Endead that sequence is the **placement order chosen by the map author** in the editor (`spawnZoneIds`), which the editor numbers 1..N on the board: the mapper authors the order rather than the engine inferring geometry. **Do not "fix" this with automatic clockwise detection or a separate starting-spawn flag unless explicitly requested.** Authoring guidance is in `MAP-GUIDE.md`.

---

## Colored Spawn Zones

*p.25*

Some Missions feature a Blue and/or Green-colored Zombie Spawn token. Unless otherwise stated, these Zones don't spawn Zombies until a specific event happens (like taking an Objective of the matching color), which then activates them.

Unless otherwise stated, when a Spawn Zone is activated, it will only start spawning on the next Zombie Phase.

---

## Zombie Rush cards

*p.26*

> Once in a while, a zombie does something unexpected. It keeps your senses sharp and prevents you from getting bad habits. Zombies are a girl's best friend.
> — Amy

When a player draws a Zombie card featuring the Rush keyword, the Zombies placed by that card perform an Activation (see Activation step on P. 23) right after being placed.

> **NOTE:** Runners don't have Rush cards.

---

## Extra Activation cards

*p.26*

> There was a mass uprising among the zombies all around the place. As if they had a death drive aimed right at us and went for our throats all at once. I haven't had much time to wonder about the phenomenon, but since that day, such outbursts keep me on my toes.

When a player draws an Extra Activation Zombie card, no Zombies appear in the designated Zone. Instead, all Zombies of the indicated type immediately perform an extra Activation (P. 23).

> **NOTE:** These cards have no effect at Blue Danger Level.

---

## Running out of Zombies

*p.26*

Players may run out of miniatures of the indicated type when required to place a Zombie on the board through spawning. In this case, the remaining Zombie miniatures are placed (if there are any). Then, all Zombies of the indicated type immediately resolve an extra Activation (P. 23). Multiple extra Activations may occur in a row. Keep an eye on the Zombie population!
