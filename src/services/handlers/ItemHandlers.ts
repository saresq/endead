
import { GameState, EquipmentCard, ZombieType } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { deductAPWithFreeCheck } from './handlerUtils';
import type { EventCollector } from '../EventCollector';

/**
 * Aaahh!! trap resolution (RULEBOOK Search / Aaahh!! card).
 *
 * Aaahh!! cards (both the standard blue-back `aaahh` and the epic red-back
 * `epic_aaahh`) never reach a survivor's inventory or picker — the trap
 * immediately spawns a Walker in the drawer's zone and the card goes to the
 * standard equipment discard. Single call site for Search and Epic Crate.
 */
export function handleAaahhTrap(
  state: GameState,
  survivorId: string,
  card: EquipmentCard,
  collector: EventCollector,
): void {
  const survivor = state.survivors[survivorId];
  const zoneId = survivor.position.zoneId;
  ZombiePhaseManager.spawnZombie(state, zoneId, ZombieType.Walker, collector);
  state.equipmentDiscard.push(card);
}

export function handleUseItem(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const itemId = intent.payload?.itemId;

  // --- Validate-first ---
  if (!itemId) throw new Error('Item ID required');

  const itemIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === itemId);
  if (itemIndex < 0) throw new Error('Item not found in inventory');

  const item = survivor.inventory[itemIndex];

  if (item.name !== 'Canned Food' && item.name !== 'Water') {
    throw new Error(`Item "${item.name}" cannot be used as a consumable`);
  }
  if (survivor.wounds <= 0) throw new Error('Survivor has no wounds to heal');

  // --- Mutations + emits ---
  survivor.wounds = Math.max(0, survivor.wounds - 1);
  survivor.inventory.splice(itemIndex, 1);
  state.equipmentDiscard.push(item);

  collector.emit({
    type: 'SURVIVOR_HEALED',
    survivorId: intent.survivorId!,
    amount: 1,
  });
  collector.emit({
    type: 'EQUIPMENT_DISCARDED',
    survivorId: intent.survivorId!,
    cardId: item.id,
  });
}

