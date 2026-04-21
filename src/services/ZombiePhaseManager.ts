
import { GameState, GamePhase, DangerLevel, Zombie, ZombieType, ZoneId, SpawnDetail, Survivor } from '../types/GameState';
import { ZombieAI } from './ZombieAI';
import { DeckService } from './DeckService';
import { Rng } from './Rng';
import { XPManager } from './XPManager';
import type { EventCollector } from './EventCollector';

const DANGER_VALUES: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 1,
  [DangerLevel.Orange]: 2,
  [DangerLevel.Red]: 3,
};

export class ZombiePhaseManager {

  public static executeZombiePhase(state: GameState, collector?: EventCollector): void {
    if (state.phase !== GamePhase.Zombies) {
      state.phase = GamePhase.Zombies;
      collector?.emit({ type: 'ZOMBIE_PHASE_STARTED', turnNumber: state.turn });
    }
    // Zombie split remainders pause the phase until the active player resolves
    // every prompt (M4, RULEBOOK §9). While any prompt is outstanding, skip
    // all further processing.
    if (state.pendingZombieSplit && state.pendingZombieSplit.prompts.length > 0) {
      return;
    }
    this.processActivations(state, collector);
    if (state.pendingZombieSplit) return; // New pause from pass 2 or pass 3 ties
    state.spawnContext = { cards: [], timestamp: Date.now() };
    this.processSpawns(state, collector);
    this.endRound(state, collector);
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
   * Pass 2: ALL zombie moves (zombies that couldn't attack); split across
   *         tied routes evenly by type. Remainder placements prompt the
   *         active player and pause the phase until resolved.
   * Pass 3: Runner second actions (after ALL zombies complete first action)
   *
   * Per rules: players choose how to distribute wounds among survivors in a
   * zone. When only 1 survivor is present, wounds apply directly. When
   * multiple survivors share a zone, wounds are deferred to
   * pendingZombieWounds for player resolution.
   */
  private static processActivations(state: GameState, collector?: EventCollector): void {
    const resume = state.pendingZombieSplit;

    if (!resume) {
      const attackedSet = this.runPass1Attacks(state, collector);

      const pass2Zombies = this.getActiveZombies(state).filter(z => !attackedSet.has(z.id));
      const plan2 = ZombieAI.planMoves(state, pass2Zombies);
      if (plan2.prompts.length > 0) {
        state.pendingZombieSplit = {
          stage: 'pass2',
          plannedMoves: plan2.plannedMoves,
          prompts: plan2.prompts,
        };
        collector?.emit({
          type: 'ZOMBIE_SPLIT_PENDING',
          stage: 'pass2',
          prompts: plan2.prompts.map((p) => ({
            zombieId: p.zombieId,
            type: p.type,
            sourceZoneId: p.sourceZoneId,
            options: p.options,
          })),
        });
        return;
      }
      this.applyPlannedMoves(state, plan2.plannedMoves, collector);
      this.markAllActivated(state, collector);
    } else if (resume.stage === 'pass2') {
      this.applyPlannedMoves(state, resume.plannedMoves, collector);
      delete state.pendingZombieSplit;
      this.markAllActivated(state, collector);
    } else if (resume.stage === 'pass3') {
      this.applyPlannedMoves(state, resume.plannedMoves, collector);
      delete state.pendingZombieSplit;
      return; // Pass 3 done; spawns/endRound follow in executeZombiePhase
    }

    // Pass 3: Runner second actions
    const runners = this.getActiveZombies(state).filter(z => z.type === ZombieType.Runner);
    const pass3Attackers = new Set<string>();
    const pass3Attacks: Record<string, number> = {};
    const pass3AttackerIdsByZone: Record<string, string[]> = {};
    for (const runner of runners) {
      if (this.isZombieAttackingZone(state, runner)) {
        const z = runner.position.zoneId;
        pass3Attacks[z] = (pass3Attacks[z] || 0) + 1;
        (pass3AttackerIdsByZone[z] ||= []).push(runner.id);
        pass3Attackers.add(runner.id);
      }
    }
    for (const [zoneId, ids] of Object.entries(pass3AttackerIdsByZone)) {
      collector?.emit({
        type: 'ZOMBIE_ATTACKED_ZONE',
        zoneId,
        attackerZombieIds: ids,
        totalWounds: pass3Attacks[zoneId],
      });
    }
    this.distributeZoneWounds(state, pass3Attacks, collector);

    const pass3Movers = runners.filter(r => !pass3Attackers.has(r.id));
    const plan3 = ZombieAI.planMoves(state, pass3Movers);
    if (plan3.prompts.length > 0) {
      state.pendingZombieSplit = {
        stage: 'pass3',
        plannedMoves: plan3.plannedMoves,
        prompts: plan3.prompts,
      };
      collector?.emit({
        type: 'ZOMBIE_SPLIT_PENDING',
        stage: 'pass3',
        prompts: plan3.prompts.map((p) => ({
          zombieId: p.zombieId,
          type: p.type,
          sourceZoneId: p.sourceZoneId,
          options: p.options,
        })),
      });
      return;
    }
    this.applyPlannedMoves(state, plan3.plannedMoves, collector);
  }

  private static getActiveZombies(state: GameState): Zombie[] {
    const zombies = Object.values(state.zombies).filter(z => !this.isZombieDead(z));
    zombies.sort((a, b) => a.id.localeCompare(b.id));
    return zombies;
  }

  private static runPass1Attacks(state: GameState, collector?: EventCollector): Set<string> {
    const attackedSet = new Set<string>();
    const pass1Attacks: Record<string, number> = {};
    const attackerIdsByZone: Record<string, string[]> = {};
    for (const zombie of this.getActiveZombies(state)) {
      if (this.isZombieAttackingZone(state, zombie)) {
        const z = zombie.position.zoneId;
        pass1Attacks[z] = (pass1Attacks[z] || 0) + 1;
        (attackerIdsByZone[z] ||= []).push(zombie.id);
        attackedSet.add(zombie.id);
      }
    }
    for (const [zoneId, ids] of Object.entries(attackerIdsByZone)) {
      collector?.emit({
        type: 'ZOMBIE_ATTACKED_ZONE',
        zoneId,
        attackerZombieIds: ids,
        totalWounds: pass1Attacks[zoneId],
      });
    }
    this.distributeZoneWounds(state, pass1Attacks, collector);
    return attackedSet;
  }

  private static isZombieAttackingZone(state: GameState, zombie: Zombie): boolean {
    const zoneId = zombie.position.zoneId;
    return Object.values(state.survivors).some(
      (s: Survivor) => s.position.zoneId === zoneId && s.wounds < s.maxHealth,
    );
  }

  private static applyPlannedMoves(
    state: GameState,
    moves: Record<string, string>,
    collector?: EventCollector,
  ): void {
    const batch: Array<{ zombieId: string; fromZoneId: string; toZoneId: string }> = [];
    for (const [zombieId, toZoneId] of Object.entries(moves)) {
      const zombie = state.zombies[zombieId];
      if (!zombie) continue;
      const fromZoneId = zombie.position.zoneId;
      if (fromZoneId === toZoneId) continue;
      zombie.position.zoneId = toZoneId;
      state.zombies[zombieId] = zombie;
      batch.push({ zombieId, fromZoneId, toZoneId });
    }
    if (batch.length > 0) {
      collector?.emit({ type: 'ZOMBIE_BATCH_MOVED', moves: batch });
    }
  }

  private static markAllActivated(state: GameState, collector?: EventCollector): void {
    const ids: string[] = [];
    for (const zombie of this.getActiveZombies(state)) {
      if (!zombie.activated) {
        zombie.activated = true;
        ids.push(zombie.id);
      }
    }
    if (ids.length > 0) {
      collector?.emit({ type: 'ZOMBIE_ACTIVATED', zombieIds: ids });
    }
  }

  /**
   * Distributes accumulated zombie attacks per zone.
   * Single-survivor zones: apply wounds directly.
   * Multi-survivor zones: defer to player via pendingZombieWounds.
   */
  private static distributeZoneWounds(
    state: GameState,
    zoneAttacks: Record<string, number>,
    collector?: EventCollector,
  ): void {
    for (const [zoneId, attackCount] of Object.entries(zoneAttacks)) {
      if (attackCount <= 0) continue;

      const survivorsInZone = Object.values(state.survivors).filter(
        (s: Survivor) => s.position.zoneId === zoneId && s.wounds < s.maxHealth
      );

      if (survivorsInZone.length === 0) continue;

      if (survivorsInZone.length === 1) {
        // Only one survivor — apply all wounds directly (no player choice needed)
        for (let i = 0; i < attackCount; i++) {
          this.applyZombieAttack(state, survivorsInZone[0].id, collector);
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
        collector?.emit({
          type: 'ZOMBIE_WOUNDS_PENDING',
          zoneId,
          totalWounds: attackCount,
          survivorIds: survivorsInZone.map(s => s.id),
        });
      }
    }
  }

  /**
   * Applies a zombie attack to a survivor, respecting Tough skill and armor.
   * Shared by processActivations and extra activation logic.
   */
  private static applyZombieAttack(
    state: GameState,
    targetId: string,
    collector?: EventCollector,
  ): void {
    const survivor = state.survivors[targetId];
    if (!survivor || survivor.wounds >= survivor.maxHealth) return;

    // Tough skill: ignore first wound per zombie Attack Step (independent from FF)
    if (survivor.skills?.includes('tough') && !survivor.toughUsedZombieAttack) {
      survivor.toughUsedZombieAttack = true;
      return; // Wound absorbed
    }

    survivor.wounds += 1;
    collector?.emit({
      type: 'SURVIVOR_WOUNDED',
      survivorId: targetId,
      amount: 1,
      source: 'zombie',
    });

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
      if (survivor.drawnCardsQueue && survivor.drawnCardsQueue.length > 0) {
        for (const card of survivor.drawnCardsQueue) state.equipmentDiscard.push(card);
        survivor.drawnCardsQueue = undefined;
      }
      survivor.actionsRemaining = 0;
      collector?.emit({ type: 'SURVIVOR_DIED', survivorId: targetId });
    }
  }

  private static processSpawns(state: GameState, collector?: EventCollector): void {
    const currentLevel = this.getCurrentDangerLevel(state);
    if (state.currentDangerLevel !== currentLevel) {
      state.currentDangerLevel = currentLevel;
      collector?.emit({ type: 'DANGER_LEVEL_GLOBAL_CHANGED', newLevel: currentLevel });
    }

    // Promote any zones queued for activation (matching-color Objective taken).
    for (const z of Object.values(state.zones)) {
      if (z.activateNextPhase) {
        z.activated = true;
        z.activateNextPhase = false;
        collector?.emit({ type: 'ZONE_SPAWN_POINT_ACTIVATED', zoneId: z.id });
      }
    }

    const orderedSpawnIds = state.spawnZoneIds
      ?? Object.values(state.zones).filter(z => z.spawnPoint).map(z => z.id).sort();
    const spawnZones = orderedSpawnIds
      .map(id => state.zones[id])
      .filter(z => z && z.spawnPoint)
      .filter(z => {
        const color = z.spawnColor ?? 'red';
        if (color === 'red') return true;
        return !!z.activated;
      });

    const drawnCards: Array<{
      zoneId: ZoneId;
      cardId: string;
      detail: SpawnDetail;
      dangerLevel: DangerLevel;
    }> = [];

    for (const zone of spawnZones) {
      if (state.spawnDeck.length === 0 && state.spawnDiscard.length === 0) {
        console.warn('Spawn deck empty. Auto-initializing.');
        const deckResult = DeckService.initializeSpawnDeck(state.seed);
        state.spawnDeck = deckResult.deck;
        state.seed = deckResult.newSeed;
        collector?.emit({
          type: 'SPAWN_DECK_REINITIALIZED',
          deckSize: state.spawnDeck.length,
        });
      }

      const card = DeckService.drawSpawnCard(state);
      if (!card) continue;

      const detail: SpawnDetail = card[currentLevel];
      if (!detail) continue;

      drawnCards.push({
        zoneId: zone.id,
        cardId: card.id,
        detail,
        dangerLevel: currentLevel,
      });
      if (state.spawnContext) {
        state.spawnContext.cards.push({
          zoneId: zone.id,
          cardId: card.id,
          detail,
          dangerLevel: currentLevel,
        });
      }

      this.applySpawnDetail(state, zone.id, detail, collector);
    }

    if (drawnCards.length > 0) {
      collector?.emit({ type: 'SPAWN_CARDS_DRAWN', cards: drawnCards });
    }
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
  private static activateZombieSet(
    state: GameState,
    zombieIds: string[],
    collector?: EventCollector,
  ): void {
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
    const pass1AttackerIdsByZone: Record<string, string[]> = {};
    for (const zombie of getZombies()) {
      const action = ZombieAI.getAction(state, zombie);
      if (action.type === 'ATTACK') {
        const z = zombie.position.zoneId;
        pass1Attacks[z] = (pass1Attacks[z] || 0) + 1;
        (pass1AttackerIdsByZone[z] ||= []).push(zombie.id);
        attackedSet.add(zombie.id);
      }
    }
    for (const [zoneId, ids] of Object.entries(pass1AttackerIdsByZone)) {
      collector?.emit({
        type: 'ZOMBIE_ATTACKED_ZONE',
        zoneId,
        attackerZombieIds: ids,
        totalWounds: pass1Attacks[zoneId],
      });
    }
    this.distributeZoneWounds(state, pass1Attacks, collector);

    // Pass 2: moves (only non-attackers). Extra-activation / Rush uses
    // deterministic single-next-step from ZombieAI.getAction; multi-zombie
    // tie-split is reserved for the main Zombie Phase (M4).
    const moveBatch: Array<{ zombieId: string; fromZoneId: string; toZoneId: string }> = [];
    for (const zombie of getZombies()) {
      if (attackedSet.has(zombie.id)) continue;
      const action = ZombieAI.getAction(state, zombie);
      if (action.type === 'MOVE' && action.toZoneId) {
        const fromZoneId = zombie.position.zoneId;
        zombie.position.zoneId = action.toZoneId;
        state.zombies[zombie.id] = zombie;
        if (fromZoneId !== action.toZoneId) {
          moveBatch.push({ zombieId: zombie.id, fromZoneId, toZoneId: action.toZoneId });
        }
      }
    }
    if (moveBatch.length > 0) {
      collector?.emit({ type: 'ZOMBIE_BATCH_MOVED', moves: moveBatch });
    }

    // Mark activated
    const activatedIds: string[] = [];
    for (const zombie of getZombies()) {
      if (!zombie.activated) {
        zombie.activated = true;
        activatedIds.push(zombie.id);
      }
    }
    if (activatedIds.length > 0) {
      collector?.emit({ type: 'ZOMBIE_ACTIVATED', zombieIds: activatedIds });
    }

    // Runner second actions
    const hasRunners = getZombies().some(z => z.type === ZombieType.Runner);
    if (hasRunners) {
      const runnerAttacks: Record<string, number> = {};
      const runnerAttackerIdsByZone: Record<string, string[]> = {};
      const runnerMoveBatch: Array<{ zombieId: string; fromZoneId: string; toZoneId: string }> = [];
      for (const zombie of getZombies()) {
        if (zombie.type !== ZombieType.Runner) continue;
        const action = ZombieAI.getAction(state, zombie);
        if (action.type === 'ATTACK') {
          const z = zombie.position.zoneId;
          runnerAttacks[z] = (runnerAttacks[z] || 0) + 1;
          (runnerAttackerIdsByZone[z] ||= []).push(zombie.id);
        } else if (action.type === 'MOVE' && action.toZoneId) {
          const fromZoneId = zombie.position.zoneId;
          zombie.position.zoneId = action.toZoneId;
          state.zombies[zombie.id] = zombie;
          if (fromZoneId !== action.toZoneId) {
            runnerMoveBatch.push({ zombieId: zombie.id, fromZoneId, toZoneId: action.toZoneId });
          }
        }
      }
      for (const [zoneId, ids] of Object.entries(runnerAttackerIdsByZone)) {
        collector?.emit({
          type: 'ZOMBIE_ATTACKED_ZONE',
          zoneId,
          attackerZombieIds: ids,
          totalWounds: runnerAttacks[zoneId],
        });
      }
      this.distributeZoneWounds(state, runnerAttacks, collector);
      if (runnerMoveBatch.length > 0) {
        collector?.emit({ type: 'ZOMBIE_BATCH_MOVED', moves: runnerMoveBatch });
      }
    }
  }

  /**
   * Draws one spawn card and applies its detail (Rush / extra activation /
   * zombies) to `zoneId` at `dangerLevel`. Self-heals an empty spawn deck
   * from the current seed. Mutates `state` in place (deck, discard, seed,
   * zombies). Returns the applied detail so callers can chain behaviours
   * like double-spawn loops — each chained draw independently passes through
   * `applySpawnDetail`, so Rush on a second draw still activates the
   * zombies it just spawned.
   */
  public static drawAndApplySpawnCard(
    state: GameState,
    zoneId: ZoneId,
    dangerLevel: DangerLevel,
    collector?: EventCollector,
  ): SpawnDetail | null {
    if (state.spawnDeck.length === 0 && state.spawnDiscard.length === 0) {
      const init = DeckService.initializeSpawnDeck(state.seed);
      state.spawnDeck = init.deck;
      state.seed = init.newSeed;
      collector?.emit({
        type: 'SPAWN_DECK_REINITIALIZED',
        deckSize: state.spawnDeck.length,
      });
    }
    const card = DeckService.drawSpawnCard(state);
    if (!card) return null;
    const detail = card[dangerLevel] as SpawnDetail;
    if (!detail) return null;
    collector?.emit({
      type: 'SPAWN_CARDS_DRAWN',
      cards: [{ zoneId, cardId: card.id, detail, dangerLevel }],
    });
    this.applySpawnDetail(state, zoneId, detail, collector);
    return detail;
  }

  public static applySpawnDetail(
    state: GameState,
    zoneId: ZoneId,
    detail: SpawnDetail,
    collector?: EventCollector,
  ) {
      // Handle Extra Activation: re-activate ALL zombies of that type
      // Per rulebook §9/§15: Extra Activation cards have no effect at Blue Danger Level
      if (detail.extraActivation) {
         if (state.currentDangerLevel === DangerLevel.Blue) return;
         const targetType = detail.extraActivation;
         collector?.emit({
           type: 'ZOMBIE_EXTRA_ACTIVATION_TRIGGERED',
           zombieType: targetType,
         });
         const zombieIds = Object.values(state.zombies)
           .filter(z => z.type === targetType && !this.isZombieDead(z))
           .map(z => z.id);
         this.activateZombieSet(state, zombieIds, collector);
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
                this.activateZombieSet(state, abomIds, collector);

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
              this.activateZombieSet(state, typeIds, collector);
              continue;
            }

            // Spawn up to available pool count
            const toSpawn = Math.min(count as number, available);
            for (let i = 0; i < toSpawn; i++) {
               const id = this.spawnZombie(state, zoneId, zombieType, collector);
               if (id) spawnedIds.push(id);
            }

            // If we couldn't place all, trigger extra activation for that type
            if (toSpawn < (count as number)) {
              const typeIds = Object.values(state.zombies)
                .filter(z => z.type === zombieType && !this.isZombieDead(z))
                .map(z => z.id);
              this.activateZombieSet(state, typeIds, collector);
            }
         }

         // Rush: the just-spawned zombies immediately activate
         if (detail.rush && spawnedIds.length > 0) {
           this.activateZombieSet(state, spawnedIds, collector);
         }
      }
  }

  public static spawnZombie(
    state: GameState,
    zoneId: ZoneId,
    type: ZombieType,
    collector?: EventCollector,
  ): string {
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
    collector?.emit({
      type: 'ZOMBIE_SPAWNED',
      zombieId: id,
      zoneId,
      zombieType: type,
    });
    return id;
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

  private static endRound(state: GameState, collector?: EventCollector): void {
    const prevPlayerIndex = state.activePlayerIndex;

    state.noiseTokens = 0;
    for (const zoneId in state.zones) {
      const had = !!state.zones[zoneId].noiseTokens;
      state.zones[zoneId].noiseTokens = 0;
      if (had) collector?.emit({ type: 'NOISE_CLEARED', zoneId });
    }

    for (const zombieId in state.zombies) {
      state.zombies[zombieId].activated = false;
    }

    // Medic Healing — free during End Phase. Medic earns 1 XP per wound healed.
    for (const survivorId in state.survivors) {
      const survivor = state.survivors[survivorId];
      if (survivor.wounds >= survivor.maxHealth) continue;
      if (!survivor.skills.includes('medic')) continue;

      let woundsHealed = 0;
      const zoneId = survivor.position.zoneId;
      for (const otherId in state.survivors) {
        const other = state.survivors[otherId];
        if (other.wounds >= other.maxHealth) continue;
        if (other.position.zoneId !== zoneId) continue;
        if (other.wounds > 0) {
          other.wounds = Math.max(0, other.wounds - 1);
          woundsHealed++;
          collector?.emit({
            type: 'SURVIVOR_HEALED',
            survivorId: otherId,
            amount: 1,
          });
        }
      }

      if (woundsHealed > 0) {
        const before = state.survivors[survivorId].experience;
        state.survivors[survivorId] = XPManager.addXP(survivor, woundsHealed);
        const after = state.survivors[survivorId].experience;
        if (after !== before) {
          collector?.emit({
            type: 'SURVIVOR_XP_GAINED',
            survivorId,
            amount: after - before,
            newTotal: after,
          });
          if (state.survivors[survivorId].dangerLevel !== survivor.dangerLevel) {
            collector?.emit({
              type: 'SURVIVOR_DANGER_LEVEL_CHANGED',
              survivorId,
              newLevel: state.survivors[survivorId].dangerLevel,
            });
          }
        }
      }
    }

    for (const survivorId in state.survivors) {
      const survivor = state.survivors[survivorId];
      const newActions = survivor.actionsPerTurn;
      if (survivor.actionsRemaining !== newActions) {
        survivor.actionsRemaining = newActions;
        collector?.emit({
          type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
          survivorId,
          newCount: newActions,
        });
      }
      survivor.hasMoved = false;
      survivor.hasSearched = false;
      survivor.freeMovesRemaining = survivor.skills.includes('plus_1_free_move') ? 1 : 0;
      survivor.freeSearchesRemaining = survivor.skills.includes('plus_1_free_search') ? 1 : 0;
      survivor.freeCombatsRemaining = survivor.skills.includes('plus_1_free_combat') ? 1 : 0;
      survivor.toughUsedZombieAttack = false;
      // toughUsedFriendlyFire is intentionally NOT reset here (B7).
      survivor.freeMeleeRemaining = survivor.skills.includes('plus_1_free_melee') ? 1 : 0;
      survivor.freeRangedRemaining = survivor.skills.includes('plus_1_free_ranged') ? 1 : 0;
      survivor.sprintUsedThisTurn = false;
      survivor.chargeUsedThisTurn = false;
      survivor.bornLeaderUsedThisTurn = false;
    }

    if (state.players.length > 0) {
      state.firstPlayerTokenIndex = (state.firstPlayerTokenIndex + 1) % state.players.length;
      state.activePlayerIndex = state.firstPlayerTokenIndex;
    }

    state.turn += 1;
    state.phase = GamePhase.Players;

    collector?.emit({ type: 'ROUND_ENDED', turnNumber: state.turn });
    if (prevPlayerIndex !== state.activePlayerIndex) {
      collector?.emit({
        type: 'ACTIVE_PLAYER_CHANGED',
        oldPlayerIndex: prevPlayerIndex,
        newPlayerIndex: state.activePlayerIndex,
        newActivePlayerId: state.players[state.activePlayerIndex],
      });
    }
    if (state.players.length > 0) {
      collector?.emit({
        type: 'TURN_STARTED',
        turnNumber: state.turn,
        activePlayerId: state.players[state.activePlayerIndex],
      });
    }
  }
}
