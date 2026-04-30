import { describe, it, expect } from 'vitest';
import { GamePhase, ObjectiveColor } from '../../types/GameState';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { makeState, makeZone, makeSurvivor } from './winConditionHelpers';

function setup() {
  return makeState({
    turn: 1,
    phase: GamePhase.Zombies,
    zones: {
      street: makeZone({ id: 'street', spawnPoint: true }),
      blueZone: makeZone({ id: 'blueZone', spawnPoint: true, spawnColor: ObjectiveColor.Blue }),
    },
    spawnZoneIds: ['street', 'blueZone'],
    survivors: { s1: makeSurvivor({ zoneId: 'street' }) },
    // Blue Objective taken on turn 1.
    spawnColorActivation: {
      [ObjectiveColor.Blue]: { activated: true, activatedOnTurn: 1 },
      [ObjectiveColor.Green]: { activated: false, activatedOnTurn: 0 },
    },
    seedString: 'spawn-dormancy-timing',
  });
}

describe('SpawnDormancy — RULEBOOK §9 timing gate', () => {
  it('activated on turn N → does NOT spawn during turn N’s Zombie Phase, DOES spawn on turn N+1', () => {
    let state = setup();
    expect(state.turn).toBe(1);

    // Turn 1's Zombie Phase: state.turn === 1, activatedOnTurn === 1, gate is strict-greater → skip blue.
    state = ZombiePhaseManager.executeZombiePhase(state);
    const turn1Cards = state.spawnContext?.cards ?? [];
    const turn1Zones = turn1Cards.map(c => c.zoneId);
    expect(turn1Zones).toContain('street');
    expect(turn1Zones).not.toContain('blueZone');
    // endRound advances the turn counter.
    expect(state.turn).toBe(2);

    // Turn 2's Zombie Phase: state.turn === 2, 2 > 1 → blue zone spawns.
    state = ZombiePhaseManager.executeZombiePhase(state);
    const turn2Cards = state.spawnContext?.cards ?? [];
    const turn2Zones = turn2Cards.map(c => c.zoneId);
    expect(turn2Zones).toContain('street');
    expect(turn2Zones).toContain('blueZone');
    expect(state.turn).toBe(3);
  });

  it('replay determinism — same seed + same activation produces the same spawn-card sequence', () => {
    const runA1 = ZombiePhaseManager.executeZombiePhase(setup());
    const runA2 = ZombiePhaseManager.executeZombiePhase(runA1);

    const runB1 = ZombiePhaseManager.executeZombiePhase(setup());
    const runB2 = ZombiePhaseManager.executeZombiePhase(runB1);

    const flatten = (cards: { zoneId: string; cardId: string }[]) =>
      cards.map(c => `${c.zoneId}:${c.cardId}`);

    expect(flatten(runA2.spawnContext?.cards ?? [])).toEqual(
      flatten(runB2.spawnContext?.cards ?? []),
    );

    // Snapshot should be identical at the level of zombie identity counts.
    const summarize = (zombies: Record<string, { type: string; position: { zoneId: string } }>) =>
      Object.values(zombies)
        .map(z => `${z.position.zoneId}:${z.type}`)
        .sort();
    expect(summarize(runA2.zombies)).toEqual(summarize(runB2.zombies));
  });
});
