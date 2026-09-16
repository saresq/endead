## ADDED Requirements

### Requirement: Host distributes zombie wounds
When zombie attacks hit a zone with two or more living survivors, the wounds SHALL be queued for distribution. Only the current host (`lobby.players[0]`) SHALL be able to submit the distribution. The assigned total SHALL equal the queued wounds, and only survivors in the affected zone may receive them. A zone with a single living survivor SHALL receive its wounds directly.

#### Scenario: Host distributes
- **WHEN** 3 zombies attack a zone with 2 survivors and the host assigns 3 wounds to one survivor and 0 to the other
- **THEN** the distribution is applied and the queue entry is removed

#### Scenario: Non-host attempts distribution
- **WHEN** a player who is not the host sends `DISTRIBUTE_ZOMBIE_WOUNDS`
- **THEN** the action is rejected

### Requirement: Owner resolves "Is That All You've Got?"
Wounds deferred by "Is That All You've Got?" SHALL be resolved only by the survivor's owner, regardless of whose turn it is or remaining actions.

#### Scenario: Owner resolves out of turn
- **WHEN** a survivor's pending wounds come from the Zombie Phase and it is another player's turn next
- **THEN** the owner can send `RESOLVE_WOUNDS` and it is accepted

#### Scenario: Other player attempts to resolve
- **WHEN** a player sends `RESOLVE_WOUNDS` for a survivor they do not own
- **THEN** the action is rejected

### Requirement: Pending wounds block the game
While any zombie wound distribution or any survivor's "Is That All You've Got?" wounds are pending, the server SHALL reject every action except `DISTRIBUTE_ZOMBIE_WOUNDS`, `RESOLVE_WOUNDS`, `CHOOSE_SKILL`, lobby actions, `END_GAME` and `ACTIVATE_CHEAT`.

#### Scenario: Move while wounds pending
- **WHEN** wounds are pending from a door-open activation and the active player sends `MOVE`
- **THEN** the action is rejected with an error saying wounds must be resolved first

### Requirement: End Phase waits for wound decisions
If wounds are pending when the Zombie Phase finishes its Spawn step, the game SHALL remain in the Zombies phase without running the End Phase. When the last pending wound decision is resolved and the phase is Zombies, the End Phase SHALL run and the Players phase SHALL start.

#### Scenario: Round pauses and resumes
- **WHEN** the Zombie Phase ends with a pending distribution and the host then submits it
- **THEN** noise is cleared, survivors are reset, the first player rotates and the Players phase begins only after the submission

#### Scenario: Medic heals after wounds
- **WHEN** a Medic's zone receives distributed zombie wounds
- **THEN** the Medic's End Phase healing applies to those wounds

#### Scenario: Death during distribution
- **WHEN** a distribution kills a survivor
- **THEN** the game ends in defeat

### Requirement: Waiting players see the decision
While a wound distribution or "Is That All You've Got?" decision is pending, the decider SHALL see the decision modal and every other player SHALL see who is deciding and what is being decided.

#### Scenario: Waiting on host
- **WHEN** a distribution is pending and the local player is not the host
- **THEN** the local player sees an indicator such as "Host is assigning zombie wounds in <zone>"

#### Scenario: Waiting on owner
- **WHEN** a survivor has pending "Is That All You've Got?" wounds and the local player is not the owner
- **THEN** the local player sees an indicator naming the survivor who is deciding
