// src/services/GameStateSchema.ts
//
// Phase F — schema check for persisted GameState rows.
//
// The Phase A–E rewrite added `spawnColorActivation`, `epicDeck`,
// `epicDiscard`, and reshaped `Objective` into a discriminated union with no
// `targetId` flat-bag. Pre-change in-flight saves are NOT resumable: per
// project policy (`feedback_no_backward_compat`) we reject them at load
// time and surface a clear lobby-level error instead of crashing inside
// `ZombiePhaseManager` when a missing field is dereferenced.

import { GamePhase } from '../types/GameState';

export type SchemaCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a saved-room JSON blob against the post-Phase-F GameState shape.
 *
 * Lobby-only saves (`phase === Lobby`) pass through: a freshly-restored
 * lobby will be re-initialized in `handleStartGame`, which always writes
 * the new fields. Only in-flight games (`phase !== Lobby`) need the new
 * shape on disk.
 */
export function validateInFlightGameStateSchema(state: unknown): SchemaCheckResult {
  if (!state || typeof state !== 'object') {
    return { ok: false, reason: 'state is not an object' };
  }
  const s = state as Record<string, unknown>;

  // Lobby-phase saves are always compatible — they have no objectives or
  // colored-spawn state to depend on, and `handleStartGame` re-creates
  // everything from the ScenarioMap on game start.
  if (s.phase === GamePhase.Lobby) return { ok: true };

  if (!s.spawnColorActivation || typeof s.spawnColorActivation !== 'object') {
    return { ok: false, reason: 'missing spawnColorActivation (pre-Phase F save)' };
  }
  if (!Array.isArray(s.epicDeck)) {
    return { ok: false, reason: 'missing epicDeck array (pre-Phase F save)' };
  }
  if (!Array.isArray(s.epicDiscard)) {
    return { ok: false, reason: 'missing epicDiscard array (pre-Phase F save)' };
  }

  if (Array.isArray(s.objectives)) {
    for (const raw of s.objectives) {
      if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: 'objective entry is not an object' };
      }
      const obj = raw as Record<string, unknown>;
      if (typeof obj.type !== 'string') {
        return { ok: false, reason: 'objective missing string type discriminator' };
      }
      // Pre-change shape carried `targetId: string` as a flat bag for
      // ZoneId | ZombieType | ItemName. Phase A removed it.
      if ('targetId' in obj) {
        return { ok: false, reason: 'legacy objective shape with targetId (pre-Phase F save)' };
      }
    }
  }

  // EquipmentCard.equipmentId — registry key, added post-launch and used by
  // CollectItems matching, food consumption, and Epic crate awards. Saves
  // that predate it can't drive these features and aren't migrated forward
  // (see feedback_no_backward_compat). Reject so the room evicts and starts
  // clean instead of silently dispatching to "cannot be used" branches.
  const cardArrays: Array<[string, unknown]> = [
    ['equipmentDeck', s.equipmentDeck],
    ['equipmentDiscard', s.equipmentDiscard],
    ['epicDeck', s.epicDeck],
    ['epicDiscard', s.epicDiscard],
  ];
  for (const [field, arr] of cardArrays) {
    if (!Array.isArray(arr)) continue;
    for (const card of arr) {
      const reason = checkCardEquipmentId(card, field);
      if (reason) return { ok: false, reason };
    }
  }

  if (s.survivors && typeof s.survivors === 'object') {
    for (const survivor of Object.values(s.survivors as Record<string, unknown>)) {
      if (!survivor || typeof survivor !== 'object') continue;
      const inv = (survivor as Record<string, unknown>).inventory;
      if (!Array.isArray(inv)) continue;
      for (const card of inv) {
        const reason = checkCardEquipmentId(card, 'survivor.inventory');
        if (reason) return { ok: false, reason };
      }
    }
  }

  return { ok: true };
}

function checkCardEquipmentId(card: unknown, where: string): string | null {
  if (!card || typeof card !== 'object') return null;
  const c = card as Record<string, unknown>;
  if (typeof c.equipmentId !== 'string' || c.equipmentId.length === 0) {
    const id = typeof c.id === 'string' ? c.id : '<unknown>';
    return `card ${id} in ${where} missing equipmentId (pre-equipmentId save)`;
  }
  return null;
}
