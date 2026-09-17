## ADDED Requirements

### Requirement: A survivor owing a skill choice cannot act
A survivor who has reached a danger level granting a skill choice SHALL NOT perform further game actions until the choice is made. Other players SHALL be unaffected.

#### Scenario: Acting before choosing
- **WHEN** a survivor reaches Orange and the player sends another action before picking a skill
- **THEN** the action is rejected and the player is told to choose first

#### Scenario: Other players continue
- **WHEN** one survivor owes a skill choice
- **THEN** the other players can still take their turns
