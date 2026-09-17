# Skill Progression Specification

## Purpose

Give survivors their Orange and Red skill choices, apply the chosen skill's per-turn benefit immediately, and reset per-turn survivor values through one shared routine used at both game start and End Phase.

## Requirements

### Requirement: Pending skill choice is derived from survivor data
The system SHALL treat a survivor as having a pending skill choice when their Danger Level is Orange or Red and they own no skill from that level's options on their character progression. Orange SHALL offer its 2 options and Red its 3 options. If both Orange and Red are unpicked, Orange SHALL be offered first. No separate pending flag SHALL be stored.

#### Scenario: Reaching Orange
- **WHEN** a survivor's experience reaches 19 and they own neither Orange option
- **THEN** the pending choice for that survivor is the 2 Orange options

#### Scenario: Choice already made
- **WHEN** a survivor at Orange already owns one of the Orange options
- **THEN** the survivor has no pending skill choice

#### Scenario: Attack rolled back by Lucky
- **WHEN** a Lucky reroll restores a survivor to below the Orange threshold
- **THEN** the survivor has no pending skill choice

### Requirement: Owner chooses the skill
The server SHALL accept `CHOOSE_SKILL` from the survivor's owner at any time during the Players or Zombies phase, regardless of whose turn it is or remaining actions, and SHALL reject it from any other player. The skill SHALL be one of the currently pending options. The choice SHALL cost no action.

#### Scenario: Valid choice out of turn
- **WHEN** the owner of a survivor with a pending Orange choice sends `CHOOSE_SKILL` with one of the options during another player's turn
- **THEN** the skill is added to the survivor and no action is spent

#### Scenario: Non-owner attempts choice
- **WHEN** a player sends `CHOOSE_SKILL` for a survivor they do not own
- **THEN** the action is rejected

#### Scenario: Skill not offered
- **WHEN** the owner sends `CHOOSE_SKILL` with a skill that is not in the pending options
- **THEN** the action is rejected

### Requirement: Undismissable skill choice prompt
The client SHALL show the owner a modal listing the pending options (name and description) that cannot be closed without choosing. Other players SHALL see which survivor is choosing a skill.

#### Scenario: Owner sees prompt
- **WHEN** the local player's survivor has a pending skill choice
- **THEN** a modal with one button per option is shown and cannot be dismissed

#### Scenario: Other players are informed
- **WHEN** another player's survivor has a pending skill choice
- **THEN** the local player sees an indicator naming that survivor as choosing a skill

### Requirement: Skills take effect immediately
Unlocking a skill SHALL apply its per-turn benefit at once: `plus_1_action` adds 1 action, and `plus_1_free_move`, `plus_1_free_search`, `plus_1_free_combat`, `plus_1_free_melee`, `plus_1_free_ranged` each add 1 to the matching free action counter.

#### Scenario: Free move gained mid-turn
- **WHEN** a survivor chooses `plus_1_free_move` during their turn
- **THEN** their free moves remaining increases by 1 immediately

### Requirement: Single per-turn survivor reset
Survivor per-turn values (actions, free action counters from skills, once-per-turn flags) SHALL be set by one shared reset used both at game start and at End Phase.

#### Scenario: Amy's free move in round 1
- **WHEN** a game starts with Amy, whose Blue skill is `plus_1_free_move`
- **THEN** Amy has 1 free move available in round 1
