
import { GameState, ZoneId, GamePhase, Zombie, EquipmentCard, ZombieType, EquipmentType, GameResult, Survivor, DangerLevel } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError } from '../types/Action';
import { validateTurn, advanceTurnState } from './TurnManager';
import { XPManager } from './XPManager';
import { DeckService } from './DeckService';
import { EquipmentManager } from './EquipmentManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { rollDice } from './DiceService';
import { ZONE_LAYOUT } from '../config/Layout';

type ActionHandler = (state: GameState, intent: ActionRequest) => GameState;

const handlers: Partial<Record<ActionType, ActionHandler>> = {
  [ActionType.JOIN_LOBBY]: handleJoinLobby, // Actually handled in server.ts usually, but keeping pattern
  [ActionType.SELECT_CHARACTER]: handleSelectCharacter,
  [ActionType.START_GAME]: handleStartGame,
  [ActionType.MOVE]: handleMove,
  [ActionType.ATTACK]: handleAttack,
  [ActionType.MAKE_NOISE]: handleMakeNoise,
  [ActionType.CHOOSE_SKILL]: handleChooseSkill,
  [ActionType.SEARCH]: handleSearch,
  [ActionType.RESOLVE_SEARCH]: handleResolveSearch,
  [ActionType.ORGANIZE]: handleOrganize,
  [ActionType.OPEN_DOOR]: handleOpenDoor,
  [ActionType.NOTHING]: handleNothing,
  [ActionType.END_TURN]: handleEndTurn,
};

export function processAction(state: GameState, intent: ActionRequest): ActionResponse {
  // 0. Pre-check: Lobby Actions don't check Turns
  if (intent.type === ActionType.SELECT_CHARACTER || intent.type === ActionType.START_GAME) {
      // Allow through
  } else {
      // 1. Validate Turn Ownership
      let turnError: ActionError | null = validateTurn(state, intent);

      // Special Cases
      if ((intent.type === ActionType.CHOOSE_SKILL || intent.type === ActionType.RESOLVE_SEARCH) 
          && turnError && turnError.code === 'NO_ACTIONS') {
        turnError = null;
      }

      if (turnError) {
        return { success: false, error: turnError };
      }
  }

  // 2. Dispatch Handler
  const handler = handlers[intent.type];
  if (!handler) {
    return { 
      success: false, 
      error: { code: 'NOT_IMPLEMENTED', message: `Action ${intent.type} not implemented.` } 
    };
  }

  try {
    let newState = handler(state, intent);

    // 4. Advance Turn State (Deduct AP) - ONLY for Game Actions
    const gameActions = [
        ActionType.MOVE, ActionType.ATTACK, ActionType.SEARCH, 
        ActionType.OPEN_DOOR, ActionType.MAKE_NOISE, ActionType.ORGANIZE,
        ActionType.END_TURN
    ];
    
    if (gameActions.includes(intent.type)) {
      newState = advanceTurnState(newState, intent.survivorId!);
    }

    // 5. Check for Zombie Phase Transition
    if (newState.phase === GamePhase.Zombies) {
      newState = ZombiePhaseManager.executeZombiePhase(newState);
    }
    
    // 5b. Check Game End Conditions
    if (newState.phase === GamePhase.Players || newState.phase === GamePhase.Zombies) {
        const result = checkGameEndConditions(newState);
        if (result) {
          newState.gameResult = result;
          newState.phase = GamePhase.GameOver; // Lock game
        }
    }

    // 6. Log History
    if (intent.type !== ActionType.SELECT_CHARACTER) { // Don't spam history with selection
        newState.history = [
          ...(newState.history || []),
          {
            playerId: intent.playerId,
            survivorId: intent.survivorId || 'system',
            actionType: intent.type,
            timestamp: Date.now(),
            payload: intent.payload,
          }
        ];
    }

    return { success: true, newState };

  } catch (e: any) {
    return { 
      success: false, 
      error: { code: 'ACTION_FAILED', message: e.message } 
    };
  }
}

// --- Lobby Handlers ---

function handleJoinLobby(state: GameState, intent: ActionRequest): GameState {
    // This is mostly handled by server.ts auto-join logic, but can be explicit here
    // For now, return state as is
    return state;
}

function handleSelectCharacter(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
    
    const newState = JSON.parse(JSON.stringify(state));
    const playerIndex = newState.lobby.players.findIndex((p: any) => p.id === intent.playerId);
    
    if (playerIndex === -1) throw new Error('Player not in lobby');
    
    const charClass = intent.payload?.characterClass;
    if (!charClass) throw new Error('Character class required');
    
    // Check if taken? For MVP allow duplicates or check
    const taken = newState.lobby.players.some((p: any) => p.characterClass === charClass && p.id !== intent.playerId);
    if (taken) throw new Error('Character class already taken');

    newState.lobby.players[playerIndex].characterClass = charClass;
    newState.lobby.players[playerIndex].ready = true; // Auto-ready on select

    return newState;
}

