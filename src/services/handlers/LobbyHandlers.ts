
import { GameState, GamePhase, DangerLevel, EquipmentCard, Survivor, initialGameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { DeckService } from '../DeckService';
import { compileScenario } from '../ScenarioCompiler';
import { SURVIVOR_CLASSES } from '../../config/SkillRegistry';
import { DEFAULT_MAP } from '../../config/DefaultMap';
import { EQUIPMENT_CARDS, STARTER_DECK_POOL } from '../../config/EquipmentRegistry';
import type { EventCollector } from '../EventCollector';

export function handleJoinLobby(_state: GameState, _intent: ActionRequest, _collector: EventCollector): void {
  // No-op — join is handled by the connection layer; this exists for symmetry.
}

export function handleUpdateNickname(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

  const rawName = intent.payload?.name;
  const normalizedName = typeof rawName === 'string' ? rawName.replace(/<[^>]*>/g, '').trim() : '';
  const nextName = normalizedName.slice(0, 24);
  if (!nextName) throw new Error('Nickname is required');

  const player = state.lobby.players.find(p => p.id === intent.playerId);
  if (!player) throw new Error('Player not in lobby');

  // --- Mutations + emits ---
  player.name = nextName;
  collector.emit({
    type: 'LOBBY_NICKNAME_UPDATED',
    playerId: intent.playerId,
    name: nextName,
  });
}

export function handleSelectCharacter(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

  const playerIndex = state.lobby.players.findIndex(p => p.id === intent.playerId);
  if (playerIndex === -1) throw new Error('Player not in lobby');

  const charClass = intent.payload?.characterClass;
  if (!charClass) throw new Error('Character class required');

  const taken = state.lobby.players.some(p =>
    p.characterClass === charClass && p.id !== intent.playerId
  );
  if (taken) throw new Error('Character class already taken');

  // --- Mutations + emits ---
  if (intent.payload?.name) {
    state.lobby.players[playerIndex].name = intent.payload.name;
  }
  const p = state.lobby.players[playerIndex];
  p.characterClass = charClass;
  p.ready = !!p.characterClass && !!p.starterEquipmentKey;
  collector.emit({
    type: 'LOBBY_CHARACTER_SELECTED',
    playerId: intent.playerId,
    characterClass: charClass,
  });
}

export function handlePickStarter(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

  const playerIndex = state.lobby.players.findIndex(p => p.id === intent.playerId);
  if (playerIndex === -1) throw new Error('Player not in lobby');

  const starterKey = intent.payload?.starterEquipmentKey;
  if (!starterKey) throw new Error('Starter equipment key required');

  const poolQty = STARTER_DECK_POOL[starterKey];
  if (!poolQty) throw new Error(`Unknown starter equipment: ${starterKey}`);

  const takenCount = state.lobby.players.filter(
    p => p.starterEquipmentKey === starterKey && p.id !== intent.playerId,
  ).length;
  if (takenCount >= poolQty) throw new Error('Starter card already claimed');

  // --- Mutations + emits ---
  const p = state.lobby.players[playerIndex];
  p.starterEquipmentKey = starterKey;
  p.ready = !!p.characterClass && !!p.starterEquipmentKey;
  collector.emit({
    type: 'LOBBY_STARTER_PICKED',
    playerId: intent.playerId,
    starterEquipmentKey: starterKey,
  });
}

export function handleStartGame(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
  if (state.lobby.players[0].id !== intent.playerId) throw new Error('Only host can start game');
  if (state.lobby.players.length === 0) throw new Error('Cannot start with no players');
  for (const p of state.lobby.players) {
    if (!p.characterClass) throw new Error(`${p.name || p.id} has not picked a character`);
    if (!p.starterEquipmentKey) throw new Error(`${p.name || p.id} has not picked a starter card`);
  }

  // --- Mutations + emits ---
  state.phase = GamePhase.Players;
  state.turn = 1;
  state.players = state.lobby.players.map(p => p.id);

  if (intent.payload?.abominationFest) {
    state.config.abominationFest = true;
  }

  const deckResult = DeckService.initializeDeck(state.seed);
  state.equipmentDeck = deckResult.deck;
  state.seed = deckResult.newSeed;

  const spawnResult = DeckService.initializeSpawnDeck(state.seed);
  state.spawnDeck = spawnResult.deck;
  state.seed = spawnResult.newSeed;

  const mapData = intent.payload?.map || DEFAULT_MAP;
  console.log(`Loading map: ${mapData.name}`);

  state.tiles = mapData.tiles;
  const compiled = compileScenario(mapData);

  state.zones = compiled.zones;
  state.objectives = compiled.objectives;
  state.zoneGeometry = compiled.zoneGeometry;
  state.edgeClassMap = compiled.edgeClassMap;
  state.doorPositions = compiled.doorPositions;
  state.cellTypes = compiled.cellTypes;
  state.spawnZoneIds = compiled.spawnZoneIds;

  const startZoneId = compiled.playerStartZoneId;

  state.lobby.players.forEach((p, index: number) => {
    const survivorId = `survivor-${p.id}`;
    const classProgression = SURVIVOR_CLASSES[p.characterClass] || SURVIVOR_CLASSES['Wanda'];
    const startingSkills = [...classProgression[DangerLevel.Blue]];
    const startingActionsPerTurn = startingSkills.includes('plus_1_action') ? 4 : 3;

    const starterTemplate = EQUIPMENT_CARDS[p.starterEquipmentKey];
    const inventory: EquipmentCard[] = [];
    if (starterTemplate) {
      const card: EquipmentCard = {
        id: `card-start-${p.starterEquipmentKey}-${index}`,
        ...starterTemplate,
        inHand: true,
        slot: 'HAND_1',
      };
      if (starterTemplate.keywords?.includes('reload')) card.reloaded = true;
      inventory.push(card);
    }

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
      freeSearchesRemaining: startingSkills.includes('plus_1_free_search') ? 1 : 0,
      freeCombatsRemaining: startingSkills.includes('plus_1_free_combat') ? 1 : 0,
      freeMeleeRemaining: startingSkills.includes('plus_1_free_melee') ? 1 : 0,
      freeRangedRemaining: startingSkills.includes('plus_1_free_ranged') ? 1 : 0,
      sprintUsedThisTurn: false,
      chargeUsedThisTurn: false,
      bornLeaderUsedThisTurn: false,
      toughUsedZombieAttack: false,
      toughUsedFriendlyFire: false,
    } as Survivor;
    state.survivors[survivorId] = survivor;
  });

  collector.emit({
    type: 'GAME_STARTED',
    gameId: state.id,
  });
  collector.emit({
    type: 'TURN_STARTED',
    turnNumber: state.turn,
    activePlayerId: state.players[state.activePlayerIndex],
  });
}

