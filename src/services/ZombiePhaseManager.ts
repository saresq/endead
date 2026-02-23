
import { GameState, GamePhase, DangerLevel, Zombie, ZombieType, ZoneId, SpawnCard, SpawnDetail } from '../types/GameState';
import { ZombieAI, ZombieAction } from './ZombieAI';
import { DeckService } from './DeckService';
import { nextRandom } from './DiceService';

const DANGER_VALUES: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 1,
  [DangerLevel.Orange]: 2,
  [DangerLevel.Red]: 3,
};

export class ZombiePhaseManager {

  public static executeZombiePhase(state: GameState): GameState {
    let newState = JSON.parse(JSON.stringify(state)); // Deep clone to start

    if (newState.phase !== GamePhase.Zombies) {
      newState.phase = GamePhase.Zombies;
    }

    // 1. Activation Step
    newState = this.processActivations(newState);

    // 2. Spawn Step
    newState.spawnContext = { cards: [], timestamp: Date.now() };
    newState = this.processSpawns(newState);

    // 3. End Round / Cleanup
    newState = this.endRound(newState);

    return newState;
  }

  private static processActivations(state: GameState): GameState {
    // We are mutating 'state' (which is already a copy from executeZombiePhase)
    const zombies = Object.values(state.zombies);

    // Sort to ensure deterministic order (e.g., by ID)
    zombies.sort((a, b) => a.id.localeCompare(b.id));

    for (const zombie of zombies) {
      // Skip if dead (shouldn't be in list, but sanity check)
      if (zombie.wounds >= 1 && zombie.type === ZombieType.Walker) continue; 

      let actions = 1;
      if (zombie.type === ZombieType.Runner) actions = 2;

      for (let i = 0; i < actions; i++) {
        const action: ZombieAction = ZombieAI.getAction(state, zombie);
        
        if (action.type === 'ATTACK') {
          if (action.targetId) {
             const survivor = state.survivors[action.targetId];
             if (survivor) {
               survivor.wounds += 1;
             }
          }
        } else if (action.type === 'MOVE') {
          if (action.toZoneId) {
            zombie.position.zoneId = action.toZoneId;
            state.zombies[zombie.id] = zombie; 
          }
        }
      }
      
      zombie.activated = true;
    }

    return state;
  }

  private static processSpawns(state: GameState): GameState {
    let newState = state;
    
    // 1. Determine Danger Level
    const currentLevel = this.getCurrentDangerLevel(newState);
    newState.currentDangerLevel = currentLevel; // Update global state for UI

    // 2. Identify Spawn Zones
    const spawnZones = Object.values(newState.zones).filter(z => z.spawnPoint);
    // Sort for determinism
    spawnZones.sort((a, b) => a.id.localeCompare(b.id));

    for (const zone of spawnZones) {
       // Self-healing: Initialize Spawn Deck if empty
       if (newState.spawnDeck.length === 0 && newState.spawnDiscard.length === 0) {
          console.warn('Spawn deck empty. Auto-initializing.');
          const deckResult = DeckService.initializeSpawnDeck(newState.seed);
          newState.spawnDeck = deckResult.deck;
          newState.seed = deckResult.newSeed;
       }

       // Draw Card
       let drawResult = DeckService.drawSpawnCard(newState);
       newState = drawResult.newState;
       let card = drawResult.card;

       if (!card) continue; 

       // 3. Get Spawn Detail for Current Level
       const detail: SpawnDetail = card[currentLevel];
       if (!detail) continue;

       if (newState.spawnContext) {
           newState.spawnContext.cards.push({
               zoneId: zone.id,
               cardId: card.id,
               detail: detail,
               dangerLevel: currentLevel
           });
       }

       // Handle Double Spawn (Simple Logic: Draw again immediately)
       if (detail.doubleSpawn) {
          drawResult = DeckService.drawSpawnCard(newState);
          newState = drawResult.newState;
          const secondCard = drawResult.card;
          
          if (secondCard) {
            const secondDetail = secondCard[currentLevel];
            if (secondDetail) {
               if (newState.spawnContext) {
                   newState.spawnContext.cards.push({
                       zoneId: zone.id,
                       cardId: secondCard.id,
                       detail: secondDetail,
                       dangerLevel: currentLevel
                   });
               }
               this.applySpawnDetail(newState, zone.id, secondDetail);
            }
          }
       } else {
          this.applySpawnDetail(newState, zone.id, detail);
       }
    }

    return newState;
  }

  private static applySpawnDetail(state: GameState, zoneId: ZoneId, detail: SpawnDetail) {
      // Handle Extra Activation
      if (detail.extraActivation) {
         // Activate all zombies of that type AGAIN.
         // Simplified: Spawn a Walker instead for MVP or skip if complex logic needed.
         // Ideally: iterate all zombies of type and run activation logic.
         // For now, spawn a standard zombie of that type to simulate "more trouble"
         this.spawnZombie(state, zoneId, detail.extraActivation);
         return;
      }

      // Normal Spawn
      if (detail.zombies) {
         for (const [type, count] of Object.entries(detail.zombies)) {
            for (let i = 0; i < (count as number); i++) {
               this.spawnZombie(state, zoneId, type as ZombieType);
            }
         }
      }
  }

  private static spawnZombie(state: GameState, zoneId: ZoneId, type: ZombieType) {
    // Use deterministic random from DiceService
    const rnd = nextRandom(state.seed);
    state.seed = rnd.nextSeed;
    
    // Generate simple ID
    const id = `zombie-${state.turn}-${zoneId}-${Math.floor(rnd.value * 10000)}`;
    
    const zombie: Zombie = {
      id,
      type,
      position: { x: 0, y: 0, zoneId },
      wounds: 0,
      activated: false
    };
    state.zombies[id] = zombie;
  }

  private static getCurrentDangerLevel(state: GameState): DangerLevel {
    let maxDangerVal = 0;
    let maxLevel = DangerLevel.Blue;

    Object.values(state.survivors).forEach(s => {
       const val = DANGER_VALUES[s.dangerLevel];
       if (val > maxDangerVal) {
         maxDangerVal = val;
         maxLevel = s.dangerLevel;
       }
    });
    return maxLevel;
  }

  private static endRound(state: GameState): GameState {
    const newState = state;

    // 1. Clear Noise
    newState.noiseTokens = 0;
    for (const zoneId in newState.zones) {
      newState.zones[zoneId].noiseTokens = 0;
    }

    // 2. Reset Survivors
    for (const survivorId in newState.survivors) {
      const survivor = newState.survivors[survivorId];
      survivor.actionsRemaining = survivor.actionsPerTurn;
      survivor.hasMoved = false;
      survivor.hasSearched = false;
    }

    // 3. Rotate First Player
    if (newState.players.length > 0) {
      newState.firstPlayerTokenIndex = (newState.firstPlayerTokenIndex + 1) % newState.players.length;
      newState.activePlayerIndex = newState.firstPlayerTokenIndex;
    }

    // 4. Increment Turn
    newState.turn += 1;

    // 5. Phase -> Players
    newState.phase = GamePhase.Players;

    return newState;
  }
}
