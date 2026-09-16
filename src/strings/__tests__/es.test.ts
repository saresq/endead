import { describe, it, expect } from 'vitest';
import { es, plural, equipmentName, skillName, skillDescription, zombieLabel } from '../es';
import { EQUIPMENT_CARDS, EPIC_EQUIPMENT_CARDS } from '../../config/EquipmentRegistry';
import { SKILL_DEFINITIONS } from '../../config/SkillRegistry';
import { CHARACTER_DEFINITIONS } from '../../config/CharacterRegistry';
import { DangerLevel, EquipmentType, ZombieType } from '../../types/GameState';
import { ActionType } from '../../types/Action';

function missing(ids: string[], table: Record<string, unknown>): string[] {
  return ids.filter(id => !table[id]);
}

describe('es strings coverage', () => {
  it('has a name for every equipment id', () => {
    const ids = [...Object.keys(EQUIPMENT_CARDS), ...Object.keys(EPIC_EQUIPMENT_CARDS)];
    expect(missing(ids, es.equipment)).toEqual([]);
  });

  it('has a name and description for every skill id', () => {
    const ids = Object.keys(SKILL_DEFINITIONS);
    expect(missing(ids, es.skills)).toEqual([]);
    expect(ids.filter(id => !es.skills[id]?.name || !es.skills[id]?.description)).toEqual([]);
  });

  it('has labels for every zombie type, danger level, item type and slot', () => {
    expect(missing(Object.values(ZombieType), es.zombies)).toEqual([]);
    expect(missing(Object.values(DangerLevel), es.danger)).toEqual([]);
    expect(missing(Object.values(EquipmentType), es.itemTypes)).toEqual([]);
    const slotIds = ['HAND_1', 'HAND_2', 'BACKPACK', 'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2', 'DISCARD'];
    expect(missing(slotIds, es.slots)).toEqual([]);
  });

  it('has a label for every action type and a role for every character', () => {
    expect(missing(Object.values(ActionType), es.actions)).toEqual([]);
    expect(missing(Object.keys(CHARACTER_DEFINITIONS), es.roles)).toEqual([]);
  });
});

describe('es helpers', () => {
  it('plural picks the singular only for 1', () => {
    expect(plural(1, 'zombi', 'zombis')).toBe('zombi');
    expect(plural(0, 'zombi', 'zombis')).toBe('zombis');
    expect(plural(3, 'zombi', 'zombis')).toBe('zombis');
  });

  it('equipmentName resolves by id and falls back to card name', () => {
    expect(equipmentName({ equipmentId: 'fire_axe', name: 'Fire Axe' })).toBe('Hacha de bombero');
    expect(equipmentName({ name: 'Mystery' })).toBe('Mystery');
    expect(equipmentName({ equipmentId: 'unknown', name: 'Mystery' })).toBe('Mystery');
  });

  it('skill and zombie accessors format', () => {
    expect(skillName('lucky')).toBe('Suertudo');
    expect(skillDescription('lucky')).toMatch(/volver a tirar/);
    expect(zombieLabel(ZombieType.Walker, 1)).toBe('Caminante');
    expect(zombieLabel(ZombieType.Walker, 2)).toBe('Caminantes');
    expect(zombieLabel(ZombieType.Abomination)).toBe('Abominación');
  });

  it('value functions format', () => {
    expect(es.zones.street(1, 2)).toBe('Zona de calle (1, 2)');
    expect(es.zones.spawn(3)).toBe('Aparición 3');
    expect(es.common.actions(1)).toBe('1 acción');
    expect(es.common.actions(3)).toBe('3 acciones');
  });
});
