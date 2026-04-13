---
name: No backward compatibility
description: Never preserve backward compatibility with old/legacy systems — treat them as gone
type: feedback
---

Do not add backward-compatibility shims, legacy fallbacks, or keep old interfaces alive. Old systems are gone and should not be maintained.

**Why:** User explicitly stated old systems are gone and we should not care about them. Clean breaks preferred over gradual migration.

**How to apply:** When encountering legacy patterns (e.g., `connectedZones` alongside `ZoneConnection[]`, old 3x3 grid references), treat the new system as canonical. Remove old code paths rather than supporting both. Task updates should recommend removing legacy, not bridging it.
