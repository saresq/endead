
import { GameState, ZoneId, GamePhase, Zombie, EquipmentCard, ZombieType, EquipmentType, GameResult, Survivor, DangerLevel, ObjectiveType, Objective, Zone, ZoneConnection, initialGameState } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError } from '../types/Action';
import { validateTurn, advanceTurnState, checkEndTurn } from './TurnManager';
import { XPManager } from './XPManager';
import { DeckService } from './DeckService';
import { EquipmentManager } from './EquipmentManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { rollDice } from './DiceService';
import { ZONE_LAYOUT } from '../config/Layout';
import { TileInstance, isLegacyMap } from '../types/Map';
import { compileScenario, compileLegacyTiles } from './ScenarioCompiler';

type ActionHandler = (state: GameState, intent: ActionRequest) => GameState;

// --- Helper: Get edge connection between two zones ---
function getConnection(zone: Zone, targetZoneId: ZoneId): ZoneConnection | undefined {
    return zone.connections.find(c => c.toZoneId === targetZoneId);
}

// --- Helper: Check if door blocks passage on an edge ---
function isDoorBlocked(zone: Zone, targetZoneId: ZoneId): boolean {
    const conn = getConnection(zone, targetZoneId);
    if (!conn) return true; // Not connected at all
    return conn.hasDoor && !conn.doorOpen;
}

// --- Helper: Open a door on an edge (both sides) ---
function openDoorEdge(state: GameState, zoneAId: ZoneId, zoneBId: ZoneId): void {
    const zoneA = state.zones[zoneAId];
    const zoneB = state.zones[zoneBId];
    
    const connAB = zoneA?.connections.find(c => c.toZoneId === zoneBId);
    const connBA = zoneB?.connections.find(c => c.toZoneId === zoneAId);
    
    if (connAB) connAB.doorOpen = true;
    if (connBA) connBA.doorOpen = true;
}

const handlers: Partial<Record<ActionType, ActionHandler>> = {
  [ActionType.JOIN_LOBBY]: handleJoinLobby, 
  [ActionType.UPDATE_NICKNAME]: handleUpdateNickname,
  [ActionType.SELECT_CHARACTER]: handleSelectCharacter,
  [ActionType.START_GAME]: handleStartGame,
  [ActionType.END_GAME]: handleEndGame,
  [ActionType.MOVE]: handleMove,
  [ActionType.ATTACK]: handleAttack,
  [ActionType.MAKE_NOISE]: handleMakeNoise,
  [ActionType.CHOOSE_SKILL]: handleChooseSkill,
  [ActionType.SEARCH]: handleSearch,
  [ActionType.RESOLVE_SEARCH]: handleResolveSearch,
  [ActionType.ORGANIZE]: handleOrganize,
  [ActionType.OPEN_DOOR]: handleOpenDoor,
  [ActionType.TAKE_OBJECTIVE]: handleTakeObjective,
  [ActionType.TRADE]: handleTrade, // Legacy/Error
  [ActionType.TRADE_START]: handleTradeStart,
  [ActionType.TRADE_OFFER]: handleTradeOffer,
  [ActionType.TRADE_ACCEPT]: handleTradeAccept,
  [ActionType.TRADE_CANCEL]: handleTradeCancel,
  [ActionType.NOTHING]: handleNothing,
  [ActionType.END_TURN]: handleEndTurn,
};

