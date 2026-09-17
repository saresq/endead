import { describe, it, expect } from 'vitest';
import { assignBuildings } from '../ScenarioCompiler';
import { handleOpenDoor } from '../handlers/DoorHandlers';
import { ActionType } from '../../types/Action';
import { DangerLevel, EquipmentType, EquipmentCard, GameState, SpawnCard, Zone, ZombieType } from '../../types/GameState';
import { makeState, makeZone, makeSurvivor } from './winConditionHelpers';
import { es } from '../../strings/es';

function opener(): EquipmentCard {
  return {
    id: 'crowbar-1',
    equipmentId: 'crowbar',
    name: 'Crowbar',
    type: EquipmentType.Weapon,
    canOpenDoor: true,
    openDoorNoise: false,
    inHand: true,
  };
}

const walkerCard: SpawnCard = {
  id: 'spawn-test',
  [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
  [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
  [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 2 } },
  [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 2 } },
};

/**
 *   home (dark building) |door| street |door| shop (dark building)
 * Survivors start inside `home`.
 */
function board(): GameState {
  const zones: Record<string, Zone> = {
    home: makeZone({
      id: 'home', isBuilding: true, isDark: true, searchable: true,
      connections: [{ toZoneId: 'street', hasDoor: true, doorOpen: false }],
    }),
    street: makeZone({
      id: 'street',
      connections: [
        { toZoneId: 'home', hasDoor: true, doorOpen: false },
        { toZoneId: 'shop', hasDoor: true, doorOpen: false },
      ],
    }),
    shop: makeZone({
      id: 'shop', isBuilding: true, isDark: true, searchable: true,
      connections: [{ toZoneId: 'street', hasDoor: true, doorOpen: false }],
    }),
  };
  assignBuildings(zones, 'home');

  const state = makeState({
    zones,
    survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'home', inventory: [opener()] }) },
  });
  state.spawnDeck = [walkerCard, { ...walkerCard, id: 'spawn-test-2' }];
  return state;
}

const openDoor = (state: GameState, targetZoneId: string) =>
  handleOpenDoor(state, { playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId } });

describe('The starting building does not spawn (D7)', () => {
  it('marks the building holding the player start as already spawned', () => {
    expect(board().zones.home.hasBeenSpawned).toBe(true);
    expect(board().zones.shop.hasBeenSpawned).toBe(false);
  });

  it('spawns nothing when survivors open the building they started in', () => {
    const state = board();
    state.survivors.s1.position.zoneId = 'street';

    const next = openDoor(state, 'home');

    expect(Object.keys(next.zombies)).toHaveLength(0);
    expect(next.lastAction?.description).toBe(es.log.doorOpened(false));
  });

  it('another building still spawns, and only once', () => {
    let state = board();
    state.survivors.s1.position.zoneId = 'street';

    state = openDoor(state, 'shop');
    expect(Object.keys(state.zombies)).toHaveLength(2);
    expect(state.zones.shop.hasBeenSpawned).toBe(true);

    // Reopen the same building: the door is open now, so re-close it to retry.
    state.zones.street.connections[1].doorOpen = false;
    state.zones.shop.connections[0].doorOpen = false;
    const again = openDoor(state, 'shop');
    expect(Object.keys(again.zombies)).toHaveLength(2);
  });

  it('reports the drawn card in the spawn context (D11)', () => {
    const state = board();
    state.survivors.s1.position.zoneId = 'street';

    const next = openDoor(state, 'shop');

    expect(next.spawnContext?.cards).toMatchObject([
      { zoneId: 'shop', cardId: 'spawn-test', dangerLevel: DangerLevel.Blue },
    ]);
  });
});

describe('Buildings open at the start never spawn (Rule 302)', () => {
  it('a doorway straight to the street counts as open', () => {
    const zones: Record<string, Zone> = {
      street: makeZone({
        id: 'street',
        connections: [
          { toZoneId: 'lobbyRoom', hasDoor: false, doorOpen: true },
          { toZoneId: 'backRoom', hasDoor: true, doorOpen: false },
        ],
      }),
      lobbyRoom: makeZone({
        id: 'lobbyRoom', isBuilding: true,
        connections: [
          { toZoneId: 'street', hasDoor: false, doorOpen: true },
          { toZoneId: 'backRoom', hasDoor: false, doorOpen: true },
        ],
      }),
      backRoom: makeZone({
        id: 'backRoom', isBuilding: true, isDark: true,
        connections: [
          { toZoneId: 'lobbyRoom', hasDoor: false, doorOpen: true },
          { toZoneId: 'street', hasDoor: true, doorOpen: false },
        ],
      }),
    };
    assignBuildings(zones, 'street');

    expect(zones.lobbyRoom.hasBeenSpawned).toBe(true);
    expect(zones.backRoom.hasBeenSpawned).toBe(true);
    expect(zones.lobbyRoom.buildingId).toBe(zones.backRoom.buildingId);
  });
});
