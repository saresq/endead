## ADDED Requirements

### Requirement: A weapon's sniper keyword grants Sniper
A survivor attacking with a weapon whose keywords include `sniper` SHALL resolve the attack with the Sniper skill, whether or not the survivor has that skill.

#### Scenario: Sniper rifle without the skill
- **WHEN** a survivor without the Sniper skill fires a weapon carrying the `sniper` keyword
- **THEN** the attack uses free target selection and Friendly Fire does not apply

### Requirement: A weapon's reload keyword requires reloading
A weapon whose keywords include `reload` SHALL become unloaded after it fires, SHALL NOT fire again while unloaded, and SHALL be reloadable by spending an action. All such weapons SHALL be reloaded for free during the End Phase.

#### Scenario: Firing twice without reloading
- **WHEN** a survivor fires a `reload` weapon and attempts to fire it again in the same turn without reloading
- **THEN** the second attack is refused and the player is told the weapon needs reloading

#### Scenario: Reloading with an action
- **WHEN** the survivor spends an action to reload
- **THEN** the weapon can fire again

#### Scenario: End Phase reload
- **WHEN** the End Phase runs with an unloaded `reload` weapon in a survivor's inventory
- **THEN** it is loaded again without costing anything

### Requirement: A weapon can be both melee and ranged
A weapon may be usable in melee and at range. Which mode an attack uses SHALL be carried by the attack itself rather than inferred from the weapon's minimum range.

#### Scenario: Gunblade in melee
- **WHEN** a survivor attacks a zombie in their own zone with a weapon usable in both modes, choosing melee
- **THEN** the attack resolves as melee: melee skills apply, Friendly Fire does not, and Super Strength applies

#### Scenario: Gunblade at range
- **WHEN** the same survivor attacks an adjacent zone with the same weapon
- **THEN** the attack resolves as ranged
