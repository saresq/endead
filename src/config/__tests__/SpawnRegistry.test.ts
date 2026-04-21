import { describe, test, expect } from 'vitest';
import { SPAWN_CARDS } from '../SpawnRegistry';
import { DangerLevel, ZombieType } from '../../types/GameState';

describe('Spawn deck (RULEBOOK §15)', () => {
  test('contains exactly 40 cards', () => {
    expect(SPAWN_CARDS).toHaveLength(40);
  });

  test('card IDs are spawn-001 through spawn-040', () => {
    const ids = SPAWN_CARDS.map(c => c.id);
    const expected = Array.from({ length: 40 }, (_, i) =>
      `spawn-${String(i + 1).padStart(3, '0')}`
    );
    expect(ids).toEqual(expected);
  });

  test('cards #001-#018 have no Abomination at Blue', () => {
    for (let i = 0; i < 18; i++) {
      const card = SPAWN_CARDS[i];
      const blue = card[DangerLevel.Blue];
      const abomCount = blue.zombies?.[ZombieType.Abomination] ?? 0;
      expect(abomCount).toBe(0);
    }
  });

  test('cards #037-#040 are Extra Activation (no spawn, no effect at Blue)', () => {
    for (let i = 36; i < 40; i++) {
      const card = SPAWN_CARDS[i];

      const blue = card[DangerLevel.Blue];
      expect(blue.extraActivation).toBeUndefined();
      const blueZombies = Object.values(blue.zombies ?? {}).reduce((s, n) => s + (n ?? 0), 0);
      expect(blueZombies).toBe(0);

      for (const lvl of [DangerLevel.Yellow, DangerLevel.Orange, DangerLevel.Red]) {
        const detail = card[lvl];
        expect(detail.extraActivation).toBeDefined();
        const spawnCount = Object.values(detail.zombies ?? {}).reduce((s, n) => s + (n ?? 0), 0);
        expect(spawnCount).toBe(0);
      }
    }
  });

  test('Extra Activation distribution: 2x Walker, 1x Runner, 1x Brute', () => {
    const types = SPAWN_CARDS.slice(36, 40).map(c => c[DangerLevel.Yellow].extraActivation);
    const counts: Partial<Record<ZombieType, number>> = {};
    for (const t of types) {
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts[ZombieType.Walker]).toBe(2);
    expect(counts[ZombieType.Runner]).toBe(1);
    expect(counts[ZombieType.Brute]).toBe(1);
    expect(counts[ZombieType.Abomination] ?? 0).toBe(0);
  });

  test('no rush flag appears in the canonical deck', () => {
    for (const card of SPAWN_CARDS) {
      for (const lvl of [DangerLevel.Blue, DangerLevel.Yellow, DangerLevel.Orange, DangerLevel.Red]) {
        expect(card[lvl].rush).toBeFalsy();
      }
    }
  });
});
