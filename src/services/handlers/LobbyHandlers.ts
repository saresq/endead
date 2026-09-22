
import { GameState, GamePhase, DangerLevel, EquipmentCard, Survivor, initialGameState, ObjectiveColor } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import { DeckService } from '../DeckService';
import { XPManager } from '../XPManager';
import { compileScenario } from '../ScenarioCompiler';
import { SURVIVOR_CLASSES } from '../../config/SkillRegistry';
import { DEFAULT_MAP } from '../../config/DefaultMap';
import {
  CHARACTER_DEFINITIONS,
  buildStartingCard,
  STARTING_WEAPON_SUPPLY,
  FIRST_PLAYER_EQUIPMENT_ID,
} from '../../config/CharacterRegistry';
import { seedFromString } from '../Rng';
import { es } from '../../strings/es';

export function handleJoinLobby(state: GameState, intent: ActionRequest): GameState {
    return state;
}

export function handleUpdateNickname(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error(es.errors.gameStarted);

    const rawName = intent.payload?.name;
    const normalizedName = typeof rawName === 'string' ? rawName.replace(/<[^>]*>/g, '').trim() : '';
    const nextName = normalizedName.slice(0, 24);

    if (!nextName) throw new Error(es.errors.nameRequired);

    const newState = structuredClone(state);
    const player = newState.lobby.players.find((p: any) => p.id === intent.playerId);

    if (!player) throw new Error(es.errors.notInLobby);

    player.name = nextName;
    return newState;
}

export function handleSelectCharacter(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error(es.errors.gameStarted);

    const newState = structuredClone(state);
    const playerIndex = newState.lobby.players.findIndex((p: any) => p.id === intent.playerId);

    if (playerIndex === -1) throw new Error(es.errors.notInLobby);

    const charClass = intent.payload?.characterClass;
    if (!charClass) throw new Error('Character class required');
    // A character the server doesn't know is a client bug. Substituting one
    // hides it and hands the player a survivor they never picked.
    if (!CHARACTER_DEFINITIONS[charClass]) throw new Error(es.errors.unknownCharacter);

    // Optional: Update Nickname
    if (intent.payload?.name) {
        newState.lobby.players[playerIndex].name = intent.payload.name;
    }

    // Check if class taken by OTHERS
    const taken = newState.lobby.players.some((p: any) =>
        p.characterClass === charClass && p.id !== intent.playerId
    );
    if (taken) throw new Error(es.errors.characterTaken);

    newState.lobby.players[playerIndex].characterClass = charClass;
    newState.lobby.players[playerIndex].ready = isReady(newState.lobby.players[playerIndex]);

    return newState;
}

/**
 * A player is ready once they hold both halves of their loadout: a survivor
 * nobody else took and a weapon still in the starting supply.
 */
function isReady(player: { characterClass?: string; startingWeapon?: string }): boolean {
    return !!player.characterClass && !!player.startingWeapon;
}

/** Copies of `equipmentId` left in the supply, ignoring `exceptPlayerId`'s own claim. */
function remainingSupply(state: GameState, equipmentId: string, exceptPlayerId: string): number {
    const claimed = state.lobby.players.filter(
        (p: any) => p.startingWeapon === equipmentId && p.id !== exceptPlayerId,
    ).length;
    return (STARTING_WEAPON_SUPPLY[equipmentId] ?? 0) - claimed;
}

export function handleSelectWeapon(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error(es.errors.gameStarted);

    const equipmentId = intent.payload?.equipmentId;
    if (typeof equipmentId !== 'string' || !STARTING_WEAPON_SUPPLY[equipmentId]) {
        throw new Error(es.errors.unknownWeapon);
    }

    const newState = structuredClone(state);
    const player = newState.lobby.players.find((p: any) => p.id === intent.playerId);
    if (!player) throw new Error(es.errors.notInLobby);

    // Re-picking what you already hold is a no-op, not a second claim.
    if (remainingSupply(newState, equipmentId, intent.playerId) <= 0) {
        throw new Error(es.errors.weaponTaken);
    }

    player.startingWeapon = equipmentId;
    player.ready = isReady(player);

    return newState;
}

