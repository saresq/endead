import { describe, it, expect } from 'vitest';
import { weaponOptions, isLoadoutComplete } from '../ui/lobbyLoadout';

type Player = { id: string; name: string; ready: boolean; characterClass: string; startingWeapon?: string };

const player = (id: string, weapon?: string, characterClass = 'Wanda'): Player =>
  ({ id, name: id, ready: false, characterClass, startingWeapon: weapon });

describe('weaponOptions', () => {
  it('lists each distinct starting weapon once with its supply', () => {
    const options = weaponOptions([player('p1')], 'p1');

    expect(options.map(o => o.equipmentId)).toEqual(['baseball_bat', 'crowbar', 'fire_axe', 'pistol']);
    expect(options.find(o => o.equipmentId === 'pistol')!.total).toBe(3);
    expect(options.find(o => o.equipmentId === 'fire_axe')!.total).toBe(1);
  });

  it('counts other players claims against what is left', () => {
    const options = weaponOptions([player('p1'), player('p2', 'pistol')], 'p1');

    expect(options.find(o => o.equipmentId === 'pistol')!.remaining).toBe(2);
  });

  it('does not count the local player own claim against them', () => {
    const options = weaponOptions([player('p1', 'fire_axe')], 'p1');
    const axe = options.find(o => o.equipmentId === 'fire_axe')!;

    expect(axe.remaining).toBe(1);
    expect(axe.mine).toBe(true);
  });

  it('leaves a weapon at zero once every copy is claimed by others', () => {
    const claimed = [player('p1'), player('p2', 'pistol'), player('p3', 'pistol'), player('p4', 'pistol')];

    expect(weaponOptions(claimed, 'p1').find(o => o.equipmentId === 'pistol')!.remaining).toBe(0);
  });

  it('carries a card the item renderer can draw', () => {
    const axe = weaponOptions([player('p1')], 'p1').find(o => o.equipmentId === 'fire_axe')!;

    expect(axe.card.equipmentId).toBe('fire_axe');
    expect(axe.card.canOpenDoor).toBe(true);
    expect(axe.card.stats?.damage).toBe(2);
  });
});

describe('isLoadoutComplete', () => {
  it('needs both a survivor and a weapon', () => {
    expect(isLoadoutComplete(player('p1'))).toBe(false);
    expect(isLoadoutComplete({ ...player('p1'), characterClass: '' })).toBe(false);
    expect(isLoadoutComplete({ ...player('p1', 'crowbar'), characterClass: '' })).toBe(false);
    expect(isLoadoutComplete(player('p1', 'crowbar'))).toBe(true);
  });
});
