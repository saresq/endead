import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_CARDS,
  EPIC_EQUIPMENT_CARDS,
  INITIAL_DECK_CONFIG,
  INITIAL_EPIC_DECK_CONFIG,
  EPIC_CRATE_LIMIT,
} from '../../config/EquipmentRegistry';

// RULEBOOK §14 — Standard Equipment deck (45 cards, blue backs).
// Starting Equipment (Baseball Bat, Crowbar×3, Fire Axe×3, Pistol×3) is
// dealt at setup from a separate grey-back deck and is NOT part of this
// deck. The Standard deck carries Crowbar×1 and Fire Axe×1 — distinct
// from starting equipment.
const EXPECTED_STANDARD_COUNTS: Record<string, number> = {
  fire_axe: 1,
  crowbar: 1,
  chainsaw: 2,
  katana: 2,
  kukri: 2,
  machete: 4,
  pistol: 1,
  sawed_off: 4,
  shotgun: 2,
  sub_mg: 2,
  sniper_rifle: 2,
  molotov: 4,
  flashlight: 2,
  plenty_of_bullets: 3,
  plenty_of_shells: 3,
  bag_of_rice: 2,
  canned_food: 2,
  water: 2,
  aaahh: 4,
};

// RULEBOOK §14 — Epic Weapons deck (11 cards, red backs). Aaahh!! ×2,
// every other card ×1.
const EXPECTED_EPIC_COUNTS: Record<string, number> = {
  aaahh_epic: 2,
  army_sniper_rifle: 1,
  automatic_shotgun: 1,
  evil_twins: 1,
  golden_ak47: 1,
  golden_kukri: 1,
  gunblade: 1,
  mas_shotgun: 1,
  nailbat: 1,
  zantetsuken: 1,
};

function tally(deck: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of deck) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

describe('Equipment deck audit — RULEBOOK §14 regression guard', () => {
  it('Standard deck has 45 cards', () => {
    expect(INITIAL_DECK_CONFIG.length).toBe(45);
  });

  it('Standard deck has expected per-card counts', () => {
    expect(tally(INITIAL_DECK_CONFIG)).toEqual(EXPECTED_STANDARD_COUNTS);
  });

  it('Epic deck has 11 cards', () => {
    expect(INITIAL_EPIC_DECK_CONFIG.length).toBe(11);
  });

  it('Epic deck has expected per-card counts', () => {
    expect(tally(INITIAL_EPIC_DECK_CONFIG)).toEqual(EXPECTED_EPIC_COUNTS);
  });

  it('every Standard deck id resolves to a card in EQUIPMENT_CARDS', () => {
    for (const id of INITIAL_DECK_CONFIG) {
      expect(EQUIPMENT_CARDS[id], `missing registry entry for ${id}`).toBeDefined();
    }
  });

  it('every Epic deck id resolves to a card in EPIC_EQUIPMENT_CARDS', () => {
    for (const id of INITIAL_EPIC_DECK_CONFIG) {
      expect(EPIC_EQUIPMENT_CARDS[id], `missing epic registry entry for ${id}`).toBeDefined();
    }
  });

  it('EPIC_CRATE_LIMIT matches Epic deck size (1 crate per card)', () => {
    expect(EPIC_CRATE_LIMIT).toBe(INITIAL_EPIC_DECK_CONFIG.length);
  });

  it('Sub-MG display name uses the rulebook hyphenation', () => {
    expect(EQUIPMENT_CARDS['sub_mg'].name).toBe('Sub-MG');
  });

  it('Sniper Rifle is keyed as `sniper_rifle` (not legacy `rifle`)', () => {
    expect(EQUIPMENT_CARDS['sniper_rifle']).toBeDefined();
    expect((EQUIPMENT_CARDS as Record<string, unknown>)['rifle']).toBeUndefined();
    expect(EQUIPMENT_CARDS['sniper_rifle'].name).toBe('Sniper Rifle');
  });

  it('Aaahh!! is intentionally duplicated across Standard and Epic decks', () => {
    expect(EQUIPMENT_CARDS['aaahh']).toBeDefined();
    expect(EPIC_EQUIPMENT_CARDS['aaahh_epic']).toBeDefined();
    expect(EQUIPMENT_CARDS['aaahh'].name).toBe('Aaahh!!');
    expect(EPIC_EQUIPMENT_CARDS['aaahh_epic'].name).toBe('Aaahh!!');
  });
});
