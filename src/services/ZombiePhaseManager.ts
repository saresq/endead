
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
    const livingZombieIds = Object.values(newState.zombies)
      .filter(z => !this.isZombieDead(z))
      .map(z => z.id);
    this.activateZombieSet(newState, livingZombieIds);

    // 2. Spawn Step
    newState.spawnContext = { cards: [], timestamp: Date.now() };
    newState = this.processSpawns(newState);

    // 3. End Phase — waits in the Zombies phase until wound decisions are made;
    // ActionProcessor runs it once the last one is resolved.
    if (!this.hasPendingWounds(newState)) {
      newState = this.endRound(newState);
    }

    return newState;
  }

  /** Zombie wound distribution or "Is That All You've Got?" still to decide. */
  public static hasPendingWounds(state: GameState): boolean {
    return (state.pendingZombieWounds?.length ?? 0) > 0 ||
      Object.values(state.survivors).some(s => (s.pendingWounds ?? 0) > 0);
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
   * Used by activateZombieSet via distributeZoneWounds.
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
       const card = this.drawSpawnCard(newState);
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

       this.applySpawnDetail(newState, zone.id, detail);
    }

    return newState;
  }

  /**
   * Draws one Zombie card into `state` (mutated), rebuilding the deck when both
   * deck and discard are empty. Shared by the Spawn Step and building spawns.
   */
  public static drawSpawnCard(state: GameState): SpawnCard | null {
    if (state.spawnDeck.length === 0 && state.spawnDiscard.length === 0) {
      const deckResult = DeckService.initializeSpawnDeck(state.seed);
      state.spawnDeck = deckResult.deck;
      state.seed = deckResult.newSeed;
    }
    const { card, newState } = DeckService.drawSpawnCard(state);
    state.spawnDeck = newState.spawnDeck;
    state.spawnDiscard = newState.spawnDiscard;
    state.seed = newState.seed;
    return card;
  }

  /**
   * Counts living zombies of a given type currently on the board.
   */
  private static countZombiesOfType(state: GameState, type: ZombieType): number {
    return Object.values(state.zombies).filter(z => z.type === type && !this.isZombieDead(z)).length;
  }

  /**
   * Activates a set of zombies per Zombicide v2 rulebook §9. Used by the
   * Activation Step, Extra Activation cards, Rush and pool exhaustion.
   * Pass 1: ALL attacks. Pass 2: moves of zombies that didn't attack.
   * Pass 3: Runner second actions.
   *
   * Single-survivor zones take wounds directly; multi-survivor zones queue
   * them in pendingZombieWounds for the host to distribute.
   */
  private static activateZombieSet(state: GameState, zombieIds: string[]): void {
    const getZombies = () => zombieIds
      .map(id => state.zombies[id])
      .filter(z => z && !this.isZombieDead(z))
      .sort((a, b) => a.id.localeCompare(b.id));

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
      }
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
        }
      }
      this.distributeZoneWounds(state, runnerAttacks);
    }
  }

  public static applySpawnDetail(state: GameState, zoneId: ZoneId, detail: SpawnDetail) {
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

            // Abomination spawn rules. In Fest mode the existing Abominations
            // activate once here, so pool exhaustion must not activate them again.
            let festActivated = false;
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
                festActivated = true;
              }
            }

            // Pool exhaustion check
            const poolLimit = state.config.zombiePool?.[zombieType] ?? Infinity;
            const currentCount = this.countZombiesOfType(state, zombieType);
            const available = Math.max(0, poolLimit - currentCount);

            if (available === 0) {
              // Pool exhausted: extra activation of all zombies of that type instead
              if (festActivated) continue;
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
            if (toSpawn < (count as number) && !festActivated) {
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
    };
    state.zombies[id] = zombie;
  }

  public static getCurrentDangerLevel(state: GameState): DangerLevel {
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

  public static endRound(state: GameState): GameState {
    const newState = state;

    // 1. Clear Noise
    newState.noiseTokens = 0;
    for (const zoneId in newState.zones) {
      newState.zones[zoneId].noiseTokens = 0;
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
      XPManager.resetSurvivorTurn(newState.survivors[survivorId]);
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
