
import { GameState, EquipmentCard } from '../../types/GameState';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { ActionRequest, ActionType } from '../../types/Action';
import { es } from '../../strings/es';

export function handleTradeStart(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  if (!targetSurvivorId) throw new Error(es.errors.chooseSurvivor);
  if (state.activeTrade) throw new Error(es.errors.tradeActive);

  const newState = structuredClone(state);
  const active = newState.survivors[survivorId];
  const target = newState.survivors[targetSurvivorId];

  // Validation
  if (!target) throw new Error('Target not found');
  if (target.wounds >= target.maxHealth) throw new Error(es.errors.tradePartnerDead);
  if (active.position.zoneId !== target.position.zoneId) throw new Error(es.errors.sameZone);
  if (active.actionsRemaining < 1) throw new Error(es.errors.noActions);

  // Init Session
  newState.activeTrade = {
    activeSurvivorId: survivorId,
    targetSurvivorId: targetSurvivorId,
    offers: {
      [survivorId]: [],
      [targetSurvivorId]: []
    },
    receiveLayouts: {
      [survivorId]: {},
      [targetSurvivorId]: {}
    },
    status: {
      [survivorId]: false,
      [targetSurvivorId]: false
    }
  };

  return newState;
}

export function handleTradeOffer(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) throw new Error(es.errors.noTrade);

  const survivorId = intent.survivorId!;
  const offerIds = intent.payload?.offerCardIds as string[];

  if (!offerIds) throw new Error('Offer IDs required');

  const newState = structuredClone(state);
  const trade = newState.activeTrade!;

  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error(es.errors.notInTrade);
  }

  const survivor = newState.survivors[survivorId];
  const inventoryIds = survivor.inventory.map((c: EquipmentCard) => c.id);
  const allOwned = offerIds.every((id: string) => inventoryIds.includes(id));

  if (!allOwned) throw new Error(es.errors.offerOwnItems);

  trade.offers[survivorId] = offerIds;
  trade.status[trade.activeSurvivorId] = false;
  trade.status[trade.targetSurvivorId] = false;

  return newState;
}

export function handleTradeAccept(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) throw new Error(es.errors.noTrade);

  const survivorId = intent.survivorId!;
  const newState = structuredClone(state);
  const trade = newState.activeTrade!;

  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error(es.errors.notInTrade);
  }

  // Check for receiveLayout in payload
  if (intent.payload?.receiveLayout) {
      trade.receiveLayouts = trade.receiveLayouts || {};
      trade.receiveLayouts[survivorId] = intent.payload.receiveLayout;
  }

  trade.status[survivorId] = true;

  const s1 = trade.activeSurvivorId;
  const s2 = trade.targetSurvivorId;

  if (trade.status[s1] && trade.status[s2]) {
      return executeTrade(newState);
  }

  return newState;
}

export function handleTradeCancel(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) return state;

  const newState = structuredClone(state);
  delete newState.activeTrade;
  return newState;
}

export function executeTrade(state: GameState): GameState {
  const newState = structuredClone(state) as GameState;
  const session = newState.activeTrade!;
  const id1 = session.activeSurvivorId;
  const id2 = session.targetSurvivorId;

  const s1 = newState.survivors[id1];
  const s2 = newState.survivors[id2];

  if (s1.wounds >= s1.maxHealth || s2.wounds >= s2.maxHealth) {
    throw new Error(es.errors.tradePartnerDead);
  }

  const offer1 = session.offers[id1] || [];
  const offer2 = session.offers[id2] || [];

  const layout1 = session.receiveLayouts?.[id1] || {};
  const layout2 = session.receiveLayouts?.[id2] || {};

  const keep1 = s1.inventory.filter((c: any) => !offer1.includes(c.id));
  const keep2 = s2.inventory.filter((c: any) => !offer2.includes(c.id));

  const cards1 = s1.inventory.filter((c: any) => offer1.includes(c.id));
  const cards2 = s2.inventory.filter((c: any) => offer2.includes(c.id));

  // A received card must say where it goes. Defaulting to BACKPACK_0 is how an
  // illegal inventory got built in the first place, so a missing slot is a
  // rejection instead.
  const place = (cards: EquipmentCard[], layout: Record<string, string>) => cards.map((c): EquipmentCard => {
      const targetSlot = layout[c.id];
      if (!targetSlot) throw new Error(es.errors.tradeNoSlot);
      const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
      return { ...c, slot: targetSlot as EquipmentCard['slot'], inHand };
  });

  const toS2All = place(cards1, layout2);
  const toS2 = toS2All.filter(c => c.slot !== 'DISCARD');
  const discardedFromS1 = toS2All.filter(c => c.slot === 'DISCARD');

  const toS1All = place(cards2, layout1);
  const toS1 = toS1All.filter(c => c.slot !== 'DISCARD');
  const discardedFromS2 = toS1All.filter(c => c.slot === 'DISCARD');

  // Keep items but remove if they were moved to DISCARD
  const processInventory = (inventory: EquipmentCard[], layout: Record<string, string>, discardedOut: EquipmentCard[]): EquipmentCard[] => {
      return inventory.map((c): EquipmentCard => {
          const targetSlot = layout[c.id] as EquipmentCard['slot'] | undefined;
          if (!targetSlot) return c;
          if (targetSlot === 'DISCARD') {
              discardedOut.push({ ...c, slot: 'DISCARD' });
              return { ...c, slot: 'DISCARD' };
          }
          return { ...c, slot: targetSlot, inHand: targetSlot === 'HAND_1' || targetSlot === 'HAND_2' };
      }).filter(c => c.slot !== 'DISCARD');
  };

  const discardedOwned: EquipmentCard[] = [];
  s1.inventory = [...processInventory(keep1, layout1, discardedOwned), ...toS1];
  s2.inventory = [...processInventory(keep2, layout2, discardedOwned), ...toS2];

  // Both sides must end up legal, or nobody trades: the thrown error leaves
  // this clone unused and the live state untouched.
  const illegal = EquipmentManager.validateLoadout(s1.inventory)
    ?? EquipmentManager.validateLoadout(s2.inventory);
  if (illegal) throw new Error(illegal);

  // Route every discarded item to the pile its deck owns
  for (const card of [...discardedFromS1, ...discardedFromS2, ...discardedOwned]) {
      DeckService.discard(newState, card);
  }

  if (s1.actionsRemaining > 0) s1.actionsRemaining -= 1;

  delete newState.activeTrade;

  newState.history.push({
    playerId: 'system',
    survivorId: id1,
    actionType: 'TRADE_COMPLETE',
    timestamp: Date.now(),
    payload: { partner: id2, items1: offer1.length, items2: offer2.length }
  });

  return newState;
}
