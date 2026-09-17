import { describe, test, expect } from 'vitest';
import { SPAWN_CARDS } from '../SpawnRegistry';
import { DangerLevel, SpawnCard, ZombieType } from '../../types/GameState';

const LEVELS = [DangerLevel.Blue, DangerLevel.Yellow, DangerLevel.Orange, DangerLevel.Red];

/** The single zombie type a card spawns, or undefined for Extra Activation. */
function cardType(card: SpawnCard): ZombieType | undefined {
  for (const level of LEVELS) {
    const types = Object.keys(card[level].zombies ?? {}) as ZombieType[];
    if (types.length > 0) return types[0];
  }
  return undefined;
}

const amounts = (card: SpawnCard) =>
  LEVELS.map(level => Object.values(card[level].zombies ?? {}).reduce((sum, n) => sum + (n ?? 0), 0));

const isRush = (card: SpawnCard) => LEVELS.some(level => card[level].rush);
const cardsOfType = (type: ZombieType) => SPAWN_CARDS.filter(c => cardType(c) === type);

describe('Spawn deck (rules/16-card-registry.md#zombie-deck-40-cards)', () => {
  test('contains exactly 40 cards, numbered spawn-001 through spawn-040', () => {
    expect(SPAWN_CARDS).toHaveLength(40);
    expect(SPAWN_CARDS.map(c => c.id)).toEqual(
      Array.from({ length: 40 }, (_, i) => `spawn-${String(i + 1).padStart(3, '0')}`),
    );
  });

  test('every card names exactly one zombie type', () => {
    for (const card of SPAWN_CARDS) {
      for (const level of LEVELS) {
        expect(Object.keys(card[level].zombies ?? {}).length).toBeLessThanOrEqual(1);
      }
    }
    // One type across the whole card, never two.
    for (const card of SPAWN_CARDS) {
      const types = new Set(
        LEVELS.flatMap(level => Object.keys(card[level].zombies ?? {})),
      );
      expect(types.size).toBeLessThanOrEqual(1);
    }
  });

  test('composition by zombie type', () => {
    expect(cardsOfType(ZombieType.Walker)).toHaveLength(16);
    expect(cardsOfType(ZombieType.Brute)).toHaveLength(8);
    expect(cardsOfType(ZombieType.Runner)).toHaveLength(8);
    expect(cardsOfType(ZombieType.Abomination)).toHaveLength(4);
  });

  test('amounts never decrease as the danger level rises', () => {
    for (const card of SPAWN_CARDS.slice(0, 36)) {
      const perLevel = amounts(card);
      for (let i = 1; i < perLevel.length; i++) {
        expect(perLevel[i], `${card.id} at ${LEVELS[i]}`).toBeGreaterThanOrEqual(perLevel[i - 1]);
      }
    }
  });

  test('cards #001-#018 have no Abomination at Blue; #019-#036 do', () => {
    for (const card of SPAWN_CARDS.slice(0, 18)) {
      expect(card[DangerLevel.Blue].zombies?.[ZombieType.Abomination] ?? 0).toBe(0);
    }
    const hardAbominations = SPAWN_CARDS.slice(18, 36).filter(c => cardType(c) === ZombieType.Abomination);
    expect(hardAbominations).toHaveLength(2);
    for (const card of hardAbominations) {
      expect(card[DangerLevel.Blue].zombies?.[ZombieType.Abomination]).toBe(1);
    }
  });

  test('Rush cards exist, and Runners never have one', () => {
    const rushCards = SPAWN_CARDS.filter(isRush);
    expect(rushCards).toHaveLength(12);
    for (const card of rushCards) {
      expect(cardType(card)).not.toBe(ZombieType.Runner);
      expect(cardType(card)).not.toBe(ZombieType.Abomination);
    }
    // A Rush card rushes at every level where it places zombies.
    for (const card of rushCards) {
      for (const level of LEVELS) {
        const placed = Object.values(card[level].zombies ?? {}).reduce((s, n) => s + (n ?? 0), 0);
        if (placed > 0) expect(card[level].rush).toBe(true);
      }
    }
  });

  test('cards #037-#040 are Extra Activation: 2x Walker, 1x Brute, 1x Runner, none at Blue', () => {
    const extras = SPAWN_CARDS.slice(36, 40);
    const counts: Partial<Record<ZombieType, number>> = {};

    for (const card of extras) {
      expect(card[DangerLevel.Blue].extraActivation).toBeUndefined();
      expect(amounts(card).reduce((s, n) => s + n, 0)).toBe(0);

      for (const level of [DangerLevel.Yellow, DangerLevel.Orange, DangerLevel.Red]) {
        const type = card[level].extraActivation;
        expect(type).toBeDefined();
        if (level === DangerLevel.Yellow && type) counts[type] = (counts[type] ?? 0) + 1;
      }
    }

    expect(counts).toEqual({
      [ZombieType.Walker]: 2,
      [ZombieType.Brute]: 1,
      [ZombieType.Runner]: 1,
    });
  });

  test('the rulebook example card is in the deck (Blue 3 / Yellow 5 / Orange 7 / Red 9 Walkers)', () => {
    const match = SPAWN_CARDS.filter(
      c => cardType(c) === ZombieType.Walker && amounts(c).join(',') === '3,5,7,9',
    );
    expect(match.length).toBeGreaterThan(0);
  });
});
