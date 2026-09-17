# Building Spawn Specification

## Purpose

Make door-open spawns follow the same rules as the Spawn Step (Extra Activation, Rush, pool limits, Abomination rules) against a live Danger Level, instead of a separate, simplified placement loop.

## Requirements

### Requirement: Door-open spawns use the standard spawn rules
When a building that has not already spawned is opened, one Zombie card SHALL be drawn per Dark Zone of the building and resolved with the same rules as the Spawn Step: Extra Activation (no effect at Blue), Rush activation, zombie pool limits with extra activation on exhaustion, and Abomination standard/Fest rules. Which buildings are eligible to spawn at all is the `spawn-eligibility` capability.

#### Scenario: Extra Activation card on door open
- **WHEN** a door is opened at Yellow Danger Level and the drawn card is Extra Activation: Walkers
- **THEN** all Walkers on the board activate immediately

#### Scenario: Pool exhausted on door open
- **WHEN** a door-open card would place Walkers and no Walker miniatures remain
- **THEN** no Walkers are placed and all Walkers activate instead

#### Scenario: Door-open activation wounds survivors
- **WHEN** a door-open activation makes zombies attack a zone with 2 survivors
- **THEN** a wound distribution is queued and play is blocked until it is resolved

### Requirement: Danger Level is always current
`currentDangerLevel` SHALL equal the highest Danger Level among living survivors after every processed action, and spawns SHALL use that level.

#### Scenario: Level up then open door
- **WHEN** a survivor reaches Yellow with an attack and then opens a building in the same turn
- **THEN** the door-open cards are resolved at Yellow

### Requirement: Single extra activation for Abomination Fest
In Abomination Fest mode, a card spawning an Abomination while Abominations are on board SHALL trigger at most one extra activation of Abominations.

#### Scenario: Fest with pool exhausted
- **WHEN** Fest mode is on, all Abomination miniatures are on board and an Abomination card is drawn
- **THEN** Abominations activate once
