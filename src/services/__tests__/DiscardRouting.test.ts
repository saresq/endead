// One discard helper (DeckService.discard) routes by card id prefix, because
// the ids already say which deck a card came from: `card-start-*` is dealt
// starting equipment that was never in the Equipment deck, `epic-*` belongs to
// the Epic deck, everything else to the Equipment deck.
//
// Before this, every discard site pushed straight to `equipmentDiscard`, so a
// reshuffle dealt starting equipment and Epic weapons out of the Equipment
// deck. The reshuffle case is the one that corrupts a game, so it is locked
// here too.

import { describe, it, expect } from 'vitest';
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { handleResolveSearch } from '../handlers/ItemHandlers';
import { handleSurvivorDeath } from '../handlers/handlerUtils';
import { makeState, makeZone, makeSurvivor, makeCard } from './winConditionHelpers';

const EPIC_ID = 'epic-ma_deuce-0';
const START_ID = 'card-start-pistol-0';
const PLAIN_ID = 'card-pistol-3';

function card(id: string): EquipmentCard {
  return makeCard({ id, equipmentId: id.split('-').slice(1, -1).join('-'), slot: 'BACKPACK_0' });
}

function stateWith(inventory: EquipmentCard[], drawnCard?: EquipmentCard): GameState {
  return makeState({
    zones: { z1: makeZone({ id: 'z1' }) },
    survivors: { s1: makeSurvivor({ zoneId: 'z1', inventory, drawnCard }) },
  });
}

describe('discard routing by card id prefix', () => {
  it('sends an Epic card to the Epic discard and never to the Equipment discard', () => {
    const state = stateWith([card(EPIC_ID)]);
    const next = EquipmentManager.discardCard(state, 's1', EPIC_ID);

    expect(next.epicDiscard.map(c => c.id)).toEqual([EPIC_ID]);
    expect(next.equipmentDiscard).toHaveLength(0);
  });

  it('takes starting equipment out of play entirely', () => {
    const state = stateWith([card(START_ID)]);
    const next = EquipmentManager.discardCard(state, 's1', START_ID);

    expect(next.equipmentDiscard).toHaveLength(0);
    expect(next.epicDiscard).toHaveLength(0);
    expect(next.survivors.s1.inventory).toHaveLength(0);
  });

  it('sends ordinary equipment to the Equipment discard', () => {
    const state = stateWith([card(PLAIN_ID)]);
    const next = EquipmentManager.discardCard(state, 's1', PLAIN_ID);

    expect(next.equipmentDiscard.map(c => c.id)).toEqual([PLAIN_ID]);
  });
});

describe('every discard source routes the same way', () => {
  it('a swap of the drawn card discards the replaced card by its own prefix', () => {
    const state = stateWith([card(START_ID)], card(PLAIN_ID));
    const next = EquipmentManager.swapDrawnCard(state, 's1', START_ID);

    expect(next.survivors.s1.inventory.map(c => c.id)).toEqual([PLAIN_ID]);
    expect(next.equipmentDiscard).toHaveLength(0);
  });

  it('skipping a drawn Epic card sends it to the Epic discard', () => {
    const state = stateWith([], card(EPIC_ID));
    const next = handleResolveSearch(state, {
      type: ActionType.RESOLVE_SEARCH, playerId: 'p1', survivorId: 's1',
      payload: { action: 'DISCARD' },
    } as ActionRequest);

    expect(next.epicDiscard.map(c => c.id)).toEqual([EPIC_ID]);
    expect(next.equipmentDiscard).toHaveLength(0);
  });

  it('a dying survivor drops each card into the pile that card belongs to', () => {
    const state = stateWith([card(EPIC_ID), card(START_ID), card(PLAIN_ID)]);
    handleSurvivorDeath(state, 's1');

    expect(state.epicDiscard.map(c => c.id)).toEqual([EPIC_ID]);
    expect(state.equipmentDiscard.map(c => c.id)).toEqual([PLAIN_ID]);
    expect(state.survivors.s1.inventory).toHaveLength(0);
  });
});

describe('reshuffle', () => {
  it('refills the Equipment deck with no starting equipment and no Epic card', () => {
    const state = stateWith([card(EPIC_ID), card(START_ID), card(PLAIN_ID)]);
    handleSurvivorDeath(state, 's1');
    state.equipmentDeck = [];

    const { card: drawn, newState } = DeckService.drawCard(state);

    expect(drawn!.id).toBe(PLAIN_ID);
    const inDeck = [...newState.equipmentDeck.map(c => c.id), drawn!.id];
    expect(inDeck.some(id => id.startsWith('card-start-'))).toBe(false);
    expect(inDeck.some(id => id.startsWith('epic-'))).toBe(false);
  });
});