export function handleEndGame(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // --- Validate-first ---
  const hostId = state.lobby.players[0]?.id || state.players[0];
  if (!hostId) throw new Error('Cannot end game without a host');
  if (intent.playerId !== hostId) throw new Error('Only host can end game');

  // --- Mutations + emits ---
  // Reset to a fresh template, preserving lobby roster (cleared "ready" flag).
  // initialGameState is a module-singleton; we deep-clone via JSON round-trip
  // so the live state never shares references with the template. We must
  // mutate `state` in place — callers hold a live reference into RoomContext.
  const fresh = JSON.parse(JSON.stringify(initialGameState)) as GameState;
  const preservedLobby = state.lobby.players.map(player => ({
    ...player,
    ready: false,
    starterEquipmentKey: '',
  }));

  // Drop optional/transient fields that may exist on the live state but not
  // on the fresh template (Object.assign would leave them stale).
  delete state.gameResult;
  delete state.activeTrade;
  delete state.epicDeck;
  delete state.zoneGeometry;
  delete state.edgeClassMap;
  delete state.doorPositions;
  delete state.cellTypes;
  delete state.spawnZoneIds;
  delete state.lastAction;
  delete state.spawnContext;
  delete state.pendingZombieWounds;
  delete state.pendingFriendlyFire;
  delete state.pendingZombieSplit;

  Object.assign(state, fresh);
  state.lobby = { players: preservedLobby };

  collector.emit({ type: 'GAME_RESET' });
}
