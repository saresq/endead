
import { GameState, EquipmentCard, ZombieType } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { XPManager } from '../XPManager';

// RULEBOOK.md:604-621 — Bag of Rice / Canned Food / Water are Food cards;
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
    newState.equipmentDiscard.push(item);
    newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, 1);

    newState.lastAction = {
      type: ActionType.USE_ITEM,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      timestamp: Date.now(),
      description: `Consumed ${item.name} (+1 AP)`,
    };
  } else {
    throw new Error(`Item "${item.name}" cannot be used as a consumable`);
  }

  return newState;
}

export function handleSearch(state: GameState, intent: ActionRequest): GameState {
  // Validate BEFORE drawing any cards (don't consume deck on failed search)
  const preSurvivor = state.survivors[intent.survivorId!];
  const preZone = state.zones[preSurvivor.position.zoneId];

  if (preSurvivor.hasSearched && !preSurvivor.skills.includes('can_search_more_than_once') && !preSurvivor.cheatMode) {
    throw new Error('Already searched this turn');
  }
  if (!preZone.searchable && !preSurvivor.skills.includes('search_anywhere')) {
    throw new Error('Can only search inside buildings');
  }
  if (Object.values(state.zombies).some((z: any) => z.position.zoneId === preZone.id)) {
    throw new Error('Cannot search zone with zombies');
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
    (c: EquipmentCard) => c.name === 'Flashlight'
  );
  const hasSearchPlus1 = newState.survivors[intent.survivorId!].skills.includes('search_plus_1');
  const cardsToDraw = (hasFlashlight || hasSearchPlus1) ? 2 : 1;

  const drawnCards: EquipmentCard[] = [];
  for (let i = 0; i < cardsToDraw; i++) {
    const drawResult = DeckService.drawCard(newState);
    newState = drawResult.newState;
    if (drawResult.card) drawnCards.push(drawResult.card);
  }

  if (drawnCards.length === 0) throw new Error('Deck empty');

  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  // Process drawn cards — check for Aaahh!! trap cards
  const equipCards: EquipmentCard[] = [];
  for (const card of drawnCards) {
    if (card.keywords?.includes('aaahh')) {
      // Aaahh!! card: spawn a Walker in the searcher's zone, discard card
      ZombiePhaseManager.spawnZombie(newState, zone.id, ZombieType.Walker);
      newState.equipmentDiscard.push(card);
    } else {
      equipCards.push(card);
    }
  }

  // Matching Set: if drawn card is a Dual weapon, auto-take second copy from deck
  if (survivor.skills.includes('matching_set')) {
    const matchingCards: EquipmentCard[] = [];
    for (const card of equipCards) {
      if (card.stats?.dualWield) {
        // Find another copy by name in equipment deck
        const deckIndex = newState.equipmentDeck.findIndex(
          (d: EquipmentCard) => d.name === card.name
        );
        if (deckIndex >= 0) {
          const [matchCard] = newState.equipmentDeck.splice(deckIndex, 1);
          matchingCards.push(matchCard);
        }
      }
    }
    equipCards.push(...matchingCards);
  }

  // Give non-trap cards to survivor
  for (const card of equipCards) {
    const handFull = EquipmentManager.isHandFull(survivor);
    const hasSpace = EquipmentManager.hasSpace(survivor);

    if (!handFull && hasSpace) {
      newState.survivors[intent.survivorId!] = EquipmentManager.addCard(
        newState.survivors[intent.survivorId!], card
      );
    } else {
      // Hand Full or Inventory Full -> Trigger Modal with first overflow card
      newState.survivors[intent.survivorId!].drawnCard = card;
      // Remaining cards go to discard if we can't hold them
      break;
    }
  }

  newState.survivors[intent.survivorId!].hasSearched = true;

  const foundNames = equipCards.map(c => c.name).join(', ');
  const trapCount = drawnCards.length - equipCards.length;
  const trapNote = trapCount > 0 ? ` (${trapCount} Aaahh!!)` : '';
  newState.lastAction = {
    type: ActionType.SEARCH,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: foundNames ? `Found: ${foundNames}${trapNote}` : `Aaahh!! — zombie spawned!`,
  };

  return newState;
}

export function handleResolveSearch(state: GameState, intent: ActionRequest): GameState {
  const survivor = state.survivors[intent.survivorId!];
  if (!survivor.drawnCard) throw new Error('No drawn card to resolve');

  const action = intent.payload?.action;

  if (action === 'DISCARD') {
    const newState = structuredClone(state);
    newState.equipmentDiscard.push(survivor.drawnCard);
    newState.survivors[intent.survivorId!].drawnCard = undefined;
    return newState;
  } else if (action === 'EQUIP') {
    const targetSlot = intent.payload?.targetSlot;
    if (!targetSlot) throw new Error('Target slot required for EQUIP');

    const newState = structuredClone(state);
    const s = newState.survivors[intent.survivorId!];

    // Check if slot occupied
    const occupied = s.inventory.some((c: EquipmentCard) => c.slot === targetSlot);
    if (occupied) throw new Error(`Slot ${targetSlot} is occupied. Move item first.`);

    // Equip
    const newCard = s.drawnCard!;
    newCard.slot = targetSlot;
    newCard.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

    s.inventory.push(newCard);
    s.drawnCard = undefined;

    return newState;
  } else if (action === 'KEEP') {
    const discardId = intent.payload?.discardCardId;
    if (!discardId) throw new Error('Must specify which card to replace');

    return EquipmentManager.swapDrawnCard(state, intent.survivorId!, discardId);
  }

  throw new Error('Invalid resolve action');
}

export function handleOrganize(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  const targetSlot = intent.payload?.targetSlot;

  if (!cardId || !targetSlot) throw new Error('Missing cardId or targetSlot');

  // Handle explicit DISCARD action via Organize
  if (targetSlot === 'DISCARD') {
      return EquipmentManager.discardCard(state, survivorId, cardId);
  }

  const newState = structuredClone(state);
  const survivor = newState.survivors[survivorId];

  newState.survivors[survivorId] = EquipmentManager.moveCardToSlot(survivor, cardId, targetSlot);

  return newState;
}
