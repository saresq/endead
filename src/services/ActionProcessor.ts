
import { GameState, ZoneId, GamePhase, Zombie, EquipmentCard, ZombieType, EquipmentType, GameResult, Survivor, DangerLevel, ObjectiveType, Objective, Zone, ZoneConnection, SpawnCard, SpawnDetail, initialGameState } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError } from '../types/Action';
import { validateTurn, advanceTurnState, checkEndTurn } from './TurnManager';
import { XPManager } from './XPManager';
import { DeckService } from './DeckService';
import { EquipmentManager, isBackpackSlot } from './EquipmentManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { rollDice, rollDiceWithReroll } from './DiceService';
import { TileInstance } from '../types/Map';
import { compileScenario } from './ScenarioCompiler';
import { SURVIVOR_CLASSES } from '../config/SkillRegistry';
import { DEFAULT_MAP } from '../config/DefaultMap';
import { buildStartingEquipment } from '../config/CharacterRegistry';

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

// --- Helper: Handle survivor death (drop equipment, mark as dead) ---
function handleSurvivorDeath(state: GameState, survivorId: string): void {
    const survivor = state.survivors[survivorId];
    if (!survivor) return;

    // Drop all equipment into the zone's discard pile
    for (const card of survivor.inventory) {
        state.equipmentDiscard.push(card);
    }
    survivor.inventory = [];
    if (survivor.drawnCard) {
        state.equipmentDiscard.push(survivor.drawnCard);
        survivor.drawnCard = undefined;
    }

    // Zero out actions so they can't act
    survivor.actionsRemaining = 0;
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
  [ActionType.TRADE_START]: handleTradeStart,
  [ActionType.TRADE_OFFER]: handleTradeOffer,
  [ActionType.TRADE_ACCEPT]: handleTradeAccept,
  [ActionType.TRADE_CANCEL]: handleTradeCancel,
  [ActionType.SPRINT]: handleSprint,
  [ActionType.USE_ITEM]: handleUseItem,
  [ActionType.NOTHING]: handleNothing,
  [ActionType.END_TURN]: handleEndTurn,
};

/**
 * Checks if a free action is available for this action type.
 * If so, consumes the free action instead of deducting AP.
 * Otherwise falls through to normal AP deduction via advanceTurnState.
 */