export function handleSearch(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first (D19): hoist a pure can-draw predicate to BEFORE the
  //     draw loop. The original handler called DeckService.drawCard before
  //     throwing on empty deck, advancing the seed and mutating the deck on
  //     a "failed" search. ---
  const survivor = state.survivors[intent.survivorId!];
  const zone = state.zones[survivor.position.zoneId];

  if (survivor.hasSearched && !survivor.skills.includes('can_search_more_than_once')) {
    throw new Error('Already searched this turn');
  }
  if (!zone.searchable && !survivor.skills.includes('search_anywhere')) {
    throw new Error('Can only search inside buildings');
  }
  if (Object.values(state.zombies).some(z => z.position.zoneId === zone.id)) {
    throw new Error('Cannot search zone with zombies');
  }

  // Flashlight and `search_plus_1` do not stack — both provide "+1 card to
  // Search" but the card pool caps at 2 draws total. Conservative read of
  // the Equipment deck rules: neither effect compounds with the other, and
  // this matches the printed Flashlight text's single upgrade model.
  const hasFlashlight = survivor.inventory.some(
    (c: EquipmentCard) => c.name === 'Flashlight'
  );
  const hasSearchPlus1 = survivor.skills.includes('search_plus_1');
  const cardsToDraw = (hasFlashlight || hasSearchPlus1) ? 2 : 1;

  // Pure-read predicate: can we satisfy the request without draining both deck
  // and discard to zero? `drawCard` reshuffles discard once if deck is empty.
  // Total available cards = deck + discard.
  const totalAvailable = state.equipmentDeck.length + state.equipmentDiscard.length;
  if (totalAvailable === 0) {
    throw new Error('Deck empty');
  }

  // --- Mutations + emits ---
  // Draw loop. Each draw may emit DECK_SHUFFLED through the collector.
  const drawnCards: EquipmentCard[] = [];
  for (let i = 0; i < cardsToDraw; i++) {
    const card = DeckService.drawCard(state, collector);
    if (card) drawnCards.push(card);
  }

  // Process drawn cards — Aaahh!! traps spawn a Walker, others enter the picker.
  const equipCards: EquipmentCard[] = [];
  for (const card of drawnCards) {
    if (card.keywords?.includes('aaahh')) {
      handleAaahhTrap(state, intent.survivorId!, card, collector);
    } else {
      equipCards.push(card);
    }
  }

  // Matching Set: dual-wield draws auto-pull a second copy of the weapon
  // from the Equipment deck. Routed through `DeckService.drawCardWhere` so a
  // mid-search reshuffle emits DECK_SHUFFLED, and any trap card returned
  // (belt-and-braces: predicate matches by name, so only relevant if a dual
  // weapon happens to share a name with a trap) triggers the standard
  // Aaahh!! walker-spawn rather than silently granting a duplicate.
  if (survivor.skills.includes('matching_set')) {
    const matchingCards: EquipmentCard[] = [];
    for (const card of equipCards) {
      if (card.stats?.dualWield) {
        const matchCard = DeckService.drawCardWhere(
          state,
          (d: EquipmentCard) => d.name === card.name,
          collector,
        );
        if (matchCard) {
          if (matchCard.keywords?.includes('aaahh')) {
            handleAaahhTrap(state, intent.survivorId!, matchCard, collector);
          } else {
            matchingCards.push(matchCard);
          }
        }
      }
    }
    equipCards.push(...matchingCards);
  }

  // Stash drawn cards in the picker queue.
  if (equipCards.length > 0) {
    survivor.drawnCard = equipCards[0];
    if (equipCards.length > 1) {
      survivor.drawnCardsQueue = equipCards.slice(1);
    }
    // CARD_DRAWN is private to the searcher (§3.7); broadcast layer auto-
    // emits CARD_DRAWN_HIDDEN { survivorId } for non-owners. Emit one per
    // equip card revealed to the picker.
    for (const c of equipCards) {
      collector.emitPrivate(
        {
          type: 'CARD_DRAWN',
          survivorId: intent.survivorId!,
          card: c,
        },
        [intent.survivorId!],
      );
    }
  }

  survivor.hasSearched = true;

  const foundNames = equipCards.map(c => c.name).join(', ');
  const trapCount = drawnCards.length - equipCards.length;
  const trapNote = trapCount > 0 ? ` (${trapCount} Aaahh!!)` : '';
  state.lastAction = {
    type: ActionType.SEARCH,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: foundNames ? `Found: ${foundNames}${trapNote}` : `Aaahh!! — zombie spawned!`,
  };
}

/** Named inventory slots a card may actually live in. Excludes the staging
 *  sentinels 'BACKPACK' and 'DISCARD' used internally by deck init /
 *  discard flow. (M5: RULEBOOK "Inventory — 5 slots per Survivor".) */
const VALID_INVENTORY_SLOTS: ReadonlySet<string> = new Set([
  'HAND_1', 'HAND_2',
  'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2',
]);

