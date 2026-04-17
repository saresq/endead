
import { GameState, GamePhase, DangerLevel, EquipmentCard, Survivor, initialGameState } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { DeckService } from '../DeckService';
import { compileScenario } from '../ScenarioCompiler';
import { SURVIVOR_CLASSES } from '../../config/SkillRegistry';
import { DEFAULT_MAP } from '../../config/DefaultMap';
import { buildStartingEquipment } from '../../config/CharacterRegistry';
import { seedFromString } from '../Rng';

export function handleJoinLobby(state: GameState, intent: ActionRequest): GameState {
    return state;
}

export function handleUpdateNickname(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

    const rawName = intent.payload?.name;
    const normalizedName = typeof rawName === 'string' ? rawName.replace(/<[^>]*>/g, '').trim() : '';
    const nextName = normalizedName.slice(0, 24);

    if (!nextName) throw new Error('Nickname is required');

    const newState = structuredClone(state);
    const player = newState.lobby.players.find((p: any) => p.id === intent.playerId);

    if (!player) throw new Error('Player not in lobby');

    player.name = nextName;
    return newState;
}

export function handleSelectCharacter(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');

    const newState = structuredClone(state);
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

export function handleStartGame(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error('Game already started');
    if (state.lobby.players[0].id !== intent.playerId) throw new Error('Only host can start game');

    const newState = structuredClone(state);

    newState.phase = GamePhase.Players;
    newState.turn = 1;
    newState.players = newState.lobby.players.map((p: any) => p.id);

    // Apply lobby config
    if (intent.payload?.abominationFest) {
      newState.config.abominationFest = true;
    }

    const deckResult = DeckService.initializeDeck(newState.seed);
    newState.equipmentDeck = deckResult.deck;
    newState.seed = deckResult.newSeed;

    const spawnResult = DeckService.initializeSpawnDeck(newState.seed);
    newState.spawnDeck = spawnResult.deck;
    newState.seed = spawnResult.newSeed;

    // --- MAP GENERATION ---
    const mapData = intent.payload?.map || DEFAULT_MAP;
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
            freeSearchesRemaining: startingSkills.includes('plus_1_free_search') ? 1 : 0,
            freeCombatsRemaining: startingSkills.includes('plus_1_free_combat') ? 1 : 0,
            freeMeleeRemaining: startingSkills.includes('plus_1_free_melee') ? 1 : 0,
            freeRangedRemaining: startingSkills.includes('plus_1_free_ranged') ? 1 : 0,
            sprintUsedThisTurn: false,
            chargeUsedThisTurn: false,
            bornLeaderUsedThisTurn: false,
            bloodlustUsedThisTurn: false,
            lifesaverUsedThisTurn: false,
            hitAndRunFreeMove: false,
            luckyUsedThisTurn: false,
            toughUsedZombieAttack: false,
            toughUsedFriendlyFire: false,
        } as Survivor;
        newState.survivors[survivorId] = survivor;
    });

    return newState;
}

export function handleEndGame(state: GameState, intent: ActionRequest): GameState {
    const hostId = state.lobby.players[0]?.id || state.players[0];
    if (!hostId) throw new Error('Cannot end game without a host');
    if (intent.playerId !== hostId) throw new Error('Only host can end game');

    const resetState = structuredClone(initialGameState) as GameState;
    resetState.lobby.players = state.lobby.players.map((player: any) => ({
      ...player,
      ready: false,
    }));

    return resetState;
}