function handleStartGame(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
    
    // Only first player (host) can start
    if (state.lobby.players[0].id !== intent.playerId) throw new Error('Only host can start game');
    
    const newState = JSON.parse(JSON.stringify(state));
    
    // Initialize Game
    newState.phase = GamePhase.Players;
    newState.turn = 1;
    newState.players = newState.lobby.players.map((p: any) => p.id);
    
    // Initialize Equipment Deck
    const deckResult = DeckService.initializeDeck(newState.seed);
    newState.equipmentDeck = deckResult.deck;
    newState.seed = deckResult.newSeed;

    // Initialize Spawn Deck
    const spawnResult = DeckService.initializeSpawnDeck(newState.seed);
    newState.spawnDeck = spawnResult.deck;
    newState.seed = spawnResult.newSeed;
    
    // Create Survivors
    newState.survivors = {};
    newState.lobby.players.forEach((p: any, index: number) => {
        const survivorId = `survivor-${p.id}`;
        const survivor: Survivor = {
            id: survivorId,
            playerId: p.id,
            name: p.name,
            characterClass: p.characterClass,
            position: { x: 0, y: 0, zoneId: 'street-start' }, // Spawn point
            actionsPerTurn: 3,
            maxHealth: 3,
            wounds: 0,
            experience: 0,
            dangerLevel: DangerLevel.Blue,
            skills: ['+1 Action'],
            inventory: [
                // Default Starting Gear
                {
                  id: `card-axe-${index}`,
                  name: 'Fire Axe',
                  type: EquipmentType.Weapon,
                  inHand: true,
                  slot: 'HAND_1',
                  canOpenDoor: true,
                  openDoorNoise: true,
                  stats: {
                    range: [0, 0],
                    dice: 1,
                    accuracy: 4,
                    damage: 2,
                    noise: true,
                    dualWield: false,
                  }
                }
            ],
            actionsRemaining: 3,
            hasMoved: false,
            hasSearched: false
        };
        newState.survivors[survivorId] = survivor;
    });

    return newState;
}

// --- Game End Logic ---

function checkGameEndConditions(state: GameState): GameResult | undefined {
  const survivors = Object.values(state.survivors);
  const zombies = Object.values(state.zombies);

  if (survivors.length === 0) return undefined; // Startup edge case

  // 1. Defeat: All survivors dead
  const allDead = survivors.every(s => s.wounds >= s.maxHealth);
  if (allDead) return GameResult.Defeat;

  // 2. Victory: All living survivors in Exit Zone AND No Zombies in that zone
  // Find Exit Zones
  const exitZones = Object.values(state.zones).filter(z => z.isExit).map(z => z.id);
  
  if (exitZones.length === 0) return undefined; // No exit defined

  const livingSurvivors = survivors.filter(s => s.wounds < s.maxHealth);
  if (livingSurvivors.length === 0) return undefined; // Should be caught by Defeat check, but safety

  const allInExit = livingSurvivors.every(s => exitZones.includes(s.position.zoneId));
  
  if (allInExit) {
    // Check if any zombie occupies an exit zone where survivors are present.
    const occupiedExitZones = new Set(livingSurvivors.map(s => s.position.zoneId));
    
    const zombiesInExit = zombies.some(z => occupiedExitZones.has(z.position.zoneId));
    
    if (!zombiesInExit) {
      return GameResult.Victory;
    }
  }

  return undefined;
}

// --- Handlers ---

function handleMove(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const targetId = intent.payload?.targetZoneId;

  if (!targetId) throw new Error('Target zone required');

  const currentZone = newState.zones[survivor.position.zoneId];
  if (!currentZone) throw new Error('Current zone invalid');
  
  const targetZone = newState.zones[targetId];
  if (!targetZone) throw new Error('Target zone invalid');
  
  if (!currentZone.connectedZones.includes(targetId)) {
    throw new Error(`Zones not connected: ${currentZone.id} -> ${targetId}`);
  }

  // Door Check for Movement
  // If moving between building and street (or vice versa), check if door is open
  const isEnteringBuilding = !currentZone.isBuilding && targetZone.isBuilding;
  const isLeavingBuilding = currentZone.isBuilding && !targetZone.isBuilding;

  if (isEnteringBuilding || isLeavingBuilding) {
    // Check which zone holds the door status.
    // In our simplified model, the BUILDING zone holds the door status.
    const buildingZone = isEnteringBuilding ? targetZone : currentZone;
    if (!buildingZone.doorOpen) {
      throw new Error('Door is closed. You must open it first.');
    }
  }

  survivor.position.zoneId = targetId;
  survivor.hasMoved = true;
  
  return newState;
}

