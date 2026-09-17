## ADDED Requirements

### Requirement: The full roster is available
All twelve survivors from the base game SHALL be selectable in the lobby, including Lili, Tiger Sam, Odin, Bunny G, Lou and Ostara.

#### Scenario: Lobby character list
- **WHEN** a player opens the character picker
- **THEN** all twelve survivors are offered

### Requirement: A survivor's health comes from its definition
A survivor's maximum health and type SHALL be read from its character definition rather than assumed, so a type with health other than 3 is created correctly.

#### Scenario: Kid survivor
- **WHEN** a Kid-type survivor enters a game
- **THEN** their maximum health is 2

### Requirement: The Kid type has its own movement rule
Kid-type survivors SHALL have Slippery usable once per Turn, applying to a single Move.

#### Scenario: Kid leaves a zombie zone
- **WHEN** a Kid makes their first Move of the turn out of a zone holding zombies
- **THEN** the extra move cost is waived once that turn

#### Scenario: A Classic survivor pays every time
- **WHEN** a Classic-type survivor leaves a zone holding zombies
- **THEN** the extra move cost is charged on every Move

#### Scenario: Which survivors are Kids
- **WHEN** the roster is inspected
- **THEN** exactly six survivors are Kid type: Lili, Odin, Lou, Ostara, Tiger Sam and Bunny G, and the other six are Classic

### Requirement: Skill trees come from the survivors' ID cards
Each survivor's skill tree SHALL match their printed ID Card, in the shape the rulebook gives: one fixed Blue skill, `+1 Action` at Yellow, one of two at Orange and one of three at Red. Every skill a tree offers SHALL exist in the skill registry and take effect, rather than being declared and ignored.

#### Scenario: Tree shape
- **WHEN** any survivor's progression is inspected
- **THEN** Blue has one skill, Yellow is `+1 Action`, Orange has two options and Red has three

#### Scenario: No declared-but-dead skill
- **WHEN** a tree offers a skill
- **THEN** that skill is defined and changes play when taken

### Requirement: A skill granted twice stacks
A card MAY grant the same skill at more than one level. Taking it again SHALL add a second copy, and numeric bonuses SHALL apply once per copy.

#### Scenario: Odin's repeated melee die
- **WHEN** Odin takes the `+1 Die: Melee` at Red that he already holds at Blue
- **THEN** he rolls two extra dice on a Melee Action, not one

#### Scenario: Re-reaching a fixed level
- **WHEN** a survivor's Blue or Yellow skill is unlocked again
- **THEN** no second copy is granted

### Requirement: An unknown character is an error, not a substitution
Selecting a character the server does not know SHALL be rejected rather than silently replaced with a default.

#### Scenario: Unknown character id
- **WHEN** a client sends a character id that is not in the registry
- **THEN** the request is rejected and no survivor is created
