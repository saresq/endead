## ADDED Requirements

### Requirement: The player chooses targets when the rules let them
When an attack allows free target selection — Sniper, or Point-blank at range 0 — the client SHALL let the player pick the targets rather than assigning them automatically.

#### Scenario: Sniper attack
- **WHEN** a survivor attacks with Sniper into a zone holding several zombies
- **THEN** the player picks which zombies the hits go to

### Requirement: The player breaks a priority tie
When target priority does not resolve to one target — a Brute and an Abomination both eligible — the client SHALL ask the player which to hit.

#### Scenario: Brute and Abomination together
- **WHEN** a hit could go to either a Brute or an Abomination by priority
- **THEN** the player chooses, and the attack resolves against their choice

### Requirement: Skills that need a decision are offered
Steady Hand and Barbarian SHALL be usable from the client, and the attack SHALL carry the player's choice to the server.

#### Scenario: Barbarian
- **WHEN** a survivor with Barbarian attacks in melee
- **THEN** the client offers the Barbarian option and the server resolves the attack accordingly

#### Scenario: Steady Hand
- **WHEN** a survivor with Steady Hand makes a ranged attack that is not a Molotov
- **THEN** the client offers Steady Hand and Friendly Fire is avoided when it is used