function deductAPWithFreeCheck(state: GameState, survivorId: string, actionType: ActionType, extraCost: number = 0): GameState {
  const newState = { ...state };
  const newSurvivors = { ...newState.survivors };
  const survivor = { ...newSurvivors[survivorId] };

  let usedFree = false;

  if (actionType === ActionType.MOVE && survivor.freeMovesRemaining > 0) {
    survivor.freeMovesRemaining--;
    usedFree = true;
  } else if (actionType === ActionType.SEARCH && survivor.freeSearchesRemaining > 0) {
    survivor.freeSearchesRemaining--;
    usedFree = true;
  } else if (actionType === ActionType.ATTACK && survivor.freeCombatsRemaining > 0) {
    survivor.freeCombatsRemaining--;
    usedFree = true;
  }

  if (usedFree) {
    // Free action covers the base cost; only apply extra cost (e.g. zombie zone penalty)
    if (extraCost > 0) {
      survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - extraCost);
    }
    newSurvivors[survivorId] = survivor;
    newState.survivors = newSurvivors;
    return checkEndTurn(newState);
  }

  // No free action — normal AP deduction (including any extra cost)
  newSurvivors[survivorId] = survivor;
  newState.survivors = newSurvivors;

  if (extraCost > 0) {
    // Deduct extra cost on top of the normal 1 AP from advanceTurnState
    const s = { ...newState.survivors[survivorId] };
    s.actionsRemaining = Math.max(0, s.actionsRemaining - extraCost);
    newState.survivors = { ...newState.survivors, [survivorId]: s };
  }

  return advanceTurnState(newState, survivorId);
}

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
        ActionType.MOVE, ActionType.ATTACK, ActionType.SEARCH, ActionType.SPRINT, ActionType.USE_ITEM,
        ActionType.OPEN_DOOR, ActionType.MAKE_NOISE, ActionType.ORGANIZE,
        ActionType.TAKE_OBJECTIVE,
        ActionType.TRADE_START, ActionType.TRADE_OFFER,
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
               newState = deductAPWithFreeCheck(newState, intent.survivorId!, intent.type);
           }
       }
       else if (intent.type === ActionType.ORGANIZE && newState.survivors[intent.survivorId!]?.drawnCard) {
           // Free Organize during Pickup/Search Resolution
       }
       else {
           // Consume transient extra AP cost (e.g. zombie zone control penalty on MOVE)
           const extraCost = newState._extraAPCost || 0;
           delete newState._extraAPCost;
           newState = deductAPWithFreeCheck(newState, intent.survivorId!, intent.type, extraCost);
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
    const normalizedName = typeof rawName === 'string' ? rawName.replace(/<[^>]*>/g, '').trim() : '';
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

        const compiled = compileScenario(mapData);

        newState.zones = compiled.zones;
        newState.objectives = compiled.objectives;
        newState.zoneGeometry = compiled.zoneGeometry;
        newState.edgeClassMap = compiled.edgeClassMap;
        newState.doorPositions = compiled.doorPositions;
        newState.cellTypes = compiled.cellTypes;
        newState.spawnZoneIds = compiled.spawnZoneIds;

        const startZoneId = compiled.playerStartZoneId;

        // Initialize Survivors at Start Zone with per-character starting equipment
        newState.lobby.players.forEach((p: any, index: number) => {
            const survivorId = `survivor-${p.id}`;
            const classProgression = SURVIVOR_CLASSES[p.characterClass] || SURVIVOR_CLASSES['Wanda'];
            const startingSkills = [...classProgression[DangerLevel.Blue]];
            const startingActionsPerTurn = startingSkills.includes('plus_1_action') ? 4 : 3;

            const startingCard = buildStartingEquipment(p.characterClass, index);
            const inventory: EquipmentCard[] = startingCard ? [startingCard] : [];

            const survivor: Survivor = {
                id: survivorId,
                playerId: p.id,
                name: p.name,
                characterClass: p.characterClass,
                position: { x: 0, y: 0, zoneId: startZoneId },
                actionsPerTurn: startingActionsPerTurn,
                maxHealth: 3,
                wounds: 0,
                experience: 0,
                dangerLevel: DangerLevel.Blue,
                skills: startingSkills,
                inventory,
                actionsRemaining: startingActionsPerTurn,
                hasMoved: false,
                hasSearched: false,
                freeMovesRemaining: startingSkills.includes('start_move') ? 1 : 0,
                freeSearchesRemaining: 0,
                freeCombatsRemaining: 0,
                toughUsedThisTurn: false,
            };
            newState.survivors[survivorId] = survivor;
        });

    } else {
        // No map provided — use the built-in City Blocks scenario
        const mapData = DEFAULT_MAP;
        console.log(`Loading default map: ${mapData.name}`);

        newState.tiles = mapData.tiles;

        const compiled = compileScenario(mapData);
        newState.zones = compiled.zones;
        newState.objectives = compiled.objectives;
        newState.zoneGeometry = compiled.zoneGeometry;
        newState.edgeClassMap = compiled.edgeClassMap;
        newState.doorPositions = compiled.doorPositions;
        newState.cellTypes = compiled.cellTypes;
        newState.spawnZoneIds = compiled.spawnZoneIds;

        const startZoneId = compiled.playerStartZoneId;

        // Initialize Survivors with per-character starting equipment
        newState.lobby.players.forEach((p: any, index: number) => {
            const survivorId = `survivor-${p.id}`;
            const classProgression = SURVIVOR_CLASSES[p.characterClass] || SURVIVOR_CLASSES['Wanda'];
            const startingSkills = [...classProgression[DangerLevel.Blue]];
            const startingActionsPerTurn = startingSkills.includes('plus_1_action') ? 4 : 3;

            const startingCard = buildStartingEquipment(p.characterClass, index);
            const inventory: EquipmentCard[] = startingCard ? [startingCard] : [];

            const survivor: Survivor = {
                id: survivorId,
                playerId: p.id,
                name: p.name,
                characterClass: p.characterClass,
                position: { x: 0, y: 0, zoneId: startZoneId },
                actionsPerTurn: startingActionsPerTurn,
                maxHealth: 3,
                wounds: 0,
                experience: 0,
                dangerLevel: DangerLevel.Blue,
                skills: startingSkills,
                inventory,
                actionsRemaining: startingActionsPerTurn,
                hasMoved: false,
                hasSearched: false,
                freeMovesRemaining: startingSkills.includes('start_move') ? 1 : 0,
                freeSearchesRemaining: 0,
                freeCombatsRemaining: 0,
                toughUsedThisTurn: false,
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

  // Per Zombicide rules: the game is lost when ANY single survivor dies
  const anyDead = survivors.some(s => s.wounds >= s.maxHealth);
  if (anyDead) return GameResult.Defeat;

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
  
  if (!getConnection(currentZone, targetId)) {
    throw new Error(`Zones not connected: ${currentZone.id} -> ${targetId}`);
  }

  // Edge-level door check
  if (isDoorBlocked(currentZone, targetId)) {
    throw new Error('Door is closed. You must open it first.');
  }

  // Zombie zone control: leaving a zone with zombies costs +1 AP
  const hasZombiesInZone = Object.values(newState.zombies)
    .some((z: any) => z.position.zoneId === survivor.position.zoneId);

  if (hasZombiesInZone && !survivor.skills.includes('slippery')) {
    // Store extra AP cost for the dispatcher to consume
    newState._extraAPCost = 1;
  }

  survivor.position.zoneId = targetId;
  survivor.hasMoved = true;

  return newState;
}

function handleSprint(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.skills.includes('sprint')) {
    throw new Error('Survivor does not have Sprint skill');
  }

  const path: string[] = intent.payload?.path;
  if (!path || !Array.isArray(path) || path.length < 2 || path.length > 3) {
    throw new Error('Sprint requires a path of 2-3 zones');
  }

  let currentZoneId = survivor.position.zoneId;
  let extraAPCost = 0;

  for (let i = 0; i < path.length; i++) {
    const targetZoneId = path[i];
    const currentZone = newState.zones[currentZoneId];
    if (!currentZone) throw new Error(`Zone ${currentZoneId} invalid`);

    if (!getConnection(currentZone, targetZoneId)) {
      throw new Error(`Zones not connected: ${currentZoneId} -> ${targetZoneId}`);
    }

    if (isDoorBlocked(currentZone, targetZoneId)) {
      throw new Error('Door is closed along sprint path');
    }

    // Leaving a zone with zombies costs +1 AP (same as regular move)
    const hasZombiesInCurrent = Object.values(newState.zombies)
      .some((z: any) => z.position.zoneId === currentZoneId);
    if (hasZombiesInCurrent && !survivor.skills.includes('slippery')) {
      extraAPCost += 1;
    }

    currentZoneId = targetZoneId;

    // Entering a zone with zombies stops movement immediately
    const hasZombiesInTarget = Object.values(newState.zombies)
      .some((z: any) => z.position.zoneId === targetZoneId);
    if (hasZombiesInTarget) {
      // Must have moved at least 2 zones for a valid sprint
      if (i + 1 < 2) {
        throw new Error('Sprint requires moving at least 2 zones but was stopped by zombies');
      }
      break;
    }
  }

  if (extraAPCost > 0) {
    newState._extraAPCost = extraAPCost;
  }

  survivor.position.zoneId = currentZoneId;
  survivor.hasMoved = true;

  return newState;
}

function handleUseItem(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const itemId = intent.payload?.itemId;

  if (!itemId) throw new Error('Item ID required');

  const itemIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === itemId);
  if (itemIndex < 0) throw new Error('Item not found in inventory');

  const item = survivor.inventory[itemIndex];

  if (item.name === 'Canned Food' || item.name === 'Water') {
    // Heal 1 wound
    if (survivor.wounds <= 0) throw new Error('Survivor has no wounds to heal');
    survivor.wounds = Math.max(0, survivor.wounds - 1);

    // Consume item (discard)
    survivor.inventory.splice(itemIndex, 1);
    newState.equipmentDiscard.push(item);
  } else {
    throw new Error(`Item "${item.name}" cannot be used as a consumable`);
  }

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
  const conn = getConnection(currentZone, targetZoneId);
  if (!conn) throw new Error('Target zone not connected');
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

  // Spawn-on-door-open: only dark rooms spawn zombies when first opened
  const behindDoor = newState.zones[targetZoneId];
  if (behindDoor && behindDoor.isBuilding && behindDoor.isDark && !behindDoor.hasBeenSpawned) {
    behindDoor.hasBeenSpawned = true;

    // Collect all connected interior zones (doorless connections within the building)
    const zonesToSpawn: ZoneId[] = [targetZoneId];
    const visited = new Set<ZoneId>([targetZoneId]);
    const queue = [targetZoneId];
    while (queue.length > 0) {
      const zid = queue.shift()!;
      const z = newState.zones[zid];
      if (!z) continue;
      for (const c of z.connections) {
        if (visited.has(c.toZoneId)) continue;
        const neighbor = newState.zones[c.toZoneId];
        if (!neighbor || !neighbor.isBuilding) continue;
        // Only traverse doorless internal connections
        if (c.hasDoor) continue;
        visited.add(c.toZoneId);
        neighbor.hasBeenSpawned = true;
        zonesToSpawn.push(c.toZoneId);
        queue.push(c.toZoneId);
      }
    }

    // Draw a spawn card for each zone and spawn zombies
    const currentLevel: DangerLevel = newState.currentDangerLevel;
    for (const zid of zonesToSpawn) {
      // Self-healing: initialize spawn deck if empty
      if (newState.spawnDeck.length === 0 && newState.spawnDiscard.length === 0) {
        const deckResult = DeckService.initializeSpawnDeck(newState.seed);
        newState.spawnDeck = deckResult.deck;
        newState.seed = deckResult.newSeed;
      }

      const drawResult = DeckService.drawSpawnCard(newState);
      newState.spawnDeck = drawResult.newState.spawnDeck;
      newState.spawnDiscard = drawResult.newState.spawnDiscard;
      newState.seed = drawResult.newState.seed;
      const card = drawResult.card;
      if (!card) continue;

      const detail = card[currentLevel] as SpawnDetail;
      if (!detail || detail.extraActivation) continue; // Skip extra activation cards for door spawns

      if (detail.zombies) {
        for (const [type, count] of Object.entries(detail.zombies)) {
          for (let i = 0; i < (count as number); i++) {
            ZombiePhaseManager.spawnZombie(newState, zid, type as ZombieType);
          }
        }
      }
    }
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
  
  newState.survivors[intent.survivorId!] = XPManager.unlockSkill(survivor, skillId);
  return newState;
}

function handleSearch(state: GameState, intent: ActionRequest): GameState {
  // Validate BEFORE drawing any cards (don't consume deck on failed search)
  const preSurvivor = state.survivors[intent.survivorId!];
  const preZone = state.zones[preSurvivor.position.zoneId];

  if (preSurvivor.hasSearched) throw new Error('Already searched this turn');
  if (!preZone.searchable && !preSurvivor.skills.includes('search_anywhere')) {
    throw new Error('Can only search inside buildings');
  }
  if (Object.values(state.zombies).some((z: any) => z.position.zoneId === preZone.id)) {
    throw new Error('Cannot search zone with zombies');
  }

  // Clone state first, then handle deck operations on the clone only
  let newState = JSON.parse(JSON.stringify(state)) as GameState;

  if (newState.equipmentDeck.length === 0 && newState.equipmentDiscard.length === 0) {
      console.warn('Deck empty during search. Auto-initializing deck.');
      const deckResult = DeckService.initializeDeck(newState.seed);
      newState.equipmentDeck = deckResult.deck;
      newState.seed = deckResult.newSeed;
  }

  // Flashlight: draw 2 cards instead of 1 (works from backpack)
  const hasFlashlight = newState.survivors[intent.survivorId!].inventory.some(
    (c: EquipmentCard) => c.name === 'Flashlight'
  );
  const cardsToDraw = hasFlashlight ? 2 : 1;

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

  // Melee attacks can only target the attacker's own zone
  const isMelee = stats.range[1] === 0;
  if (isMelee && targetZoneId !== currentZoneId) {
      throw new Error('Melee attacks can only target your own zone');
  }

  // Ranged LOS check: path must not pass through wall-blocked edges
  const isRangedWeapon = !isMelee;
  if (isRangedWeapon && currentZoneId !== targetZoneId) {
      if (!hasLineOfSight(newState, currentZoneId, targetZoneId)) {
          throw new Error('No line of sight to target zone');
      }
  }

  // --- Molotov special handler ---
  if (stats.special === 'molotov') {
      // Kill ALL zombies in target zone
      const zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];
      let xpGained = 0;
      for (const zombie of zombiesInZone) {
          xpGained += getZombieXP(zombie.type);
          delete newState.zombies[zombie.id];

          // Update Kill Objectives
          if (newState.objectives) {
              newState.objectives.forEach((obj: Objective) => {
                  if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
                      if (!obj.targetId || obj.targetId === zombie.type) {
                          obj.amountCurrent += 1;
                          if (obj.amountCurrent >= obj.amountRequired) {
                              obj.completed = true;
                          }
                      }
                  }
              });
          }
      }

      // Wound ALL survivors in target zone (1 wound each)
      const survivorsInZone = (Object.values(newState.survivors) as Survivor[]).filter(
          s => s.position.zoneId === targetZoneId && s.wounds < s.maxHealth
      );
      for (const target of survivorsInZone) {
          target.wounds += 1;
          if (target.wounds >= target.maxHealth) {
              handleSurvivorDeath(newState, target.id);
          } else if (target.inventory.length > 0) {
              // TODO: Wound equipment discard — should be player's choice via UI modal.
              // Auto-discard fallback: prefer backpack items, then any item.
              const backpackIdx = target.inventory.findIndex((c: EquipmentCard) => !c.inHand);
              const discardIdx = backpackIdx >= 0 ? backpackIdx : target.inventory.length - 1;
              const [discarded] = target.inventory.splice(discardIdx, 1);
              newState.equipmentDiscard.push(discarded);
          }
      }

      // Discard Molotov from inventory
      const molotovIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === weapon!.id);
      if (molotovIndex !== -1) {
          const [discarded] = survivor.inventory.splice(molotovIndex, 1);
          newState.equipmentDiscard.push(discarded);
      }

      // Generate noise
      const zone = newState.zones[survivor.position.zoneId];
      zone.noiseTokens = (zone.noiseTokens || 0) + 1;
      newState.noiseTokens = (newState.noiseTokens || 0) + 1;

      if (xpGained > 0) {
          newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpGained);
      }

      newState.lastAction = {
          type: ActionType.ATTACK,
          playerId: intent.playerId,
          survivorId: intent.survivorId,
          dice: [],
          hits: zombiesInZone.length,
          timestamp: Date.now(),
          description: `Threw Molotov — killed ${zombiesInZone.length} zombie(s), wounded ${survivorsInZone.length} survivor(s)`
      };

      return newState;
  }

  // --- Compute skill-based combat modifiers ---

  let bonusDice = 0;
  let bonusDamage = 0;

  // +1 Die skills (matching weapon type only)
  if (isMelee && survivor.skills.includes('plus_1_die_melee')) bonusDice++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_die_ranged')) bonusDice++;

  // +1 Damage skills
  if (isMelee && survivor.skills.includes('plus_1_damage_melee')) bonusDamage++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_damage_ranged')) bonusDamage++;

  // Dual-wield check: both hands hold same weapon with dualWield flag
  // Per rules, dual wielding = two separate attacks, not bonus dice
  let isDualWielding = false;
  if (stats.dualWield) {
    const hand1 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_1' && c.type === 'WEAPON');
    const hand2 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_2' && c.type === 'WEAPON');
    if (hand1 && hand2 && hand1.name === hand2.name) {
      isDualWielding = true;
    }
  }

  // Flashlight grants search bonus, not attack bonus (see handleSearch)

  // Plenty of Ammo: equipped in hand grants +1 die to ranged attacks
  if (isRangedWeapon) {
    const hasPlentyOfAmmo = survivor.inventory.some(
      (c: EquipmentCard) => c.name === 'Plenty of Ammo' && c.inHand
    );
    if (hasPlentyOfAmmo) bonusDice++;
  }

  const hasLucky = survivor.skills.includes('lucky');

  const diceCount = stats.dice + bonusDice;
  // Minimum accuracy is always 2+ (per rulebook §4, §10)
  const threshold = Math.max(2, stats.accuracy);

  // Perform attack(s) — dual wield = two separate attacks
  const attackCount = isDualWielding ? 2 : 1;
  let allRolls: number[] = [];
  let totalHits = 0;
  let totalMisses = 0;

  for (let atk = 0; atk < attackCount; atk++) {
    const result = hasLucky
      ? rollDiceWithReroll(newState.seed, diceCount, threshold)
      : rollDice(newState.seed, diceCount, threshold);
    newState.seed = result.newSeed;
    allRolls = allRolls.concat(result.rolls);
    totalHits += result.hits;
    totalMisses += (diceCount - result.hits);
  }

  newState.lastAction = {
      type: ActionType.ATTACK,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      dice: allRolls,
      hits: totalHits,
      timestamp: Date.now(),
      description: `Attacked with ${weapon.name}${isDualWielding ? ' (Dual Wield)' : ''} (Need ${threshold}+)`
  };

  // Targeting priority: lowest toughness first (Walker → Runner → Brute → Abomination)
  let zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];

  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Walker]: 1,
    [ZombieType.Runner]: 2,
    [ZombieType.Brute]: 3,
    [ZombieType.Abomination]: 4
  };

  zombiesInZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  let hits = totalHits;
  let xpGained = 0;

  // Friendly fire: per rules, MISSES wound survivors in the target zone.
  // Hits go to zombies. Only applies to ranged attacks with friendlies present.
  // Melee (range 0) is never subject to friendly fire.
  const isRanged = stats.range[1] >= 1;
  const hasSniper = survivor.skills.includes('sniper');
  const friendliesInZone = isRanged && newState.config.friendlyFire
      ? (Object.values(newState.survivors) as Survivor[]).filter(
            s => s.position.zoneId === targetZoneId && s.id !== survivor.id && s.wounds < s.maxHealth
        )
      : [];

  // Misses wound friendly survivors (each miss = weapon damage in wounds)
  if (friendliesInZone.length > 0 && !hasSniper) {
      let missesToApply = totalMisses;
      const effectiveDamageFF = stats.damage + bonusDamage;
      for (const friendly of friendliesInZone) {
          if (missesToApply <= 0) break;
          // Tough skill: absorb first wound per turn
          if (friendly.skills?.includes('tough') && !friendly.toughUsedThisTurn) {
              friendly.toughUsedThisTurn = true;
              missesToApply--;
              continue; // Wound absorbed
          }
          friendly.wounds += effectiveDamageFF;
          missesToApply--;
          // Check if friendly died
          if (friendly.wounds >= friendly.maxHealth) {
              handleSurvivorDeath(newState, friendly.id);
          } else if (friendly.inventory.length > 0) {
              // TODO: Wound equipment discard — should be player's choice via UI modal.
              // Auto-discard fallback: prefer backpack items, then any item.
              const backpackIdx = friendly.inventory.findIndex((c: EquipmentCard) => !c.inHand);
              const discardIdx = backpackIdx >= 0 ? backpackIdx : friendly.inventory.length - 1;
              const [discarded] = friendly.inventory.splice(discardIdx, 1);
              newState.equipmentDiscard.push(discarded);
          }
      }
  }

  // Hits go to zombies in targeting priority order
  for (const zombie of zombiesInZone) {
      if (hits <= 0) break;

      const toughness = getZombieToughness(zombie.type);
      const effectiveDamage = stats.damage + bonusDamage;
      if (effectiveDamage >= toughness) {
          delete newState.zombies[zombie.id];
          xpGained += getZombieXP(zombie.type);
          hits--;

          // Update Kill Objectives
          if (newState.objectives) {
              newState.objectives.forEach((obj: Objective) => {
                  if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
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
    newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpGained);
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
  const inventoryIds = survivor.inventory.map((c: EquipmentCard) => c.id);
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
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
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
  // This handles OWNED items being discarded
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

function handleTakeObjective(state: GameState, intent: ActionRequest): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  if (!zone.hasObjective) {
    throw new Error('No objective in this zone');
  }

  // Remove objective token
  zone.hasObjective = false;
  
  // Grant XP (use objective-specific value or default 5)
  const matchingObj = (newState.objectives || []).find(
    (obj: Objective) => obj.type === ObjectiveType.TakeObjective && !obj.completed
  );
  const xpReward = matchingObj?.xpValue ?? 5;
  newState.survivors[intent.survivorId!] = XPManager.addXP(survivor, xpReward);

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

    for (const conn of zone.connections) {
      if (!visited.has(conn.toZoneId)) {
        visited.add(conn.toZoneId);
        queue.push({ id: conn.toZoneId, dist: dist + 1 });
      }
    }
  }
  return Infinity;
}

/**
 * BFS-based Line of Sight check for ranged attacks.
 * An attack path is blocked if it must pass through a wall-blocked edge
 * or a closed door. Returns true if there exists a path with no wall/closed-door edges.
 */
function hasLineOfSight(state: GameState, startZoneId: ZoneId, endZoneId: ZoneId): boolean {
  if (startZoneId === endZoneId) return true;

  const queue: ZoneId[] = [startZoneId];
  const visited = new Set<string>();
  visited.add(startZoneId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const zone = state.zones[current];
    if (!zone) continue;

    for (const conn of zone.connections) {
      if (visited.has(conn.toZoneId)) continue;

      // Block LOS through closed doors
      if (conn.hasDoor && !conn.doorOpen) continue;

      visited.add(conn.toZoneId);
      if (conn.toZoneId === endZoneId) return true;
      queue.push(conn.toZoneId);
    }
  }

  return false;
}

function getZombieToughness(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Brute: return 2;
    case ZombieType.Abomination: return 3;
  }
}

function getZombieXP(type: ZombieType): number {
  switch (type) {
    case ZombieType.Walker: return 1;
    case ZombieType.Runner: return 1;
    case ZombieType.Brute: return 1;
    case ZombieType.Abomination: return 5;
  }
}
