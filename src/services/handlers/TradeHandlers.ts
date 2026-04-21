
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { deductAPWithFreeCheck } from './handlerUtils';
import type { EventCollector } from '../EventCollector';

export function handleTradeStart(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivorId = intent.survivorId!;
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  // --- Validate-first ---
  if (!targetSurvivorId) throw new Error('Target survivor required');
  if (state.activeTrade) throw new Error('Trade already active');

  const active = state.survivors[survivorId];
  const target = state.survivors[targetSurvivorId];

  if (!target) throw new Error('Target not found');
  if (active.position.zoneId !== target.position.zoneId) throw new Error('Must be in same zone');
  if (active.actionsRemaining < 1) throw new Error('Not enough actions');

  // --- Mutations + emits ---
  state.activeTrade = {
    activeSurvivorId: survivorId,
    targetSurvivorId,
    offers: { [survivorId]: [], [targetSurvivorId]: [] },
    receiveLayouts: { [survivorId]: {}, [targetSurvivorId]: {} },
    status: { [survivorId]: false, [targetSurvivorId]: false },
  };
  collector.emit({
    type: 'TRADE_SESSION_STARTED',
    activeSurvivorId: survivorId,
    targetSurvivorId,
  });

  // Trade is 1 Action — AP is spent when the action slot is taken, whether or
  // not the trade ultimately completes. Accept/Cancel are free sub-actions.
  deductAPWithFreeCheck(state, survivorId, ActionType.TRADE_START);
}

export function handleTradeOffer(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (!state.activeTrade) throw new Error('No active trade');
  const survivorId = intent.survivorId!;
  const offerIds = intent.payload?.offerCardIds as string[];
  if (!offerIds) throw new Error('Offer IDs required');

  const trade = state.activeTrade;
  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error('Not a participant in this trade');
  }
  const survivor = state.survivors[survivorId];
  const inventoryIds = survivor.inventory.map((c: EquipmentCard) => c.id);
  const allOwned = offerIds.every((id: string) => inventoryIds.includes(id));
  if (!allOwned) throw new Error('Cannot offer items you do not own');

  // --- Mutations + emits ---
  trade.offers[survivorId] = offerIds;
  trade.status[trade.activeSurvivorId] = false;
  trade.status[trade.targetSurvivorId] = false;
  // TRADE_OFFER_UPDATED is private to the two participants (§3.7);
  // broadcast layer auto-emits TRADE_OFFER_UPDATED_HIDDEN (count-only) for
  // non-participants.
  collector.emitPrivate(
    {
      type: 'TRADE_OFFER_UPDATED',
      offererSurvivorId: survivorId,
      offerCardIds: offerIds,
    },
    [trade.activeSurvivorId, trade.targetSurvivorId],
  );
}

export function handleTradeAccept(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (!state.activeTrade) throw new Error('No active trade');
  const survivorId = intent.survivorId!;
  const trade = state.activeTrade;
  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error('Not a participant');
  }

  // --- Mutations + emits ---
  if (intent.payload?.receiveLayout) {
    trade.receiveLayouts = trade.receiveLayouts || {};
    trade.receiveLayouts[survivorId] = intent.payload.receiveLayout;
  }
  trade.status[survivorId] = true;

  const s1 = trade.activeSurvivorId;
  const s2 = trade.targetSurvivorId;
  if (trade.status[s1] && trade.status[s2]) {
    executeTrade(state, collector);
  }
}

export function handleTradeCancel(state: GameState, _intent: ActionRequest, collector: EventCollector): void {
  // Idempotent cancel — no throw if there's no active trade.
  if (!state.activeTrade) return;
  delete state.activeTrade;
  collector.emit({ type: 'TRADE_CANCELLED' });
}

export function executeTrade(state: GameState, collector: EventCollector): void {
  const session = state.activeTrade!;
  const id1 = session.activeSurvivorId;
  const id2 = session.targetSurvivorId;

  const s1 = state.survivors[id1];
  const s2 = state.survivors[id2];

  const offer1 = session.offers[id1] || [];
  const offer2 = session.offers[id2] || [];

  const layout1 = session.receiveLayouts?.[id1] || {};
  const layout2 = session.receiveLayouts?.[id2] || {};

  const keep1 = s1.inventory.filter((c: EquipmentCard) => !offer1.includes(c.id));
  const keep2 = s2.inventory.filter((c: EquipmentCard) => !offer2.includes(c.id));

  const cards1 = s1.inventory.filter((c: EquipmentCard) => offer1.includes(c.id));
  const cards2 = s2.inventory.filter((c: EquipmentCard) => offer2.includes(c.id));

  const toS2All = cards1.map((c: EquipmentCard) => {
    const targetSlot = layout2[c.id] || 'BACKPACK_0';
    const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
    return { ...c, slot: targetSlot, inHand } as EquipmentCard;
  });
  const toS2 = toS2All.filter(c => c.slot !== 'DISCARD');
  const discardedFromS1 = toS2All.filter(c => c.slot === 'DISCARD');

  const toS1All = cards2.map((c: EquipmentCard) => {
    const targetSlot = layout1[c.id] || 'BACKPACK_0';
    const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
    return { ...c, slot: targetSlot, inHand } as EquipmentCard;
  });
  const toS1 = toS1All.filter(c => c.slot !== 'DISCARD');
  const discardedFromS2 = toS1All.filter(c => c.slot === 'DISCARD');

  const processInventory = (inventory: EquipmentCard[], layout: Record<string, string>, discardedOut: EquipmentCard[]): EquipmentCard[] => {
    return inventory.map(c => {
      if (layout[c.id] === 'DISCARD') {
        const d = { ...c, slot: 'DISCARD' } as EquipmentCard;
        discardedOut.push(d);
        return d;
      }
      if (layout[c.id]) {
        const targetSlot = layout[c.id];
        const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
        return { ...c, slot: targetSlot, inHand } as EquipmentCard;
      }
      return c;
    }).filter(c => c.slot !== 'DISCARD');
  };

  const discardedOwned: EquipmentCard[] = [];
  s1.inventory = [...processInventory(keep1, layout1, discardedOwned), ...toS1];
  s2.inventory = [...processInventory(keep2, layout2, discardedOwned), ...toS2];

  for (const card of [...discardedFromS1, ...discardedFromS2, ...discardedOwned]) {
    state.equipmentDiscard.push(card);
    collector.emit({
      type: 'EQUIPMENT_DISCARDED',
      survivorId: id1, // attribution is best-effort; the card flowed through trade resolution
      cardId: card.id,
    });
  }

  delete state.activeTrade;
  collector.emit({
    type: 'TRADE_ACCEPTED',
    activeSurvivorId: id1,
    targetSurvivorId: id2,
  });
}
