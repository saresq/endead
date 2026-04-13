
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

  private static isZombieDead(zombie: Zombie): boolean {
    const toughness = this.getZombieToughness(zombie.type);
    return zombie.wounds >= toughness;
  }

  private static getZombieToughness(type: ZombieType): number {
    switch (type) {
      case ZombieType.Walker: return 1;
      case ZombieType.Runner: return 1;
      case ZombieType.Brute: return 2;
      case ZombieType.Abomination: return 3;
    }
  }

  /**
   * Three-pass activation per Zombicide v2 rulebook §9:
   * Pass 1: ALL zombie attacks (including Runners' first action)
   * Pass 2: ALL zombie moves (zombies that couldn't attack)
   * Pass 3: Runner second actions (after ALL zombies complete first action)
   */
  private static processActivations(state: GameState): GameState {
    // We are mutating 'state' (which is already a copy from executeZombiePhase)
    const getActiveZombies = () => {
      const zombies = Object.values(state.zombies)
        .filter(z => !this.isZombieDead(z));
      zombies.sort((a, b) => a.id.localeCompare(b.id));
      return zombies;
    };

    // Track which zombies attacked (they don't move in pass 2)
    const attackedSet = new Set<string>();

    // Pass 1: ALL attacks
    for (const zombie of getActiveZombies()) {
      const action: ZombieAction = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK' && action.targetId) {
        this.applyZombieAttack(state, action.targetId);
        attackedSet.add(zombie.id);
      }
    }

    // Pass 2: ALL moves (only zombies that didn't attack)
    for (const zombie of getActiveZombies()) {
      if (attackedSet.has(zombie.id)) continue;

      const action: ZombieAction = ZombieAI.getAction(state, zombie);
      if (action.type === 'MOVE' && action.toZoneId) {
        zombie.position.zoneId = action.toZoneId;
        state.zombies[zombie.id] = zombie;
      } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
        this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
      }
    }

    // Mark all zombies as having completed first action
    for (const zombie of getActiveZombies()) {
      zombie.activated = true;
    }

    // Pass 3: Runner second actions (after ALL first actions complete)
    for (const zombie of getActiveZombies()) {
      if (zombie.type !== ZombieType.Runner) continue;

      const action: ZombieAction = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK' && action.targetId) {
        this.applyZombieAttack(state, action.targetId);
      } else if (action.type === 'MOVE' && action.toZoneId) {
        zombie.position.zoneId = action.toZoneId;
        state.zombies[zombie.id] = zombie;
      } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
        this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
      }
    }

    return state;
  }

  /**
   * Applies a zombie attack to a survivor, respecting Tough skill and armor.
   * Shared by processActivations and extra activation logic.
   */
  private static applyZombieAttack(state: GameState, targetId: string): void {
    const survivor = state.survivors[targetId];
    if (!survivor || survivor.wounds >= survivor.maxHealth) return;

    // Tough skill: ignore first wound per turn
    if (survivor.skills?.includes('tough') && !survivor.toughUsedThisTurn) {
      survivor.toughUsedThisTurn = true;
      return; // Wound absorbed
    }

    // Armor check: equipped armor absorbs the wound and is discarded
    const armorIndex = survivor.inventory.findIndex(
      (c: any) => c.type === 'ARMOR' && c.inHand && c.armorValue && c.armorValue > 0
    );
    if (armorIndex >= 0) {
      const armor = survivor.inventory.splice(armorIndex, 1)[0];
      state.equipmentDiscard.push(armor);
      return; // Wound absorbed by armor (armor destroyed per Zombicide rules)
    }

    survivor.wounds += 1;

    // TODO: Wound equipment discard — per Zombicide rules, when a survivor takes a wound,
    // they must discard 1 equipment card of their choice. This requires a UI modal
    // (wound-discard picker) so the player can choose which card to drop.
    // Coordinate with 07-ui-cleanup task for the modal implementation.
    // For now, auto-discard the last backpack item if available (fallback).
    if (survivor.wounds < survivor.maxHealth && survivor.inventory.length > 0) {
      // Auto-discard: prefer backpack items, then any item
      const backpackIdx = survivor.inventory.findIndex((c: any) => !c.inHand);
      const discardIdx = backpackIdx >= 0 ? backpackIdx : survivor.inventory.length - 1;
      const [discarded] = survivor.inventory.splice(discardIdx, 1);
      state.equipmentDiscard.push(discarded);
    }

    // Handle death: drop equipment, zero out actions
    if (survivor.wounds >= survivor.maxHealth) {
      for (const card of survivor.inventory) {
        state.equipmentDiscard.push(card);
      }
      survivor.inventory = [];
      if (survivor.drawnCard) {
        state.equipmentDiscard.push(survivor.drawnCard);
        survivor.drawnCard = undefined;
      }
      survivor.actionsRemaining = 0;
    }
  }

  /**
   * Opens a closed door between two zones (zombie breaking through).
   * Updates both directions of the connection.
   */
  private static breakDoor(state: GameState, fromZoneId: string, toZoneId: string): void {
    const fromZone = state.zones[fromZoneId];
    const toZone = state.zones[toZoneId];

    if (fromZone?.connections) {
      const conn = fromZone.connections.find(c => c.toZoneId === toZoneId);
      if (conn && conn.hasDoor && !conn.doorOpen) {
        conn.doorOpen = true;
      }
    }
    // Bidirectional
    if (toZone?.connections) {
      const conn = toZone.connections.find(c => c.toZoneId === fromZoneId);
      if (conn && conn.hasDoor && !conn.doorOpen) {
        conn.doorOpen = true;
      }
    }
  }

  private static processSpawns(state: GameState): GameState {
    let newState = state;
    
    // 1. Determine Danger Level
    const currentLevel = this.getCurrentDangerLevel(newState);
    newState.currentDangerLevel = currentLevel; // Update global state for UI

    // 2. Identify Spawn Zones — use spawnZoneIds order (placement order from map editor)
    const orderedSpawnIds = newState.spawnZoneIds
      ?? Object.values(newState.zones).filter(z => z.spawnPoint).map(z => z.id).sort();
    const spawnZones = orderedSpawnIds
      .map(id => newState.zones[id])
      .filter(z => z && z.spawnPoint);

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

       // Always apply the first card's spawn detail
       this.applySpawnDetail(newState, zone.id, detail);

       // Handle Double Spawn: draw a second card and apply it too
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
       }
    }

    return newState;
  }

  private static applySpawnDetail(state: GameState, zoneId: ZoneId, detail: SpawnDetail) {
      // Handle Extra Activation: re-activate ALL zombies of that type
      // Per rulebook §9/§15: Extra Activation cards have no effect at Blue Danger Level
      if (detail.extraActivation) {
         if (state.currentDangerLevel === DangerLevel.Blue) return;
         const targetType = detail.extraActivation;
         const getZombiesOfType = () => Object.values(state.zombies)
           .filter(z => z.type === targetType && !this.isZombieDead(z))
           .sort((a, b) => a.id.localeCompare(b.id)); // Deterministic order

         // Reset activated flags
         for (const zombie of getZombiesOfType()) {
           zombie.activated = false;
         }

         // Extra activation also uses two-pass: attacks first, then moves
         const extraAttacked = new Set<string>();

         // Pass 1: attacks
         for (const zombie of getZombiesOfType()) {
           const action = ZombieAI.getAction(state, zombie);
           if (action.type === 'ATTACK' && action.targetId) {
             this.applyZombieAttack(state, action.targetId);
             extraAttacked.add(zombie.id);
           }
         }

         // Pass 2: moves (only zombies that didn't attack)
         for (const zombie of getZombiesOfType()) {
           if (extraAttacked.has(zombie.id)) continue;
           const action = ZombieAI.getAction(state, zombie);
           if (action.type === 'MOVE' && action.toZoneId) {
             zombie.position.zoneId = action.toZoneId;
             state.zombies[zombie.id] = zombie;
           } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
             this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
           }
         }

         // Mark activated
         for (const zombie of getZombiesOfType()) {
           zombie.activated = true;
         }

         // Runner second actions during extra activation
         if (targetType === ZombieType.Runner) {
           for (const zombie of getZombiesOfType()) {
             const action = ZombieAI.getAction(state, zombie);
             if (action.type === 'ATTACK' && action.targetId) {
               this.applyZombieAttack(state, action.targetId);
             } else if (action.type === 'MOVE' && action.toZoneId) {
               zombie.position.zoneId = action.toZoneId;
               state.zombies[zombie.id] = zombie;
             } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
               this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
             }
           }
         }

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

  public static spawnZombie(state: GameState, zoneId: ZoneId, type: ZombieType) {
    // Use deterministic random from DiceService
    const rnd = nextRandom(state.seed);
    state.seed = rnd.nextSeed;

    // Generate unique ID using monotonic counter
    const zombieNum = state.nextZombieId ?? 1;
    state.nextZombieId = zombieNum + 1;
    const id = `zombie-${zombieNum}`;

    // Determine spawn position from zone geometry (not hardcoded 0,0)
    let x = 0;
    let y = 0;
    const cells = state.zoneGeometry?.zoneCells[zoneId];
    if (cells && cells.length > 0) {
      // Use center cell (middle of sorted list) for predictable placement
      const centerIdx = Math.floor(cells.length / 2);
      x = cells[centerIdx].x;
      y = cells[centerIdx].y;
    }

    const zombie: Zombie = {
      id,
      type,
      position: { x, y, zoneId },
      wounds: 0,
      activated: false
    };
    state.zombies[id] = zombie;
  }

  private static getCurrentDangerLevel(state: GameState): DangerLevel {
    let maxDangerVal = 0;
    let maxLevel = DangerLevel.Blue;

    Object.values(state.survivors)
      .filter(s => s.wounds < s.maxHealth) // Only living survivors
      .forEach(s => {
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

    // 2. Reset Zombies (activated flags)
    for (const zombieId in newState.zombies) {
      newState.zombies[zombieId].activated = false;
    }

    // 3. Reset Survivors
    for (const survivorId in newState.survivors) {
      const survivor = newState.survivors[survivorId];
      survivor.actionsRemaining = survivor.actionsPerTurn;
      survivor.hasMoved = false;
      survivor.hasSearched = false;
      // Compute free actions from skills
      survivor.freeMovesRemaining = survivor.skills.includes('plus_1_free_move') ? 1 : 0;
      survivor.freeSearchesRemaining = survivor.skills.includes('plus_1_free_search') ? 1 : 0;
      survivor.freeCombatsRemaining = survivor.skills.includes('plus_1_free_combat') ? 1 : 0;
      survivor.toughUsedThisTurn = false;
    }

    // 4. Rotate First Player (index-based, no array mutation)
    if (newState.players.length > 0) {
      newState.firstPlayerTokenIndex = (newState.firstPlayerTokenIndex + 1) % newState.players.length;
      // Active player starts at the first player token holder
      newState.activePlayerIndex = newState.firstPlayerTokenIndex;
    }

    // 5. Increment Turn
    newState.turn += 1;

    // 6. Phase -> Players
    newState.phase = GamePhase.Players;

    return newState;
  }
}
