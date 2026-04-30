
import { GameState, GamePhase, DangerLevel, Zombie, ZombieType, ZoneId, SpawnCard, SpawnDetail, Survivor } from '../types/GameState';
import { ZombieAI, ZombieAction } from './ZombieAI';
import { DeckService } from './DeckService';
import { Rng } from './Rng';
import { XPManager } from './XPManager';

const DANGER_VALUES: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 1,
  [DangerLevel.Orange]: 2,
  [DangerLevel.Red]: 3,
};

export class ZombiePhaseManager {

  public static executeZombiePhase(state: GameState): GameState {
    let newState = structuredClone(state);

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
   *
   * Per rules: players choose how to distribute wounds among survivors in a zone.
   * When only 1 survivor is present, wounds apply directly. When multiple survivors
   * share a zone, wounds are deferred to pendingZombieWounds for player resolution.
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

    // Pass 1: ALL attacks — accumulate per zone
    const pass1Attacks: Record<string, number> = {};
    for (const zombie of getActiveZombies()) {
      const action: ZombieAction = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK') {
        pass1Attacks[zombie.position.zoneId] = (pass1Attacks[zombie.position.zoneId] || 0) + 1;
        attackedSet.add(zombie.id);
      }
    }
    this.distributeZoneWounds(state, pass1Attacks);

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
    const pass3Attacks: Record<string, number> = {};
    for (const zombie of getActiveZombies()) {
      if (zombie.type !== ZombieType.Runner) continue;

      const action: ZombieAction = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK') {
        pass3Attacks[zombie.position.zoneId] = (pass3Attacks[zombie.position.zoneId] || 0) + 1;
      } else if (action.type === 'MOVE' && action.toZoneId) {
        zombie.position.zoneId = action.toZoneId;
        state.zombies[zombie.id] = zombie;
      } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
        this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
      }
    }
    this.distributeZoneWounds(state, pass3Attacks);

    return state;
  }

  /**
   * Distributes accumulated zombie attacks per zone.
   * Single-survivor zones: apply wounds directly.
   * Multi-survivor zones: defer to player via pendingZombieWounds.
   */
  private static distributeZoneWounds(state: GameState, zoneAttacks: Record<string, number>): void {
    for (const [zoneId, attackCount] of Object.entries(zoneAttacks)) {
      if (attackCount <= 0) continue;

      const survivorsInZone = Object.values(state.survivors).filter(
        (s: Survivor) => s.position.zoneId === zoneId && s.wounds < s.maxHealth
      );

      if (survivorsInZone.length === 0) continue;

      if (survivorsInZone.length === 1) {
        // Only one survivor — apply all wounds directly (no player choice needed)
        for (let i = 0; i < attackCount; i++) {
          this.applyZombieAttack(state, survivorsInZone[0].id);
        }
      } else {
        // Multiple survivors — players choose how to distribute wounds
        if (!state.pendingZombieWounds) {
          state.pendingZombieWounds = [];
        }
        const existing = state.pendingZombieWounds.find(p => p.zoneId === zoneId);
        if (existing) {
          existing.totalWounds += attackCount;
        } else {
          state.pendingZombieWounds.push({
            zoneId,
            totalWounds: attackCount,
            survivorIds: survivorsInZone.map(s => s.id),
          });
        }
      }
    }
  }

  /**
   * Applies a zombie attack to a survivor, respecting Tough skill and armor.
   * Shared by processActivations and extra activation logic.
   */
  private static applyZombieAttack(state: GameState, targetId: string): void {
    const survivor = state.survivors[targetId];
    if (!survivor || survivor.wounds >= survivor.maxHealth) return;

    // Tough skill: ignore first wound per zombie Attack Step (independent from FF)
    if (survivor.skills?.includes('tough') && !survivor.toughUsedZombieAttack) {
      survivor.toughUsedZombieAttack = true;
      return; // Wound absorbed
    }

    // "Is That All You've Got?" — survivor can discard equipment to negate wounds
    if (survivor.skills?.includes('is_that_all_youve_got') && survivor.inventory.length > 0) {
      survivor.pendingWounds = (survivor.pendingWounds || 0) + 1;
      return; // Defer wound application until player resolves via UI picker
    }

    survivor.wounds += 1;

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
      .filter(z => z && z.spawnPoint)
      // Per RULEBOOK §9: dormant colored Spawn Zones receive no spawn until the
      // turn AFTER their matching colored Objective is taken. The strict-greater
      // gate skips turn N (when activation happened) and lets turn N+1 spawn.
      // `state.turn` increments in `endRound()` AFTER processSpawns, so during
      // turn N's Zombie Phase `state.turn === N`.
      .filter(z => {
        if (!z.spawnColor) return true;
        const act = newState.spawnColorActivation?.[z.spawnColor];
        return !!act && act.activated && newState.turn > act.activatedOnTurn;
      });

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

  /**
   * Counts living zombies of a given type currently on the board.
   */
  private static countZombiesOfType(state: GameState, type: ZombieType): number {
    return Object.values(state.zombies).filter(z => z.type === type && !this.isZombieDead(z)).length;
  }

  /**
   * Runs a two-pass activation (attack then move) for a specific set of zombies.
   * Used by both extra activation cards and rush card logic.
   */
  private static activateZombieSet(state: GameState, zombieIds: string[]): void {
    const getZombies = () => zombieIds
      .map(id => state.zombies[id])
      .filter(z => z && !this.isZombieDead(z))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Reset activated flags
    for (const zombie of getZombies()) {
      zombie.activated = false;
    }

    const attackedSet = new Set<string>();

    // Pass 1: attacks
    const pass1Attacks: Record<string, number> = {};
    for (const zombie of getZombies()) {
      const action = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK') {
        pass1Attacks[zombie.position.zoneId] = (pass1Attacks[zombie.position.zoneId] || 0) + 1;
        attackedSet.add(zombie.id);
      }
    }
    this.distributeZoneWounds(state, pass1Attacks);

    // Pass 2: moves (only non-attackers)
    for (const zombie of getZombies()) {
      if (attackedSet.has(zombie.id)) continue;
      const action = ZombieAI.getAction(state, zombie);
      if (action.type === 'MOVE' && action.toZoneId) {
        zombie.position.zoneId = action.toZoneId;
        state.zombies[zombie.id] = zombie;
      } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
        this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
      }
    }

    // Mark activated
    for (const zombie of getZombies()) {
      zombie.activated = true;
    }

    // Runner second actions
    const hasRunners = getZombies().some(z => z.type === ZombieType.Runner);
    if (hasRunners) {
      const runnerAttacks: Record<string, number> = {};
      for (const zombie of getZombies()) {
        if (zombie.type !== ZombieType.Runner) continue;
        const action = ZombieAI.getAction(state, zombie);
        if (action.type === 'ATTACK') {
          runnerAttacks[zombie.position.zoneId] = (runnerAttacks[zombie.position.zoneId] || 0) + 1;
        } else if (action.type === 'MOVE' && action.toZoneId) {
          zombie.position.zoneId = action.toZoneId;
          state.zombies[zombie.id] = zombie;
        } else if (action.type === 'BREAK_DOOR' && action.toZoneId) {
          this.breakDoor(state, zombie.position.zoneId, action.toZoneId);
        }
      }
      this.distributeZoneWounds(state, runnerAttacks);
    }
  }

  private static applySpawnDetail(state: GameState, zoneId: ZoneId, detail: SpawnDetail) {
      // Handle Extra Activation: re-activate ALL zombies of that type
      // Per rulebook §9/§15: Extra Activation cards have no effect at Blue Danger Level
      if (detail.extraActivation) {
         if (state.currentDangerLevel === DangerLevel.Blue) return;
         const targetType = detail.extraActivation;
         const zombieIds = Object.values(state.zombies)
           .filter(z => z.type === targetType && !this.isZombieDead(z))
           .map(z => z.id);
         this.activateZombieSet(state, zombieIds);
         return;
      }

      // Normal Spawn (with Abomination rules and pool exhaustion)
      if (detail.zombies) {
         const spawnedIds: string[] = [];

         for (const [type, count] of Object.entries(detail.zombies)) {
            const zombieType = type as ZombieType;

            // Abomination spawn rules
            if (zombieType === ZombieType.Abomination) {
              const activeAbomCount = this.countZombiesOfType(state, ZombieType.Abomination);

              if (activeAbomCount > 0) {
                // Extra activation of all existing Abominations
                const abomIds = Object.values(state.zombies)
                  .filter(z => z.type === ZombieType.Abomination && !this.isZombieDead(z))
                  .map(z => z.id);
                this.activateZombieSet(state, abomIds);

                // Abomination Fest: also spawn the new one after activation
                if (!state.config.abominationFest) continue;
              }
            }

            // Pool exhaustion check
            const poolLimit = state.config.zombiePool?.[zombieType] ?? Infinity;
            const currentCount = this.countZombiesOfType(state, zombieType);
            const available = Math.max(0, poolLimit - currentCount);

            if (available === 0) {
              // Pool exhausted: extra activation of all zombies of that type instead
              const typeIds = Object.values(state.zombies)
                .filter(z => z.type === zombieType && !this.isZombieDead(z))
                .map(z => z.id);
              this.activateZombieSet(state, typeIds);
              continue;
            }

            // Spawn up to available pool count
            const toSpawn = Math.min(count as number, available);
            for (let i = 0; i < toSpawn; i++) {
               this.spawnZombie(state, zoneId, zombieType);
               spawnedIds.push(`zombie-${state.nextZombieId - 1}`);
            }

            // If we couldn't place all, trigger extra activation for that type
            if (toSpawn < (count as number)) {
              const typeIds = Object.values(state.zombies)
                .filter(z => z.type === zombieType && !this.isZombieDead(z))
                .map(z => z.id);
              this.activateZombieSet(state, typeIds);
            }
         }

         // Rush: the just-spawned zombies immediately activate
         if (detail.rush && spawnedIds.length > 0) {
           this.activateZombieSet(state, spawnedIds);
         }
      }
  }

  public static spawnZombie(state: GameState, zoneId: ZoneId, type: ZombieType) {
    // Advance RNG to keep deterministic replay parity with prior implementation.
    const rng = Rng.from(state.seed);
    rng.nextU32();
    state.seed = rng.snapshot();

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

    // 2b. Medic Healing — free during End Phase
    // Medic earns 1 AP per wound healed
    for (const survivorId in newState.survivors) {
      const survivor = newState.survivors[survivorId];
      if (survivor.wounds >= survivor.maxHealth) continue; // Dead
      if (!survivor.skills.includes('medic')) continue;

      let woundsHealed = 0;
      const zoneId = survivor.position.zoneId;
      for (const otherId in newState.survivors) {
        const other = newState.survivors[otherId];
        if (other.wounds >= other.maxHealth) continue; // Dead
        if (other.position.zoneId !== zoneId) continue;
        if (other.wounds > 0) {
          other.wounds = Math.max(0, other.wounds - 1);
          woundsHealed++;
        }
      }

      if (woundsHealed > 0) {
        newState.survivors[survivorId] = XPManager.addXP(survivor, woundsHealed);
      }
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
      survivor.toughUsedZombieAttack = false;
      survivor.toughUsedFriendlyFire = false;
      // Free melee/ranged actions
      survivor.freeMeleeRemaining = survivor.skills.includes('plus_1_free_melee') ? 1 : 0;
      survivor.freeRangedRemaining = survivor.skills.includes('plus_1_free_ranged') ? 1 : 0;
      // Once-per-turn skills
      survivor.sprintUsedThisTurn = false;
      survivor.chargeUsedThisTurn = false;
      survivor.bornLeaderUsedThisTurn = false;
      survivor.bloodlustUsedThisTurn = false;
      survivor.lifesaverUsedThisTurn = false;
      survivor.hitAndRunFreeMove = false;
      survivor.luckyUsedThisTurn = false;
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