export function processAction(state: GameState, intent: ActionRequest): ActionResponse {
  // 0. Pre-check: Lobby Actions don't check Turns
  if (
    intent.type === ActionType.UPDATE_NICKNAME ||
    intent.type === ActionType.SELECT_CHARACTER ||
    intent.type === ActionType.START_GAME ||
    intent.type === ActionType.END_GAME
  ) {
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
        ActionType.TAKE_OBJECTIVE, // New Action
        ActionType.TRADE, ActionType.TRADE_START, ActionType.TRADE_OFFER, 
        ActionType.TRADE_ACCEPT, ActionType.TRADE_CANCEL, ActionType.END_TURN
    ];
    
    if (gameActions.includes(intent.type)) {
       // Filter out Trade Session Sub-Actions from AP Cost
       if (intent.type === ActionType.TRADE_START || 
           intent.type === ActionType.TRADE_OFFER || 
           intent.type === ActionType.TRADE_ACCEPT || 
           intent.type === ActionType.TRADE_CANCEL) {
           // No AP cost yet
       } 
       else if (intent.type === ActionType.ORGANIZE && newState.activeTrade) {
           const trade = newState.activeTrade;
           if (intent.survivorId === trade.activeSurvivorId || intent.survivorId === trade.targetSurvivorId) {
               // Free Organize during trade
           } else {
               newState = advanceTurnState(newState, intent.survivorId!);
           }
       }
       else if (intent.type === ActionType.ORGANIZE && newState.survivors[intent.survivorId!]?.drawnCard) {
           // Free Organize during Pickup/Search Resolution
       }
       else if (intent.type === ActionType.TRADE) { 
           newState = advanceTurnState(newState, intent.survivorId!);
       }
       else {
           newState = advanceTurnState(newState, intent.survivorId!);
       }
    } else if (intent.type === ActionType.RESOLVE_SEARCH) {
        // Since RESOLVE_SEARCH doesn't cost AP (cost was paid in SEARCH),
        // we only need to check if the turn should end now that the blocking condition (drawnCard) is cleared.
        newState = checkEndTurn(newState);
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
    if (intent.type !== ActionType.SELECT_CHARACTER && intent.type !== ActionType.UPDATE_NICKNAME) {
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
    return state;
}

function handleUpdateNickname(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

    const rawName = intent.payload?.name;
    const normalizedName = typeof rawName === 'string' ? rawName.trim() : '';
    const nextName = normalizedName.slice(0, 24);

    if (!nextName) throw new Error('Nickname is required');

    const newState = JSON.parse(JSON.stringify(state));
    const player = newState.lobby.players.find((p: any) => p.id === intent.playerId);

    if (!player) throw new Error('Player not in lobby');

    player.name = nextName;
    return newState;
}

function handleSelectCharacter(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
    
    const newState = JSON.parse(JSON.stringify(state));
    const playerIndex = newState.lobby.players.findIndex((p: any) => p.id === intent.playerId);
    
    if (playerIndex === -1) throw new Error('Player not in lobby');
    
    const charClass = intent.payload?.characterClass;
    if (!charClass) throw new Error('Character class required');
    
    // Optional: Update Nickname
    if (intent.payload?.name) {
        newState.lobby.players[playerIndex].name = intent.payload.name;
    }
    
    // Check if class taken by OTHERS
    const taken = newState.lobby.players.some((p: any) => 
        p.characterClass === charClass && p.id !== intent.playerId
    );
    if (taken) throw new Error('Character class already taken');

    newState.lobby.players[playerIndex].characterClass = charClass;
    newState.lobby.players[playerIndex].ready = true; // Auto-ready on select

    return newState;
}

function handleStartGame(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
    if (state.lobby.players[0].id !== intent.playerId) throw new Error('Only host can start game');
    
    const newState = JSON.parse(JSON.stringify(state));
    
    newState.phase = GamePhase.Players;
    newState.turn = 1;
    newState.players = newState.lobby.players.map((p: any) => p.id);
    
    const deckResult = DeckService.initializeDeck(newState.seed);
    newState.equipmentDeck = deckResult.deck;
    newState.seed = deckResult.newSeed;

    const spawnResult = DeckService.initializeSpawnDeck(newState.seed);
    newState.spawnDeck = spawnResult.deck;
    newState.seed = spawnResult.newSeed;

    // --- MAP GENERATION ---
    if (intent.payload?.map) {
        const mapData = intent.payload.map;
        console.log(`Loading map: ${mapData.name}`);
        
        newState.tiles = mapData.tiles;

        // Use ScenarioCompiler for both new and legacy map formats
        const compiled = isLegacyMap(mapData)
            ? compileLegacyTiles(mapData.tiles)
            : compileScenario(mapData);

        newState.zones = compiled.zones;
        newState.objectives = compiled.objectives;

        const startZoneId = compiled.playerStartZoneId;
        
        // Initialize Survivors at Start Zone
        newState.lobby.players.forEach((p: any, index: number) => {
            const survivorId = `survivor-${p.id}`;
            const survivor: Survivor = {
                id: survivorId,
                playerId: p.id,
                name: p.name,
                characterClass: p.characterClass,
                position: { x: 0, y: 0, zoneId: startZoneId },
                actionsPerTurn: 3,
                maxHealth: 3,
                wounds: 0,
                experience: 0,
                dangerLevel: DangerLevel.Blue,
                skills: ['+1 Action'],
                inventory: [
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

    } else {
        // --- LEGACY HARDCODED MAP ---
        
        // Initialize Objectives
        newState.objectives = [
            {
                id: 'obj-reach-exit',
                type: ObjectiveType.ReachExit,
                description: 'All Survivors must reach the Exit Zone (Zone Exit)',
                targetId: 'zone-exit',
                amountRequired: 1, // Only 1 exit zone for now
                amountCurrent: 0,
                completed: false
            },
            // Temporary: Test Objective
            {
                id: 'obj-take-evidence',
                type: ObjectiveType.TakeObjective,
                description: 'Secure the evidence from the Police Station.',
                amountRequired: 1,
                amountCurrent: 0,
                completed: false
            }
        ];

        newState.survivors = {};
        newState.lobby.players.forEach((p: any, index: number) => {
            const survivorId = `survivor-${p.id}`;
            const survivor: Survivor = {
                id: survivorId,
                playerId: p.id,
                name: p.name,
                characterClass: p.characterClass,
                position: { x: 0, y: 0, zoneId: 'street-start' },
                actionsPerTurn: 3,
                maxHealth: 3,
                wounds: 0,
                experience: 0,
                dangerLevel: DangerLevel.Blue,
                skills: ['+1 Action'],
                inventory: [
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
    }

    return newState;
}

function handleEndGame(state: GameState, intent: ActionRequest): GameState {
    const hostId = state.lobby.players[0]?.id || state.players[0];
    if (!hostId) throw new Error('Cannot end game without a host');
    if (intent.playerId !== hostId) throw new Error('Only host can end game');

    const resetState = JSON.parse(JSON.stringify(initialGameState)) as GameState;
    resetState.lobby.players = state.lobby.players.map((player: any) => ({
      ...player,
      ready: false,
    }));

    return resetState;
}

// --- Game End Logic ---

function checkGameEndConditions(state: GameState): GameResult | undefined {
  const survivors = Object.values(state.survivors);
  const zombies = Object.values(state.zombies);

  if (survivors.length === 0) return undefined;

  const allDead = survivors.every(s => s.wounds >= s.maxHealth);
  if (allDead) return GameResult.Defeat;

  // No objectives? Default to survive (undefined) or maybe victory if empty? 
  // Standard Zombicide usually has at least one.
  if (!state.objectives || state.objectives.length === 0) return undefined;

  const livingSurvivors = survivors.filter(s => s.wounds < s.maxHealth);
  
  // Check if ALL objectives are met
  const allObjectivesMet = state.objectives.every(obj => {
      if (obj.completed) return true;

      if (obj.type === ObjectiveType.ReachExit) {
          if (!obj.targetId) return false;
          
          const exitZoneId = obj.targetId;
          // All living survivors must be in the exit zone
          const allInExit = livingSurvivors.every(s => s.position.zoneId === exitZoneId);
          if (!allInExit) return false;

          // Zone must be clear of zombies
          const zombiesInExit = zombies.some(z => z.position.zoneId === exitZoneId);
          if (zombiesInExit) return false;

          return true;
      }
      
      // For other types (Take/Kill/Collect), if not marked completed, check amount
      if (obj.type === ObjectiveType.CollectItem) {
        // Collect Item: Check if ANY survivor has the item(s) in inventory
        // Assuming targetId is the item name or ID prefix
        const requiredAmount = obj.amountRequired;
        let foundAmount = 0;

        livingSurvivors.forEach(s => {
          s.inventory.forEach(card => {
            // Simple match: does card name contain targetId? or exact match?
            // Let's use includes for flexibility (e.g. "Canned Food")
            if (obj.targetId && card.name.includes(obj.targetId)) {
               foundAmount++;
            }
          });
        });

        // Update amountCurrent for UI feedback
        // Note: This is a read-only check usually, but we can update state here
        // However, this function is called frequently, so be careful with mutations if state is immutable
        // Here we just check the condition.
        return foundAmount >= requiredAmount;
      }

      return obj.amountCurrent >= obj.amountRequired;
  });

  if (allObjectivesMet) {
      return GameResult.Victory;
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

  // Edge-level door check
  if (isDoorBlocked(currentZone, targetId)) {
    throw new Error('Door is closed. You must open it first.');
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

  // Edge-level door check
  const conn = getConnection(currentZone, targetZoneId);
  if (!conn) throw new Error('No connection to target zone');
  if (!conn.hasDoor) throw new Error('No door on this edge');
  if (conn.doorOpen) throw new Error('Door is already open');

  const hasOpener = survivor.inventory.some((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (!hasOpener) throw new Error('Requires equipment to open doors (in hand)');

  // Open door on both sides of the edge
  openDoorEdge(newState, survivor.position.zoneId, targetZoneId);

  const opener = survivor.inventory.find((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (opener && opener.openDoorNoise) {
    const zone = newState.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

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
  if (state.equipmentDeck.length === 0 && state.equipmentDiscard.length === 0) {
      console.warn('Deck empty during search. Auto-initializing deck.');
      const deckResult = DeckService.initializeDeck(state.seed);
      state.equipmentDeck = deckResult.deck;
      state.seed = deckResult.newSeed;
  }

  const { card, newState } = DeckService.drawCard(state);
  if (!card) throw new Error('Deck empty'); 

  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (survivor.hasSearched) throw new Error('Already searched this turn');
  if (!zone.isBuilding && !survivor.skills.includes('search_anywhere')) {
    throw new Error('Can only search inside buildings');
  }
  if (Object.values(newState.zombies).some((z: any) => z.position.zoneId === zone.id)) {
    throw new Error('Cannot search zone with zombies');
  }

  // Check if Hand is Full OR Inventory Full
  // If Hand is Full, we force the Rearrange Modal even if Backpack has space.
  const handFull = EquipmentManager.isHandFull(survivor);
  const hasSpace = EquipmentManager.hasSpace(survivor);

  if (!handFull && hasSpace) {
    newState.survivors[intent.survivorId!] = EquipmentManager.addCard(survivor, card);
  } else {
    // Hand Full or Inventory Full -> Trigger Modal
    survivor.drawnCard = card;
  }

  survivor.hasSearched = true;
  return newState;
}

function handleResolveSearch(state: GameState, intent: ActionRequest): GameState {
  const survivor = state.survivors[intent.survivorId!];
  if (!survivor.drawnCard) throw new Error('No drawn card to resolve');

  const action = intent.payload?.action; 
  
  if (action === 'DISCARD') {
    const newState = JSON.parse(JSON.stringify(state));
    newState.equipmentDiscard.push(survivor.drawnCard);
    newState.survivors[intent.survivorId!].drawnCard = undefined;
    return newState;
  } else if (action === 'EQUIP') {
    const targetSlot = intent.payload?.targetSlot;
    if (!targetSlot) throw new Error('Target slot required for EQUIP');

    const newState = JSON.parse(JSON.stringify(state));
    const s = newState.survivors[intent.survivorId!];
    
    // Check if slot occupied
    if (targetSlot === 'BACKPACK') {
        const backpackCount = s.inventory.filter((c: EquipmentCard) => c.slot === 'BACKPACK').length;
        if (backpackCount >= 3) throw new Error('Backpack is full (max 3).');
    } else {
        const occupied = s.inventory.some((c: EquipmentCard) => c.slot === targetSlot);
        if (occupied) throw new Error(`Slot ${targetSlot} is occupied. Move item first.`);
    }
    
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

function handleOrganize(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const cardId = intent.payload?.cardId;
  const targetSlot = intent.payload?.targetSlot;

  if (!cardId || !targetSlot) throw new Error('Missing cardId or targetSlot');

  // Handle explicit DISCARD action via Organize
  if (targetSlot === 'DISCARD') {
      return EquipmentManager.discardCard(state, survivorId, cardId);
  }

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

  let weapon: EquipmentCard | undefined;
  if (weaponId) {
    weapon = survivor.inventory.find((c: EquipmentCard) => c.id === weaponId && c.inHand);
    if (!weapon) throw new Error('Weapon not found or not equipped');
  } else {
    const weapons = survivor.inventory.filter((c: EquipmentCard) => c.type === 'WEAPON' && c.inHand);
    if (weapons.length === 1) weapon = weapons[0];
    else if (weapons.length === 0) throw new Error('No weapon equipped');
    else throw new Error('Multiple weapons equipped, specify weaponId');
  }

  if (!weapon) throw new Error('No weapon found');
  if (weapon.type !== 'WEAPON' || !weapon.stats) throw new Error('Item is not a weapon');
  
  const stats = weapon.stats;

  const currentZoneId = survivor.position.zoneId;
  let distance = 0;
  
  if (currentZoneId !== targetZoneId) {
     distance = getDistance(state, currentZoneId, targetZoneId);
     if (distance === Infinity) throw new Error('Target zone not reachable');
  }
  
  if (distance < stats.range[0] || distance > stats.range[1]) {
      throw new Error(`Target out of range (${distance}). Weapon range: ${stats.range.join('-')}`);
  }

  const diceCount = stats.dice; 
  const threshold = stats.accuracy;
  const result = rollDice(newState.seed, diceCount, threshold);
  newState.seed = result.newSeed;

  newState.lastAction = {
      type: ActionType.ATTACK,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      dice: (result as any).rolls || [], 
      hits: result.hits,
      timestamp: Date.now(),
      description: `Attacked with ${weapon.name} (Need ${threshold}+)`
  };

  let zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];
  
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
          delete newState.zombies[zombie.id];
          xpGained += getZombieXP(zombie.type);
          hits--;

          // Update Kill Objectives
          if (newState.objectives) {
              newState.objectives.forEach((obj: Objective) => {
                  if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
                      // Check if specific type or ANY
                      if (!obj.targetId || obj.targetId === zombie.type) {
                          obj.amountCurrent += 1;
                          if (obj.amountCurrent >= obj.amountRequired) {
                              obj.completed = true;
                          }
                      }
                  }
              });
          }
      } else {
          hits--; 
      }
  }

  if (xpGained > 0) {
    newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, xpGained);
  }

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

  if (stats.noise) {
      const zone = newState.zones[survivor.position.zoneId];
      zone.noiseTokens = (zone.noiseTokens || 0) + 1;
      newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

  return newState;
}

// --- Trade Handlers ---

function handleTradeStart(state: GameState, intent: ActionRequest): GameState {
  const survivorId = intent.survivorId!;
  const targetSurvivorId = intent.payload?.targetSurvivorId;

  if (!targetSurvivorId) throw new Error('Target survivor required');
  if (state.activeTrade) throw new Error('Trade already active');

  const newState = JSON.parse(JSON.stringify(state));
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

function handleTradeOffer(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) throw new Error('No active trade');
  
  const survivorId = intent.survivorId!;
  const offerIds = intent.payload?.offerCardIds as string[];

  if (!offerIds) throw new Error('Offer IDs required');

  const newState = JSON.parse(JSON.stringify(state));
  const trade = newState.activeTrade;

  if (survivorId !== trade.activeSurvivorId && survivorId !== trade.targetSurvivorId) {
    throw new Error('Not a participant in this trade');
  }

  const survivor = newState.survivors[survivorId];
  const inventoryIds = survivor.inventory.map((c: any) => c.id);
  const allOwned = offerIds.every((id: string) => inventoryIds.includes(id));
  
  if (!allOwned) throw new Error('Cannot offer items you do not own');

  trade.offers[survivorId] = offerIds;
  trade.status[trade.activeSurvivorId] = false;
  trade.status[trade.targetSurvivorId] = false;

  return newState;
}

function handleTradeAccept(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) throw new Error('No active trade');
  
  const survivorId = intent.survivorId!;
  const newState = JSON.parse(JSON.stringify(state));
  const trade = newState.activeTrade;

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

function handleTradeCancel(state: GameState, intent: ActionRequest): GameState {
  if (!state.activeTrade) return state; 
  
  const newState = JSON.parse(JSON.stringify(state));
  delete newState.activeTrade;
  return newState;
}

function executeTrade(state: GameState): GameState {
  const session = state.activeTrade!;
  const id1 = session.activeSurvivorId;
  const id2 = session.targetSurvivorId;
  
  const s1 = state.survivors[id1];
  const s2 = state.survivors[id2];

  const offer1 = session.offers[id1] || []; 
  const offer2 = session.offers[id2] || []; 

  const layout1 = session.receiveLayouts?.[id1] || {};
  const layout2 = session.receiveLayouts?.[id2] || {};

  const keep1 = s1.inventory.filter((c: any) => !offer1.includes(c.id));
  const keep2 = s2.inventory.filter((c: any) => !offer2.includes(c.id));
  
  const cards1 = s1.inventory.filter((c: any) => offer1.includes(c.id));
  const cards2 = s2.inventory.filter((c: any) => offer2.includes(c.id));

  // Cards going TO Survivor 2 (from S1)
  const toS2 = cards1.map((c: any) => {
      const targetSlot = layout2[c.id] || 'BACKPACK';
      const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
      return { ...c, slot: targetSlot, inHand };
  }).filter((c: any) => c.slot !== 'DISCARD');

  // Cards going TO Survivor 1 (from S2)
  const toS1 = cards2.map((c: any) => {
      const targetSlot = layout1[c.id] || 'BACKPACK';
      const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
      return { ...c, slot: targetSlot, inHand };
  }).filter((c: any) => c.slot !== 'DISCARD');

  // Keep items but remove if they were moved to DISCARD
  // This handles OWNED items being discarded
  // We need to check if ANY item in the inventory was mapped to 'DISCARD' in the layout
  // and update its slot.
  
  const processInventory = (inventory: EquipmentCard[], layout: Record<string, string>) => {
      return inventory.map(c => {
          if (layout[c.id] === 'DISCARD') {
              return { ...c, slot: 'DISCARD' };
          }
          // Also apply other local reorganizations if specified in layout?
          // The current implementation only uses layout for RECEIVED items.
          // But user wants to "select what to discard" which might include existing items.
          // So let's apply layout to existing items too if present.
          if (layout[c.id]) {
              const targetSlot = layout[c.id];
              const inHand = targetSlot === 'HAND_1' || targetSlot === 'HAND_2';
              return { ...c, slot: targetSlot, inHand };
          }
          return c;
      }).filter(c => c.slot !== 'DISCARD');
  };

  s1.inventory = [...processInventory(keep1, layout1), ...toS1];
  s2.inventory = [...processInventory(keep2, layout2), ...toS2];
  
  if (s1.actionsRemaining > 0) s1.actionsRemaining -= 1;

  delete state.activeTrade;
  
  state.history.push({
    playerId: 'system',
    survivorId: id1,
    actionType: 'TRADE_COMPLETE',
    timestamp: Date.now(),
    payload: { partner: id2, items1: offer1.length, items2: offer2.length }
  });

  return state;
}

function handleTrade(state: GameState, intent: ActionRequest): GameState {
    throw new Error('Deprecated. Use TRADE_START flow.');
}


function handleTakeObjective(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Remove objective token
  zone.hasObjective = false;
  
  // Grant XP (Standard is 5)
  newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, 5);

  // Update Objectives Progress
  if (newState.objectives) {
      newState.objectives.forEach((obj: Objective) => {
          if (obj.type === ObjectiveType.TakeObjective && !obj.completed) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) {
                  obj.completed = true;
              }
          }
      });
  }

  newState.history.push({
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      actionType: ActionType.TAKE_OBJECTIVE,
      timestamp: Date.now(),
      payload: { zoneId: zone.id }
  });

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