function handleOpenDoor(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;
  
  if (!targetZoneId) throw new Error('Target zone required');

  const currentZone = newState.zones[survivor.position.zoneId];
  const targetZone = newState.zones[targetZoneId];

  if (!targetZone) throw new Error('Target zone invalid');
  if (!currentZone.connectedZones.includes(targetZoneId)) {
    throw new Error('Target zone not connected');
  }

  // 1. Identify which zone is the building
  // You open a door OF a building.
  let buildingZone: any = null;
  if (targetZone.isBuilding) buildingZone = targetZone;
  else if (currentZone.isBuilding) buildingZone = currentZone;

  if (!buildingZone) throw new Error('No building involved in this connection');
  
  if (buildingZone.doorOpen) throw new Error('Door is already open');

  // 2. Check Equipment
  const hasOpener = survivor.inventory.some((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (!hasOpener) throw new Error('Requires equipment to open doors (in hand)');

  // 3. Open Door
  newState.zones[buildingZone.id].doorOpen = true;

  // 4. Noise
  // Check if the opener is noisy
  const opener = survivor.inventory.find((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (opener && opener.openDoorNoise) {
    const zone = newState.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

  // 5. Spawn Zombies (First time opening)
  // For MVP: Simple spawn if empty? Or skip.
  // Zombicide rule: Spawn in ALL zones of the building.
  // We need to find all zones connected to this building zone that are ALSO buildings.
  // BFS restricted to isBuilding=true
  // TODO: Implement proper building spawn logic. For now, we just open the door.

  return newState;
}

function handleMakeNoise(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];
  
  zone.noiseTokens = (zone.noiseTokens || 0) + 1;
  newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  
  return newState;
}

function handleChooseSkill(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const skillId = intent.payload?.skillId;
  
  if (!skillId) throw new Error('Skill ID required');
  
  if (!XPManager.canChooseSkill(survivor, skillId)) {
    throw new Error(`Cannot choose skill ${skillId}`);
  }
  
  XPManager.unlockSkill(survivor, skillId);
  return newState;
}

function handleSearch(state: GameState, intent: ActionRequest): GameState {
  // 1. Draw Card
  // Self-healing: If deck is completely empty (no deck, no discard), initialize it.
  // This handles legacy saves or games started before the deck init fix.
  if (state.equipmentDeck.length === 0 && state.equipmentDiscard.length === 0) {
      console.warn('Deck empty during search. Auto-initializing deck.');
      const deckResult = DeckService.initializeDeck(state.seed);
      state.equipmentDeck = deckResult.deck;
      state.seed = deckResult.newSeed;
  }

  const { card, newState } = DeckService.drawCard(state);
  if (!card) throw new Error('Deck empty'); // Should reshuffle discard, if both empty -> fail

  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  // 2. Validate Search Eligibility
  if (survivor.hasSearched) throw new Error('Already searched this turn');
  if (!zone.isBuilding && !survivor.skills.includes('search_anywhere')) {
    throw new Error('Can only search inside buildings');
  }
  if (Object.values(newState.zombies).some((z: any) => z.position.zoneId === zone.id)) {
    throw new Error('Cannot search zone with zombies');
  }

  // 3. Handle Inventory
  if (EquipmentManager.hasSpace(survivor)) {
    // Auto-add
    newState.survivors[intent.survivorId!] = EquipmentManager.addCard(survivor, card);
  } else {
    // Set Pending State
    survivor.drawnCard = card;
    // NOTE: This action normally costs 1 AP.
    // If we return here, the Processor deducts 1 AP.
    // The player is now in a "must resolve" state.
    // Future actions should probably be blocked until resolution?
    // We trust client/turn manager to enforce logic flow.
  }

  survivor.hasSearched = true;
  return newState;
}

function handleResolveSearch(state: GameState, intent: ActionRequest): GameState {
  // Payload: { action: 'KEEP' | 'DISCARD', discardCardId?: string }
  const survivor = state.survivors[intent.survivorId!];
  if (!survivor.drawnCard) throw new Error('No drawn card to resolve');

  const action = intent.payload?.action; // 'KEEP' or 'DISCARD'
  
  if (action === 'DISCARD') {
    // User chose to discard the NEW card
    // Move drawnCard to discard pile
    const newState = JSON.parse(JSON.stringify(state));
    newState.equipmentDiscard.push(survivor.drawnCard);
    newState.survivors[intent.survivorId!].drawnCard = undefined;
    return newState;
  } else if (action === 'KEEP') {
    const discardId = intent.payload?.discardCardId;
    if (!discardId) throw new Error('Must specify which card to replace');
    
    return EquipmentManager.swapDrawnCard(state, intent.survivorId!, discardId);
  }

  throw new Error('Invalid resolve action');
}

function handleOrganize(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  const targetSlot = intent.payload?.targetSlot;

  if (!cardId || !targetSlot) throw new Error('Missing cardId or targetSlot');

  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[survivorId];

  newState.survivors[survivorId] = EquipmentManager.moveCardToSlot(survivor, cardId, targetSlot);
  
  return newState;
}

function handleNothing(state: GameState, intent: ActionRequest): GameState {
  return state;
}

function handleEndTurn(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  survivor.actionsRemaining = 0;
  return newState;
}

function handleAttack(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;
  const weaponId = intent.payload?.weaponId;

  if (!targetZoneId) throw new Error('Target zone required');

  // 1. Get Weapon
  let weapon: EquipmentCard | undefined;
  if (weaponId) {
    weapon = survivor.inventory.find((c: EquipmentCard) => c.id === weaponId && c.inHand);
    if (!weapon) throw new Error('Weapon not found or not equipped');
  } else {
    // Auto-select if only one
    const weapons = survivor.inventory.filter((c: EquipmentCard) => c.type === 'WEAPON' && c.inHand);
    if (weapons.length === 1) weapon = weapons[0];
    else if (weapons.length === 0) throw new Error('No weapon equipped');
    else throw new Error('Multiple weapons equipped, specify weaponId');
  }

  if (!weapon) throw new Error('No weapon found');
  if (weapon.type !== 'WEAPON' || !weapon.stats) throw new Error('Item is not a weapon');
  
  const stats = weapon.stats;

  // 2. Range Check
  const currentZoneId = survivor.position.zoneId;
  let distance = 0;
  
  if (currentZoneId !== targetZoneId) {
     distance = getDistance(state, currentZoneId, targetZoneId);
     if (distance === Infinity) throw new Error('Target zone not reachable');
  }
  
  if (distance < stats.range[0] || distance > stats.range[1]) {
      throw new Error(`Target out of range (${distance}). Weapon range: ${stats.range.join('-')}`);
  }

  // 3. Roll Dice
  const diceCount = stats.dice; 
  const threshold = stats.accuracy;
  const result = rollDice(newState.seed, diceCount, threshold);
  newState.seed = result.newSeed;

  newState.lastAction = {
      type: ActionType.ATTACK,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      dice: (result as any).rolls || [], // Cast to any if rolls is missing in type def, but check DiceService
      hits: result.hits,
      timestamp: Date.now(),
      description: `Attacked with ${weapon.name} (Need ${threshold}+)`
  };

  // 4. Apply Damage
  let zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];
  
  // Priority Sort: Walker (1) -> Fatty (2) -> Runner (3) -> Abom (4)
  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Walker]: 1,
    [ZombieType.Fatty]: 2,
    [ZombieType.Abomination]: 3, 
    [ZombieType.Runner]: 4
  };
  
  zombiesInZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  let hits = result.hits;
  let xpGained = 0;

  for (const zombie of zombiesInZone) {
      if (hits <= 0) break;
      
      const toughness = getZombieToughness(zombie.type);
      if (stats.damage >= toughness) {
          // Kill
          delete newState.zombies[zombie.id];
          xpGained += getZombieXP(zombie.type);
          hits--;
      } else {
          hits--; 
      }
  }

  // Apply XP
  if (xpGained > 0) {
    newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, xpGained);
  }

  // 5. Friendly Fire (Ranged only)
  if (stats.range[1] >= 1) {
      const misses = diceCount - result.hits;
      if (misses > 0) {
          const survivorsInZone = Object.values(newState.survivors).filter((s: any) => 
            s.position.zoneId === targetZoneId && s.id !== survivor.id
          ) as any[];
          
          let missesRemaining = misses;
          for (const s of survivorsInZone) {
            if (missesRemaining <= 0) break;
            s.wounds += stats.damage; 
            missesRemaining--;
          }
      }
  }

  // 6. Noise
  if (stats.noise) {
      const zone = newState.zones[survivor.position.zoneId];
      zone.noiseTokens = (zone.noiseTokens || 0) + 1;
      newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

  return newState;
}

// Helpers

function getDistance(state: GameState, startZoneId: ZoneId, endZoneId: ZoneId): number {
  if (startZoneId === endZoneId) return 0;

  const queue: { id: ZoneId; dist: number }[] = [{ id: startZoneId, dist: 0 }];
  const visited = new Set<string>();
  visited.add(startZoneId);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (id === endZoneId) return dist;

    // Limit search depth
    if (dist > 10) continue; 

    const zone = state.zones[id];
    if (!zone) continue;

    for (const neighbor of zone.connectedZones) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, dist: dist + 1 });
      }
    }
  }
  return Infinity;
}

function getZombieToughness(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Fatty: return 2;
    case ZombieType.Abomination: return 3;
  }
}

function getZombieXP(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Fatty: return 1;
    case ZombieType.Abomination: return 5;
  }
}
