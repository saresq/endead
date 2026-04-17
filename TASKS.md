# Tasks

## Open

### Add Kid Survivors (Tiger Sam, Bunny G)

Zombicide 2E core box includes two Kid survivors missing from `CharacterRegistry.ts`:
- **Tiger Sam** (Kid)
- **Bunny G** (Kid)

Kid survivors have distinct mechanics vs Classic survivors — the current code assumes `maxHealth = 3` and doesn't model Kid-specific rules.

**Scope:**
- Add `survivorType: 'CLASSIC' | 'KID'` field to `CharacterDefinition` (or equivalent on `Survivor`).
- Kid survivors start with `maxHealth = 2` (not 3) — they are eliminated at 2 Wounds.
- Kid survivors can use the `slippery` skill effect **once per Turn** with a **single Move Action**, even without the skill being on their tree. Enforce once-per-turn limit.
- Source each character's ID-card skill tree (Blue fixed / Yellow +1 Action / Orange pick 1 of 2 / Red pick 1 of 3) from the physical ID cards and wire into `SKILL_DEFINITIONS` / `SURVIVOR_CLASSES`.
- Pick `startingEquipmentKey` per the character's ID card.
- Add entries to `AssetManager.ts` `survivorClasses` list (`'tiger_sam'`, `'bunny_g'`).
- Update `RULEBOOK.md` / `SKILL.md` character roster references if needed.

**Rulebook references:**
- §13 Characters table in `RULEBOOK.md`
- Kids note on §2 Setup ("Kids start with Health 2, can use Slippery once per Turn with a single Move Action")
