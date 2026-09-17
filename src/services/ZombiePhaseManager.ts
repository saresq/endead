
import { GameState, GamePhase, DangerLevel, Zombie, ZombieType, ZoneId, SpawnCard, SpawnDetail, Survivor } from '../types/GameState';
import { ZombieAI } from './ZombieAI';
import { DeckService } from './DeckService';
import { XPManager } from './XPManager';
import { applyWound } from './Wounds';
import { reloadAllWeapons, getZombieToughness } from './handlers/handlerUtils';
import { DANGER_VALUES } from '../config/DangerValues';

/** Monotonic id per zombie activation set — the instance Tough is spent against. */
let nextActivationId = 1;

export class ZombiePhaseManager {

  public static executeZombiePhase(state: GameState): GameState {
    let newState = structuredClone(state);

    if (newState.phase !== GamePhase.Zombies) {
      newState.phase = GamePhase.Zombies;
    }

    newState.spawnContext = { cards: [], zombieWounds: [], timestamp: Date.now() };

    // 1. Activation Step
    const livingZombieIds = Object.values(newState.zombies)
      .filter(z => !this.isZombieDead(z))
      .map(z => z.id);
    this.activateZombieSet(newState, livingZombieIds);

    // 2. Spawn Step
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
    return zombie.wounds >= getZombieToughness(zombie.type);
  }

  /** Ids of every living zombie of one type — what an extra activation acts on. */
  private static idsOfType(state: GameState, type: ZombieType): string[] {
    return Object.values(state.zombies)
      .filter(z => z.type === type && !this.isZombieDead(z))
      .map(z => z.id);
  }

  /**
   * Distributes accumulated zombie attacks per zone.
   * Single-survivor zones: apply wounds directly.
   * Multi-survivor zones: defer to player via pendingZombieWounds.
   *
   * `contextId` is the activation set the attacks came from — Tough ignores one
   * wound per set, so entries from different sets are never merged.
   */
  private static distributeZoneWounds(
    state: GameState,
    zoneAttacks: Record<string, number>,
    contextId: string,
  ): void {
    for (const [zoneId, attackCount] of Object.entries(zoneAttacks)) {
      if (attackCount <= 0) continue;

      const survivorsInZone = Object.values(state.survivors).filter(
        (s: Survivor) => s.position.zoneId === zoneId && s.wounds < s.maxHealth
      );

      if (survivorsInZone.length === 0) continue;

      if (survivorsInZone.length === 1) {
        // Only one survivor — apply all wounds directly (no player choice needed)
        applyWound(state, survivorsInZone[0].id, attackCount, { toughKey: contextId, record: true });
      } else {
        // Multiple survivors — players choose how to distribute wounds
        if (!state.pendingZombieWounds) {
          state.pendingZombieWounds = [];
        }
        const existing = state.pendingZombieWounds.find(
          p => p.zoneId === zoneId && p.contextId === contextId,
        );
        if (existing) {
          existing.totalWounds += attackCount;
        } else {
          state.pendingZombieWounds.push({
            zoneId,
            totalWounds: attackCount,
            survivorIds: survivorsInZone.map(s => s.id),
            contextId,
          });
        }
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
      // Per rules/10-zombie-phase.md#colored-spawn-zones: dormant colored Spawn Zones receive no spawn until the
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
   * Activates a set of zombies per Zombicide v2 rulebook §9. Used by the
   * Activation Step, Extra Activation cards, Rush and pool exhaustion.
   * Pass 1: ALL attacks. Pass 2: moves of zombies that didn't attack.
   * Pass 3: Runner second actions.
   *
   * Single-survivor zones take wounds directly; multi-survivor zones queue
   * them in pendingZombieWounds for the host to distribute.
   */
  private static activateZombieSet(state: GameState, zombieIds: string[]): void {
    // One Tough instance per activation: the first pass and the Runners' second
    // action are the same attack step, a later extra activation is a new one.
    const contextId = `zombie-step-${state.turn}-${nextActivationId++}`;

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
    this.distributeZoneWounds(state, pass1Attacks, contextId);

    // Pass 2: moves (only non-attackers). A group facing equally short routes
    // splits between them, evenly per type (rules/10-zombie-phase.md#splitting).
    const routeCursor = new Map<string, number>();
    for (const zombie of getZombies()) {
      if (attackedSet.has(zombie.id)) continue;
      const action = ZombieAI.getAction(state, zombie);
      if (action.type === 'MOVE') this.stepZombie(zombie, action.toZoneIds, routeCursor);
    }

    // Runner second actions
    const hasRunners = getZombies().some(z => z.type === ZombieType.Runner);
    if (hasRunners) {
      const runnerAttacks: Record<string, number> = {};
      const runnerCursor = new Map<string, number>();
      for (const zombie of getZombies()) {
        if (zombie.type !== ZombieType.Runner) continue;
        const action = ZombieAI.getAction(state, zombie);
        if (action.type === 'ATTACK') {
          runnerAttacks[zombie.position.zoneId] = (runnerAttacks[zombie.position.zoneId] || 0) + 1;
        } else if (action.type === 'MOVE') {
          this.stepZombie(zombie, action.toZoneIds, runnerCursor);
        }
      }
      this.distributeZoneWounds(state, runnerAttacks, contextId);
    }
  }

  /**
   * Moves one zombie along one of its shortest routes. When several are tied,
   * the zone's zombies of that type are dealt round-robin between them, so the
   * group splits evenly instead of all following the same edge.
   */
  private static stepZombie(zombie: Zombie, options: ZoneId[] | undefined, cursor: Map<string, number>): void {
    if (!options?.length) return;

    const key = `${zombie.position.zoneId}|${zombie.type}`;
    const taken = cursor.get(key) ?? 0;
    cursor.set(key, taken + 1);
    zombie.position.zoneId = options[taken % options.length];
  }

  public static applySpawnDetail(state: GameState, zoneId: ZoneId, detail: SpawnDetail) {
      // Handle Extra Activation: re-activate ALL zombies of that type
      // Per rulebook §9/§15: Extra Activation cards have no effect at Blue Danger Level
      if (detail.extraActivation) {
         if (state.currentDangerLevel === DangerLevel.Blue) return;
         this.activateZombieSet(state, this.idsOfType(state, detail.extraActivation));
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
              const activeAbomCount = this.idsOfType(state, ZombieType.Abomination).length;

              if (activeAbomCount > 0) {
                // Extra activation of all existing Abominations
                this.activateZombieSet(state, this.idsOfType(state, ZombieType.Abomination));

                // Abomination Fest: also spawn the new one after activation
                if (!state.config.abominationFest) continue;
                festActivated = true;
              }
            }

            // Pool exhaustion check
            const poolLimit = state.config.zombiePool?.[zombieType] ?? Infinity;
            const currentCount = this.idsOfType(state, zombieType).length;
            const available = Math.max(0, poolLimit - currentCount);

            if (available === 0) {
              // Pool exhausted: extra activation of all zombies of that type instead
              if (festActivated) continue;
              this.activateZombieSet(state, this.idsOfType(state, zombieType));
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
              this.activateZombieSet(state, this.idsOfType(state, zombieType));
            }
         }

         // Rush: the just-spawned zombies immediately activate
         if (detail.rush && spawnedIds.length > 0) {
           this.activateZombieSet(state, spawnedIds);
         }
      }
  }

  public static spawnZombie(state: GameState, zoneId: ZoneId, type: ZombieType) {
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

    // 2a. Reload — every `reload` weapon is loaded again for free
    reloadAllWeapons(newState);

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
