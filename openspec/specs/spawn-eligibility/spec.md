# Spawn Eligibility Specification

## Purpose

Mark the buildings that are already open when the game begins — the players' starting building among them — as already spawned, so entering or re-opening them never produces a spawn.

## Requirements

### Requirement: The starting building does not spawn
The building containing the player start zone, and any building already open when the game begins, SHALL be treated as already spawned, so opening or entering it produces no spawn.

#### Scenario: Players leave and re-enter their starting building
- **WHEN** survivors open a door of the building they started in
- **THEN** no zombies spawn from it

#### Scenario: Another building
- **WHEN** survivors open a building that was closed at the start
- **THEN** it spawns normally, once
