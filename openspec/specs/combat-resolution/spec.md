# Combat Resolution Specification

## Purpose

Assign an attack's hits and misses: how hits follow target priority, what a hit that cannot kill its target does, how Friendly Fire distributes among the survivors in the target zone, and the single path every wound and death goes through.

## Requirements

### Requirement: A hit that cannot kill does not pass to the next target
Hits from a ranged attack are assigned by target priority. When the current target cannot be killed by a single hit of the attack's damage, the attack SHALL stop assigning hits rather than consume the hit and move on, so a tougher zombie shields the lower priorities behind it.

#### Scenario: Brute shields a Walker
- **WHEN** a zone holds a Brute and a Walker and the survivor lands two hits of Damage 1
- **THEN** neither zombie dies, because Damage 1 cannot kill the Brute and the Brute shields the Walker

#### Scenario: Damage enough to kill
- **WHEN** the same zone is attacked with damage sufficient to kill the Brute
- **THEN** the Brute dies and remaining hits continue to the Walker

### Requirement: Melee skips targets it cannot kill
Melee attacks assign hits freely rather than by priority, so a hit that cannot kill the current target SHALL be offered to another target instead of being discarded.

#### Scenario: Melee into a mixed zone
- **WHEN** a survivor lands two Damage 1 melee hits in a zone holding a Brute and two Walkers
- **THEN** both Walkers die and no hit is wasted on the Brute

### Requirement: Every Friendly Fire miss wounds a survivor
Each miss from a ranged attack into a zone holding survivors SHALL wound a survivor in the target zone, applying the weapon's damage per miss. The shooter is never a Friendly Fire target. Misses SHALL NOT be dropped once each survivor has taken one.

#### Scenario: More misses than survivors
- **WHEN** a shooter misses three times into a zone holding two other survivors
- **THEN** all three misses are applied, not two

#### Scenario: Shooter is never hit
- **WHEN** a shooter misses into the zone they occupy
- **THEN** the misses fall on other survivors in that zone, never on the shooter

### Requirement: One path applies wounds and death
Wounds and survivor death SHALL be applied by a single shared function used by survivor combat, the zombie attack step and any other source, so wound-modifying skills behave identically wherever the wound comes from.

#### Scenario: Same skill behaviour from either source
- **WHEN** a survivor with a wound-modifying skill is wounded by Friendly Fire and by a zombie attack
- **THEN** the skill applies the same way in both cases