export function handleStartGame(state: GameState, intent: ActionRequest): GameState {
    if (state.phase !== GamePhase.Lobby) throw new Error(es.errors.gameStarted);
    if (state.lobby.players[0].id !== intent.playerId) throw new Error(es.errors.hostOnlyStart);

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

    const epicResult = DeckService.initializeEpicDeck(newState.seed);
    newState.epicDeck = epicResult.deck;
    newState.epicDiscard = [];
    newState.seed = epicResult.newSeed;

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
    newState.spawnColorActivation = {
      [ObjectiveColor.Blue]: { activated: false, activatedOnTurn: 0 },
      [ObjectiveColor.Green]: { activated: false, activatedOnTurn: 0 },
    };
    newState.zoneGeometry = compiled.zoneGeometry;
    newState.edgeClassMap = compiled.edgeClassMap;
    newState.doorPositions = compiled.doorPositions;
    newState.cellTypes = compiled.cellTypes;
    newState.spawnZoneIds = compiled.spawnZoneIds;

    const startZoneId = compiled.playerStartZoneId;

    // Every player claimed a survivor and a weapon in the lobby; a missing half
    // is a squad that would start unequipped, so it stops the game here.
    if (newState.lobby.players.some((p: any) => !p.characterClass)) {
        throw new Error(es.errors.characterRequired);
    }
    if (newState.lobby.players.some((p: any) => !p.startingWeapon)) {
        throw new Error(es.errors.weaponRequired);
    }

    // Initialize Survivors at Start Zone with the weapon each player claimed
    newState.lobby.players.forEach((p: any, index: number) => {
        const survivorId = `survivor-${p.id}`;
        const definition = CHARACTER_DEFINITIONS[p.characterClass];
        if (!definition) throw new Error(es.errors.unknownCharacter);

        const classProgression = SURVIVOR_CLASSES[p.characterClass];
        const startingSkills = [...classProgression[DangerLevel.Blue]];
        const startingActionsPerTurn = startingSkills.includes('plus_1_action') ? 4 : 3;

        const startingCard = buildStartingCard(p.startingWeapon, index);
        const inventory: EquipmentCard[] = startingCard ? [startingCard] : [];

        const survivor: Survivor = {
            id: survivorId,
            playerId: p.id,
            name: p.name,
            characterClass: p.characterClass,
            survivorType: definition.type,
            position: { x: 0, y: 0, zoneId: startZoneId },
            actionsPerTurn: startingActionsPerTurn,
            maxHealth: definition.maxHealth,
            wounds: 0,
            experience: 0,
            dangerLevel: DangerLevel.Blue,
            skills: startingSkills,
            skillChoices: {},
            inventory,
            actionsRemaining: startingActionsPerTurn,
            hasMoved: false,
            hasSearched: false,
            freeMovesRemaining: 0,
            freeSearchesRemaining: 0,
            freeCombatsRemaining: 0,
            freeMeleeRemaining: 0,
            freeRangedRemaining: 0,
            sprintUsedThisTurn: false,
            chargeUsedThisTurn: false,
            bornLeaderUsedThisTurn: false,
            bloodlustUsedThisTurn: false,
            lifesaverUsedThisTurn: false,
            jumpUsedThisTurn: false,
            shoveUsedThisTurn: false,
            hitAndRunFreeMove: false,
            kidSlipperyUsedThisTurn: false,
            luckyUsedThisAction: false,
        } as Survivor;
        XPManager.resetSurvivorTurn(survivor);
        newState.survivors[survivorId] = survivor;
    });

    // The Fire Axe holder takes the first player token (rules/03-setup.md#first-player).
    // Nobody has to claim the axe now that weapons are chosen, so the host
    // opens when it stayed in the supply.
    const axeIndex = newState.lobby.players.findIndex(
        (p: any) => p.startingWeapon === FIRST_PLAYER_EQUIPMENT_ID,
    );
    newState.firstPlayerTokenIndex = axeIndex >= 0 ? axeIndex : 0;
    newState.activePlayerIndex = newState.firstPlayerTokenIndex;

    return newState;
}

export function handleEndGame(state: GameState, intent: ActionRequest): GameState {
    const hostId = state.lobby.players[0]?.id || state.players[0];
    if (!hostId) throw new Error('Cannot end game without a host');
    if (intent.playerId !== hostId) throw new Error(es.errors.hostOnlyEnd);

    const resetState = structuredClone(initialGameState) as GameState;
    // Survivor and weapon carry over, so a squad can re-run a scenario without
    // re-picking; `ready` follows from what they still hold.
    resetState.lobby.players = state.lobby.players.map((player: any) => ({
      ...player,
      ready: isReady(player),
    }));

    return resetState;
}
