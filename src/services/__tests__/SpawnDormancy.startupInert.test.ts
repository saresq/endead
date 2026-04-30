import { describe, it, expect } from 'vitest';
import { GamePhase, ObjectiveColor } from '../../types/GameState';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { makeState, makeZone, makeSurvivor } from './winConditionHelpers';

describe('SpawnDormancy — startup inertness', () => {
  it('at game start, dormant blue/green zones produce no spawns', () => {
    const state = makeState({
      turn: 1,
      phase: GamePhase.Zombies,
      zones: {
        street: makeZone({ id: 'street', spawnPoint: true }),
        blue: makeZone({ id: 'blue', spawnPoint: true, spawnColor: ObjectiveColor.Blue }),
        green: makeZone({ id: 'green', spawnPoint: true, spawnColor: ObjectiveColor.Green }),
      },
      spawnZoneIds: ['street', 'blue', 'green'],
      survivors: { s1: makeSurvivor({ zoneId: 'street' }) },
      // No activation yet — both colors dormant (default).
      seedString: 'spawn-dormancy-startup',
    });

    const after = ZombiePhaseManager.executeZombiePhase(state);
    const zoneIds = (after.spawnContext?.cards ?? []).map(c => c.zoneId);

    expect(zoneIds).toContain('street');
    expect(zoneIds).not.toContain('blue');
    expect(zoneIds).not.toContain('green');

    // No zombies should have been placed in either dormant zone.
    const placedZones = Object.values(after.zombies).map(z => z.position.zoneId);
    expect(placedZones).not.toContain('blue');
    expect(placedZones).not.toContain('green');
  });

  it('spawn ordering in spawnZoneIds is preserved (dormant zones are skipped, not removed)', () => {
    const state = makeState({
      turn: 1,
      phase: GamePhase.Zombies,
      zones: {
        street: makeZone({ id: 'street', spawnPoint: true }),
        blue: makeZone({ id: 'blue', spawnPoint: true, spawnColor: ObjectiveColor.Blue }),
        street2: makeZone({ id: 'street2', spawnPoint: true }),
      },
      spawnZoneIds: ['street', 'blue', 'street2'],
      survivors: { s1: makeSurvivor({ zoneId: 'street' }) },
      seedString: 'spawn-dormancy-order',
    });

    const after = ZombiePhaseManager.executeZombiePhase(state);
    expect(after.spawnZoneIds).toEqual(['street', 'blue', 'street2']);

    // Blue is skipped on turn 1, but the always-on zones around it still spawn,
    // and the relative iteration order (street before street2) is preserved.
    const cardZones = (after.spawnContext?.cards ?? [])
      .map(c => c.zoneId)
      .filter(id => id !== 'blue');
    expect(cardZones).toEqual(['street', 'street2']);
  });

  it('once activated, dormant zone joins spawn order on the following turn without re-ordering', () => {
    let state = makeState({
      turn: 1,
      phase: GamePhase.Zombies,
      zones: {
        street: makeZone({ id: 'street', spawnPoint: true }),
        blue: makeZone({ id: 'blue', spawnPoint: true, spawnColor: ObjectiveColor.Blue }),
      },
      spawnZoneIds: ['street', 'blue'],
      survivors: { s1: makeSurvivor({ zoneId: 'street' }) },
      // Pretend the player took the blue Objective last turn.
      spawnColorActivation: {
        [ObjectiveColor.Blue]: { activated: true, activatedOnTurn: 0 },
        [ObjectiveColor.Green]: { activated: false, activatedOnTurn: 0 },
      },
      seedString: 'spawn-dormancy-activated',
    });

    state = ZombiePhaseManager.executeZombiePhase(state);
    const cardZones = (state.spawnContext?.cards ?? []).map(c => c.zoneId);
    // street comes before blue in spawnZoneIds → same order in the spawn step.
    expect(cardZones[0]).toBe('street');
    expect(cardZones).toContain('blue');
  });
});
