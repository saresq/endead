
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { resolveDrawnCard } from '../CardDraw';
import { XPManager } from '../XPManager';
import { zoneHasZombies } from './handlerUtils';
import { es, equipmentName } from '../../strings/es';

// rules/16-card-registry.md#standard-equipment-45-cards-blue-backs — Bag of Rice / Canned Food / Water are Food cards;
// "Consume for 1 AP". Match by registry key (equipmentId), not display name,
// so renames don't desync game logic.
const FOOD_EQUIPMENT_IDS = new Set(['bag_of_rice', 'canned_food', 'water']);

export function handleUseItem(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const itemId = intent.payload?.itemId;

  if (!itemId) throw new Error('Item ID required');

  const itemIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === itemId);
  if (itemIndex < 0) throw new Error('Item not found in inventory');

  const item = survivor.inventory[itemIndex];

  if (FOOD_EQUIPMENT_IDS.has(item.equipmentId)) {
    // Discard the card and award 1 AP. XPManager handles auto-promotion
    // (Yellow grants +1 Action immediately).
    survivor.inventory.splice(itemIndex, 1);
    DeckService.discard(newState, item);
    newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, 1);

    newState.lastAction = {
      type: ActionType.USE_ITEM,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      timestamp: Date.now(),
      description: es.log.consumed(equipmentName(item)),
    };
  } else {
    throw new Error(es.errors.notConsumable(equipmentName(item)));
  }

  return newState;
}

export function handleSearch(state: GameState, intent: ActionRequest): GameState {
  // Validate BEFORE drawing any cards (don't consume deck on failed search)
  const preSurvivor = state.survivors[intent.survivorId!];
  const preZone = state.zones[preSurvivor.position.zoneId];

  if (preSurvivor.hasSearched && !preSurvivor.skills.includes('can_search_more_than_once') && !preSurvivor.cheatMode) {
    throw new Error(es.errors.alreadySearched);
  }
  if (!preZone.searchable && !preSurvivor.skills.includes('search_anywhere')) {
    throw new Error(es.errors.searchOnlyInBuildings);
  }
  if (zoneHasZombies(state, preZone.id)) {
    throw new Error(es.errors.searchWithZombies);
  }

  // Clone state first, then handle deck operations on the clone only
  let newState = structuredClone(state) as GameState;

  if (newState.equipmentDeck.length === 0 && newState.equipmentDiscard.length === 0) {
      console.warn('Deck empty during search. Auto-initializing deck.');
      const deckResult = DeckService.initializeDeck(newState.seed);
      newState.equipmentDeck = deckResult.deck;
      newState.seed = deckResult.newSeed;
  }

  // Flashlight or Search: +1 Card skill: draw 2 cards instead of 1
  const hasFlashlight = newState.survivors[intent.survivorId!].inventory.some(
    (c: EquipmentCard) => c.equipmentId === 'flashlight'
  );
  const hasSearchPlus1 = newState.survivors[intent.survivorId!].skills.includes('search_plus_1');
  const cardsToDraw = (hasFlashlight || hasSearchPlus1) ? 2 : 1;

  // Draw one card at a time: an Aaahh!! stops the search, so any remaining
  // cards are never drawn, and every card that is drawn is resolved before the
  // next one — nothing can be left in neither inventory nor discard.
  const found: EquipmentCard[] = [];
  let drawnCount = 0;
  let trapped = false;

  for (let i = 0; i < cardsToDraw && !trapped; i++) {
    const drawResult = DeckService.drawCard(newState);
    newState = drawResult.newState;
    const card = drawResult.card;
    if (!card) break;
    drawnCount++;

    if (resolveDrawnCard(newState, intent.survivorId!, card) === 'AAAHH') {
      trapped = true;
      break;
    }
    found.push(card);

    // Matching Set: a drawn Dual weapon pulls its second copy from the deck.
    const searcher = newState.survivors[intent.survivorId!];
    if (searcher.skills.includes('matching_set') && card.stats?.dualWield) {
      const deckIndex = newState.equipmentDeck.findIndex(
        (d: EquipmentCard) => d.equipmentId === card.equipmentId
      );
      if (deckIndex >= 0) {
        const [matchCard] = newState.equipmentDeck.splice(deckIndex, 1);
        resolveDrawnCard(newState, intent.survivorId!, matchCard);
        found.push(matchCard);
        // "Shuffle deck after" (rules/14-skills.md#matching-set) — pulling a card from the
        // middle would otherwise leak where the rest of the deck sits.
        const shuffle = DeckService.shuffleDeck(newState.equipmentDeck, newState.seed);
        newState.equipmentDeck = shuffle.deck;
        newState.seed = shuffle.newSeed;
      }
    }
  }

  if (drawnCount === 0) throw new Error(es.errors.deckEmpty);

  newState.survivors[intent.survivorId!].hasSearched = true;

  const foundNames = found.map(c => equipmentName(c));
  const trapCount = trapped ? 1 : 0;
  newState.lastAction = {
    type: ActionType.SEARCH,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: foundNames.length > 0 ? es.log.found(foundNames, trapCount) : es.log.searchTrap,
  };

  return newState;
}

