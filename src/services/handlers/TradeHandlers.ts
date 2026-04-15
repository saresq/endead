
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';

export function handleTradeStart(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  if (!targetSurvivorId) throw new Error('Target survivor required');
  if (state.activeTrade) throw new Error('Trade already active');

  const newState = structuredClone(state);
  const active = newState.survivors[survivorId];
  const target = newState.survivors[targetSurvivorId];

  // Validation
  if (!target) throw new Error('Target not found');
  if (active.position.zoneId !== target.position.zoneId) throw new Error('Must be in same zone');
  if (active.actionsRemaining < 1) throw new Error('Not enough actions');

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
  if (!state.activeTrade) throw new Error('No active trade');

  const survivorId = intent.survivorId!;
  const offerIds = intent.payload?.offerCardIds as string[];

  if (!offerIds) throw new Error('Offer IDs required');

  const newState = structuredClone(state);
  const trade = newState.activeTrade!;

  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error('Not a participant in this trade');
  }

  const survivor = newState.survivors[survivorId];
  const inventoryIds = survivor.inventory.map((c: EquipmentCard) => c.id);
  const allOwned = offerIds.every((id: string) => inventoryIds.includes(id));

  if (!allOwned) throw new Error('Cannot offer items you do not own');

  trade.offers[survivorId] = offerIds;
  trade.status[trade.activeSurvivorId] = false;
  trade.status[trade.targetSurvivorId] = false;

  return newState;
}

export function handleTradeAccept(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) throw new Error('No active trade');

  const survivorId = intent.survivorId!;
  const newState = structuredClone(state);
  const trade = newState.activeTrade!;

  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error('Not a participant');
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

  const offer1 = session.offers[id1] || [];
  const offer2 = session.offers[id2] || [];

  const layout1 = session.receiveLayouts?.[id1] || {};
  const layout2 = session.receiveLayouts?.[id2] || {};

  const keep1 = s1.inventory.filter((c: any) => !offer1.includes(c.id));
  const keep2 = s2.inventory.filter((c: any) => !offer2.includes(c.id));

  const cards1 = s1.inventory.filter((c: any) => offer1.includes(c.id));
  const cards2 = s2.inventory.filter((c: any) => offer2.includes(c.id));

  // Collect discarded cards from traded items going TO Survivor 2 (from S1)
  const toS2All = cards1.map((c: any) => {
      const targetSlot = layout2[c.id] || 'BACKPACK_0';
      const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
      return { ...c, slot: targetSlot, inHand };
  });
  const toS2 = toS2All.filter((c: any) => c.slot !== 'DISCARD');
  const discardedFromS1 = toS2All.filter((c: any) => c.slot === 'DISCARD');

  // Collect discarded cards from traded items going TO Survivor 1 (from S2)
  const toS1All = cards2.map((c: any) => {
      const targetSlot = layout1[c.id] || 'BACKPACK_0';
      const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
      return { ...c, slot: targetSlot, inHand };
  });
  const toS1 = toS1All.filter((c: any) => c.slot !== 'DISCARD');
  const discardedFromS2 = toS1All.filter((c: any) => c.slot === 'DISCARD');

  // Keep items but remove if they were moved to DISCARD
  const processInventory = (inventory: EquipmentCard[], layout: Record<string, string>, discardedOut: EquipmentCard[]) => {
      return inventory.map(c => {
          if (layout[c.id] === 'DISCARD') {
              discardedOut.push({ ...c, slot: 'DISCARD' });
              return { ...c, slot: 'DISCARD' };
          }
          if (layout[c.id]) {
              const targetSlot = layout[c.id];
              const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
              return { ...c, slot: targetSlot, inHand };
          }
          return c;
      }).filter(c => c.slot !== 'DISCARD');
  };

  const discardedOwned: EquipmentCard[] = [];
  s1.inventory = [...processInventory(keep1, layout1, discardedOwned), ...toS1];
  s2.inventory = [...processInventory(keep2, layout2, discardedOwned), ...toS2];

  // Push all discarded items to equipmentDiscard
  for (const card of [...discardedFromS1, ...discardedFromS2, ...discardedOwned]) {
      newState.equipmentDiscard.push(card);
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
