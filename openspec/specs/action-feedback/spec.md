# Action Feedback Specification

## Purpose

Show players what just happened without a timer taking it away: a persistent latest-event card with real die faces and threshold-aware hits, short floating cues on the board, and a record of zombie-phase wounds that would otherwise go unlogged.

## Requirements

### Requirement: Latest-event card
The HUD SHALL show a latest-event card for the newest displayable history entry on every layout. The card SHALL stay visible until a newer displayable entry replaces it or the local player dismisses it. It SHALL NOT auto-dismiss on a timer and SHALL NOT show a countdown bar. Tapping the card body (or pressing Enter/Space on it) SHALL open the event log.

#### Scenario: Card persists
- **WHEN** a player attacks and no other action happens for 30 seconds
- **THEN** the card still shows the attack result

#### Scenario: Card replaced
- **WHEN** the card shows an attack and another player then opens a door
- **THEN** the card shows the door entry instead

#### Scenario: Dismiss
- **WHEN** the local player taps the card's dismiss button
- **THEN** the card hides until a newer displayable entry arrives

#### Scenario: Open log from card
- **WHEN** the local player taps the card body
- **THEN** the event log opens

### Requirement: Entry content
Card and log SHALL render entries with the same renderer. An entry SHALL show the survivor name and the action. Attack entries SHALL show each die, mark a die as a hit when it is at or above the attack's threshold (4 when the entry has no threshold), show the hit count (`MISS` when zero), and show the dice discarded by a reroll with its source. Search entries SHALL show what was found. Door entries SHALL say which zone was opened and whether zombies spawned. The entry of the action during which a zombie phase ran (`END_TURN`, or the last action of a turn that ran out of actions) SHALL list that phase's spawns per zone and wounds per survivor.

#### Scenario: Threshold-aware hits
- **WHEN** an attack needing 5+ rolls 4, 5, 6
- **THEN** only the 5 and 6 are marked as hits and the entry says `2 hits`

#### Scenario: Miss
- **WHEN** an attack rolls no hits
- **THEN** the entry shows the dice and `MISS`

#### Scenario: Zombie phase with wounds
- **WHEN** a zombie phase spawns 2 Walkers in zone Z3 and wounds Wanda twice
- **THEN** the entry lists `Z3: 2 Walker` and `Wanda -2`

#### Scenario: Round ends by running out of actions
- **WHEN** the last player of a round spends their last action on a move and the zombie phase spawns zombies
- **THEN** that move entry shows the zombie-phase block with the spawns, in the card and in the log

### Requirement: Dice shown as die faces
Attack dice in the card and the log SHALL render as d6 faces with pips (not digits), each with an accessible label of its value and whether it hit, missed or was discarded. Hits SHALL be visually distinct from misses, and dice discarded by a reroll SHALL be shown faded. Result dice in the card SHALL be at least 28px; log dice at least 20px. When a new attack entry first appears in the card, its dice SHALL play a short roll-in (about 400ms) once; re-renders of the same entry SHALL NOT replay it, the entry already shown when the player joins or reloads SHALL NOT roll in, and under `prefers-reduced-motion` the dice SHALL appear without it.

#### Scenario: Faces not digits
- **WHEN** an attack rolls 2, 5, 6 needing 5+
- **THEN** the card shows three die faces with 2, 5 and 6 pips, the 5 and 6 marked as hits

#### Scenario: Roll-in once
- **WHEN** a new attack arrives and then another state update re-renders the HUD
- **THEN** the dice roll in on arrival and do not roll again on the re-render

#### Scenario: No roll-in on reload
- **WHEN** a player reloads while the newest entry is an attack
- **THEN** the card shows the dice without rolling them in

#### Scenario: Accessible value
- **WHEN** a screen reader reaches a die
- **THEN** it reads the die value and whether it hit

### Requirement: Board cues
When a state update adds new history entries or survivor wounds, the board SHALL show short floating text at the affected zone for about 1.2 seconds: attack result (`N HITS`, `1 HIT` or `MISS`) at the target zone (a Lucky reroll uses its attack's target zone), `-N` at the zone of each survivor whose wounds increased, `+N` at each zone that received spawned zombies, and `OPEN` at an opened door's zone. Text SHALL keep a readable screen size at any zoom. Under `prefers-reduced-motion` the text SHALL appear and disappear without movement. Cues SHALL NOT fire for the initial state on join or reconnect.

#### Scenario: Attack cue
- **WHEN** a survivor attacks zone Z5 and scores 2 hits
- **THEN** `2 HITS` floats over Z5 on every client

#### Scenario: Wound cue
- **WHEN** a zombie phase wounds a survivor standing in Z2
- **THEN** `-1` floats over Z2

#### Scenario: No cues on join
- **WHEN** a player reconnects into a game with 40 history entries
- **THEN** no board cues play

### Requirement: Lucky reroll stays reachable
While the local player's survivor can use Lucky on the last attack (owns the attack, has Lucky unspent, attack has a rollback snapshot) and the latest-event card shows that attack, the card SHALL show the reroll button and SHALL NOT show its dismiss button. Pressing the button SHALL send `REROLL_LUCKY` as today. Other players SHALL see the attack without the reroll button.

#### Scenario: Reroll available
- **WHEN** a Lucky survivor's attack misses and 10 seconds pass
- **THEN** the card still shows the attack with a Reroll button and no dismiss button

#### Scenario: After reroll
- **WHEN** the player rerolls
- **THEN** the card shows the new dice, the discarded original dice labelled Lucky, and no Reroll button

### Requirement: Zombie-phase wound record
The server SHALL record, for each zombie phase, the wounds applied directly to each survivor by zombie attacks during that phase, and SHALL store it with that phase's spawn context so it reaches the history entry of the action that ran the phase. Wounds absorbed by Tough SHALL NOT be counted. Wounds that wait for a player decision (distribution, Is That All You've Got?) SHALL be logged by the entries of those decisions, not counted here. Zombie activations outside the zombie phase (door-open spawns) SHALL NOT be added to the record.

#### Scenario: Single survivor attacked
- **WHEN** 2 zombies attack a zone holding only Wanda, who has no armour or Tough
- **THEN** the zombie-phase record contains Wanda with 2 wounds

#### Scenario: Distribution pending
- **WHEN** 3 zombies attack a zone holding two survivors
- **THEN** the record contains no wounds for that zone and the later distribution entry lists the assignment

#### Scenario: Tough absorbs
- **WHEN** a zombie attacks a lone survivor with Tough unused
- **THEN** no wound is applied and the record contains no wound for that survivor