export function handleResolveSearch(state: GameState, intent: ActionRequest): GameState {
  const survivor = state.survivors[intent.survivorId!];
  if (!survivor.drawnCard) throw new Error(es.errors.noDrawnCard);

  const action = intent.payload?.action;

  if (action === 'DISCARD') {
    const newState = structuredClone(state);
    DeckService.discard(newState, survivor.drawnCard);
    newState.survivors[intent.survivorId!].drawnCard = undefined;
    return newState;
  } else if (action === 'EQUIP') {
    const targetSlot = intent.payload?.targetSlot;
    if (!targetSlot) throw new Error('Target slot required for EQUIP');

    const newState = structuredClone(state);
    const s = newState.survivors[intent.survivorId!];

    // Check if slot occupied
    const occupied = s.inventory.some((c: EquipmentCard) => c.slot === targetSlot);
    if (occupied) throw new Error(es.errors.slotOccupied);

    // Equip
    const newCard = s.drawnCard!;
    newCard.slot = targetSlot;
    newCard.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

    s.inventory.push(newCard);
    s.drawnCard = undefined;

    return newState;
  } else if (action === 'KEEP') {
    const discardId = intent.payload?.discardCardId;
    if (!discardId) throw new Error(es.errors.chooseCardToReplace);

    return EquipmentManager.swapDrawnCard(state, intent.survivorId!, discardId);
  }

  throw new Error('Invalid resolve action');
}

/**
 * Moves one card between slots. Free, because the action was already paid:
 * either by the reorganize session, by the trade the survivor is in, or by the
 * search / Epic crate whose card is still staged. Without one of those there is
 * nothing to charge, so the move is refused rather than silently free.
 */
export function handleOrganize(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  const targetSlot = intent.payload?.targetSlot;

  if (!cardId || !targetSlot) throw new Error('Missing cardId or targetSlot');
  if (!isOrganizePaidFor(state, survivorId)) throw new Error(es.errors.organizeNeedsSession);

  const newState = structuredClone(state);
  const survivor = newState.survivors[survivorId];

  newState.survivors[survivorId] = EquipmentManager.moveCardToSlot(survivor, cardId, targetSlot);

  return newState;
}

/** True while some already-paid context lets this survivor rearrange freely. */
function isOrganizePaidFor(state: GameState, survivorId: string): boolean {
  if (state.activeReorganize?.survivorId === survivorId) return true;
  if (state.survivors[survivorId]?.drawnCard) return true;
  const trade = state.activeTrade;
  return !!trade && (trade.activeSurvivorId === survivorId || trade.targetSurvivorId === survivorId);
}

/**
 * Opens a reorganize session. This is the action the player pays for
 * (ActionProcessor charges it); every move until ORGANIZE_END is free.
 */
export function handleOrganizeStart(state: GameState, intent: ActionRequest): GameState {
  if (state.activeReorganize) throw new Error(es.errors.reorganizeActive);

  const newState = structuredClone(state);
  newState.activeReorganize = { survivorId: intent.survivorId! };
  return newState;
}

export function handleOrganizeEnd(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeReorganize) return state;

  const newState = structuredClone(state);
  delete newState.activeReorganize;
  return newState;
}

/**
 * Drops a card out of the inventory (or the staging slot). Free and allowed at
 * any time, including on another player's turn — rules/07-inventory.md#discarding, a card can
 * be discarded whenever, and discarding grants nothing that could buy tempo.
 * Turn validation is skipped for this action, so ownership is checked here.
 */
export function handleDiscardCard(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  if (!cardId) throw new Error('Card ID required');

  const survivor = state.survivors[survivorId];
  if (!survivor) throw new Error('Survivor not found');
  if (survivor.playerId !== intent.playerId) throw new Error(es.errors.notYourSurvivor);
  if (survivor.wounds >= survivor.maxHealth) throw new Error(es.errors.survivorDead(survivor.name));

  return EquipmentManager.discardCard(state, survivorId, cardId);
}