export function handleResolveSearch(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];

  // --- Validate-first ---
  if (!survivor.drawnCard) throw new Error('No drawn card to resolve');

  const action = intent.payload?.action;
  if (action !== 'DISCARD' && action !== 'EQUIP' && action !== 'KEEP') {
    throw new Error('Invalid resolve action');
  }
  if (action === 'EQUIP') {
    const targetSlot = intent.payload?.targetSlot;
    if (!targetSlot) throw new Error('Target slot required for EQUIP');
    if (!VALID_INVENTORY_SLOTS.has(String(targetSlot))) {
      throw new Error(`Invalid slot: ${targetSlot}`);
    }
    const occupied = survivor.inventory.some((c: EquipmentCard) => c.slot === targetSlot);
    if (occupied) throw new Error(`Slot ${targetSlot} is occupied. Move item first.`);
  }
  if (action === 'KEEP') {
    const discardId = intent.payload?.discardCardId;
    if (!discardId) throw new Error('Must specify which card to replace');
    if (!survivor.inventory.some((c: EquipmentCard) => c.id === discardId)) {
      throw new Error('Discard target not found');
    }
  }

  // --- Mutations + emits ---
  const cardId = survivor.drawnCard.id;

  if (action === 'DISCARD') {
    state.equipmentDiscard.push(survivor.drawnCard);
    survivor.drawnCard = undefined;
    collector.emit({
      type: 'CARD_EQUIPMENT_RESOLVED',
      survivorId: intent.survivorId!,
      action: 'DISCARD',
      cardId,
    });
  } else if (action === 'EQUIP') {
    const targetSlot = intent.payload?.targetSlot as EquipmentCard['slot'];
    const newCard = survivor.drawnCard!;
    newCard.slot = targetSlot;
    newCard.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');
    survivor.inventory.push(newCard);
    survivor.drawnCard = undefined;
    collector.emit({
      type: 'CARD_EQUIPMENT_RESOLVED',
      survivorId: intent.survivorId!,
      action: 'EQUIP',
      cardId,
    });
    collector.emit({
      type: 'EQUIPMENT_EQUIPPED',
      survivorId: intent.survivorId!,
      cardId,
      slot: String(targetSlot),
    });
  } else if (action === 'KEEP') {
    const discardId = intent.payload?.discardCardId;
    EquipmentManager.swapDrawnCard(state, intent.survivorId!, discardId);
    collector.emit({
      type: 'CARD_EQUIPMENT_RESOLVED',
      survivorId: intent.survivorId!,
      action: 'KEEP',
      cardId,
    });
    collector.emit({
      type: 'EQUIPMENT_DISCARDED',
      survivorId: intent.survivorId!,
      cardId: discardId,
    });
  }

  // Pop next queued draw into the picker slot.
  const queue = survivor.drawnCardsQueue;
  if (queue && queue.length > 0) {
    survivor.drawnCard = queue.shift();
    if (queue.length === 0) survivor.drawnCardsQueue = undefined;
  }
}

export function handleOrganize(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  const targetSlot = intent.payload?.targetSlot;

  // --- Validate-first ---
  if (!cardId || !targetSlot) throw new Error('Missing cardId or targetSlot');

  const survivor = state.survivors[survivorId];

  if (targetSlot === 'DISCARD') {
    // Validate the card exists (in inventory or as drawn pending) before mutating.
    const inInv = survivor.inventory.some((c: EquipmentCard) => c.id === cardId);
    const isDrawn = survivor.drawnCard?.id === cardId;
    if (!inInv && !isDrawn) throw new Error('Card not found in inventory');
  } else {
    if (!survivor.inventory.some((c: EquipmentCard) => c.id === cardId)) {
      throw new Error('Card not found');
    }
  }

  // Snapshot free-path eligibility BEFORE mutating — handler may clear
  // drawnCard below (DISCARD of the picker card) and we still want the free
  // Reorganize to apply for that case.
  const isTradeParticipant =
    !!state.activeTrade &&
    (survivorId === state.activeTrade.activeSurvivorId ||
     survivorId === state.activeTrade.targetSurvivorId);
  const isFree = !!survivor.drawnCard || isTradeParticipant;

  // --- Mutations + emits ---
  if (targetSlot === 'DISCARD') {
    EquipmentManager.discardCard(state, survivorId, cardId);
    collector.emit({
      type: 'EQUIPMENT_DISCARDED',
      survivorId,
      cardId,
    });
  } else {
    EquipmentManager.moveCardToSlot(survivor, cardId, targetSlot);
    collector.emit({
      type: 'EQUIPMENT_REORGANIZED',
      survivorId,
      moves: [{ cardId, toSlot: String(targetSlot) }],
    });
  }

  // Standalone Reorganize costs 1 AP (rulebook: Reorganize Action).
  // Free paths: mid-pickup resolution (drawnCard) or active Trade participant.
  if (!isFree) {
    deductAPWithFreeCheck(state, survivorId, ActionType.ORGANIZE);
  }
}
