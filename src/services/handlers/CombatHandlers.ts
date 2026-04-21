
import { GameState, EquipmentCard, Zombie, ZombieType, Survivor, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType, AttackFreePool } from '../../types/Action';
import { XPManager } from '../XPManager';
import { DeckService } from '../DeckService';
import { Rng } from '../Rng';
import { rollAttack, AttackRollResult } from '../CombatDice';
import { handleSurvivorDeath, getDistance, hasLineOfSight, getZombieToughness, getZombieXP, deductAPWithFreeCheck } from './handlerUtils';
import { handleAaahhTrap } from './ItemHandlers';
import type { EventCollector } from '../EventCollector';
import { EventCollector as EventCollectorClass } from '../EventCollector';

/**
 * Capture pre-attack entity state for a potential Lucky reroll. The five
 * `structuredClone` calls below are explicitly allowed under D21 — Lucky
 * rewinds real state and the snapshot stays server-side (B12 + §3.7.1
 * redact `lastAction.rollbackSnapshot` from every client payload).
 */
function captureAttackState(state: GameState): Pick<
  NonNullable<NonNullable<GameState['lastAction']>['rollbackSnapshot']>,
  'zombies' | 'survivors' | 'equipmentDeck' | 'equipmentDiscard' | 'objectives' | 'noiseTokens' | 'zoneNoise'
> {
  const zoneNoise: Record<string, number> = {};
  for (const [zid, zone] of Object.entries(state.zones)) zoneNoise[zid] = zone.noiseTokens ?? 0;
  return {
    zombies: structuredClone(state.zombies),
    survivors: structuredClone(state.survivors),
    equipmentDeck: structuredClone(state.equipmentDeck),
    equipmentDiscard: structuredClone(state.equipmentDiscard),
    objectives: structuredClone(state.objectives),
    noiseTokens: state.noiseTokens,
    zoneNoise,
  };
}

/**
 * Apply N friendly-fire misses to a single survivor (RULEBOOK §10).
 * Respects Tough (absorbs 1 miss once per turn). Mutates in place.
 */
function applyFriendlyFireMiss(state: GameState, survivorId: string, damagePerMiss: number, missCount: number, collector: EventCollector): void {
  const friendly = state.survivors[survivorId];
  if (!friendly || friendly.wounds >= friendly.maxHealth) return;

  for (let i = 0; i < missCount; i++) {
    if (friendly.skills?.includes('tough') && !friendly.toughUsedFriendlyFire) {
      friendly.toughUsedFriendlyFire = true;
      continue;
    }
    friendly.wounds += damagePerMiss;
    collector.emit({
      type: 'SURVIVOR_WOUNDED',
      survivorId,
      amount: damagePerMiss,
      source: 'friendly_fire',
    });
    if (friendly.wounds >= friendly.maxHealth) {
      handleSurvivorDeath(state, survivorId);
      collector.emit({ type: 'SURVIVOR_DIED', survivorId });
      return;
    }
  }
}

export function handleAttack(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  // ============================================================
  // BLOCK 1 — Pure-read validation (D18: no writes, no emits).
  // ============================================================
  const survivor = state.survivors[intent.survivorId!];
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

  if (weapon.keywords?.includes('reload') && weapon.reloaded === false) {
    throw new Error(`${weapon.name} must be reloaded before firing`);
  }

  const stats = weapon.stats;
  const currentZoneId = survivor.position.zoneId;
  let distance = 0;
  if (currentZoneId !== targetZoneId) {
    distance = getDistance(state, currentZoneId, targetZoneId);
    if (distance === Infinity) throw new Error('Target zone not reachable');
  }

  const hasPointBlank = survivor.skills.includes('point_blank');
  let effectiveMinRange = stats.range[0];
  let effectiveMaxRange = stats.range[1];
  if (hasPointBlank && distance === 0) effectiveMinRange = 0;
  if (survivor.skills.includes('plus_1_max_range')) effectiveMaxRange += 1;

  if (distance < effectiveMinRange || distance > effectiveMaxRange) {
    throw new Error(`Target out of range (${distance}). Weapon range: ${stats.range.join('-')}`);
  }

  // Hybrid weapons (e.g. Gunblade) resolve as melee at range 0 and ranged otherwise.
  const isMelee = stats.range[1] === 0 || (!!stats.hybrid && distance === 0);
  if (isMelee && targetZoneId !== currentZoneId) {
    throw new Error('Melee attacks can only target your own zone');
  }

  const isRangedWeapon = !isMelee;
  if (isRangedWeapon && currentZoneId !== targetZoneId) {
    if (!hasLineOfSight(state, currentZoneId, targetZoneId)) {
      throw new Error('No line of sight to target zone');
    }
  }

  // m2/m3 — target disambiguation. Rules say the player freely assigns melee
  // hits, and the Brute/Abomination priority-1 tie must be broken by the
  // shooter on ranged. Reject early so the client reprompts with explicit
  // targetZombieIds rather than silently auto-applying priority order.
  if (stats.special !== 'molotov') {
    const providedTargetIds: string[] = intent.payload?.targetZombieIds || [];
    const zombiesInTargetZone = (Object.values(state.zombies) as Zombie[])
      .filter(z => z.position.zoneId === targetZoneId);

    if (providedTargetIds.length === 0 && zombiesInTargetZone.length > 1) {
      if (isMelee) {
        throw new Error(
          'Must specify targetZombieIds for a melee attack with multiple targets in the zone',
        );
      }
      const hasBrute = zombiesInTargetZone.some(z => z.type === ZombieType.Brute);
      const hasAbom = zombiesInTargetZone.some(z => z.type === ZombieType.Abomination);
      if (hasBrute && hasAbom) {
        throw new Error(
          'Must specify targetZombieIds: priority-1 tie between Brute and Abomination in target zone',
        );
      }
    }
  }

  // ============================================================
  // BLOCK 2 — Mutations + emits (no throws past this line).
  // ============================================================
  // Stash isMelee for the dispatcher's deductAPWithFreeCheck call (lifted off
  // GameState per D2). The collector survives the handler return.
  collector.attackIsMelee = isMelee;

  // --- Molotov special handler ---
  if (stats.special === 'molotov') {
    const zombiesInZone = (Object.values(state.zombies) as Zombie[]).filter(z => z.position.zoneId === targetZoneId);
    let xpGained = 0;
    for (const zombie of zombiesInZone) {
      xpGained += getZombieXP(zombie.type);
      delete state.zombies[zombie.id];
      collector.emit({
        type: 'ZOMBIE_KILLED',
        zombieId: zombie.id,
        zoneId: targetZoneId,
        killerSurvivorId: intent.survivorId!,
        zombieType: zombie.type,
      });

      if (state.objectives) {
        for (const obj of state.objectives) {
          if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
            if (!obj.targetId || obj.targetId === zombie.type) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) {
                obj.completed = true;
                collector.emit({ type: 'OBJECTIVE_COMPLETED', objectiveId: obj.id });
              }
            }
          }
        }
      }
    }

    // Molotov auto-hits the entire target zone with unlimited/lethal damage —
    // every survivor in the zone dies.
    const survivorsInZone = (Object.values(state.survivors) as Survivor[]).filter(
      s => s.position.zoneId === targetZoneId && s.wounds < s.maxHealth
    );
    for (const target of survivorsInZone) {
      const lethalAmount = target.maxHealth - target.wounds;
      target.wounds = target.maxHealth;
      collector.emit({
        type: 'SURVIVOR_WOUNDED',
        survivorId: target.id,
        amount: lethalAmount,
        source: 'molotov',
      });
      handleSurvivorDeath(state, target.id);
      collector.emit({ type: 'SURVIVOR_DIED', survivorId: target.id });
    }

    const molotovIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === weapon!.id);
    if (molotovIndex !== -1) {
      const [discarded] = survivor.inventory.splice(molotovIndex, 1);
      state.equipmentDiscard.push(discarded);
      collector.emit({
        type: 'EQUIPMENT_DISCARDED',
        survivorId: intent.survivorId!,
        cardId: weapon.id,
      });
    }

    const zone = state.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    state.noiseTokens = (state.noiseTokens || 0) + 1;
    collector.emit({
      type: 'MOLOTOV_DETONATED',
      shooterId: intent.survivorId!,
      zoneId: targetZoneId,
    });
    collector.emit({
      type: 'NOISE_GENERATED',
      zoneId: survivor.position.zoneId,
      amount: 1,
      newTotal: zone.noiseTokens,
    });

    if (xpGained > 0) {
      const before = state.survivors[intent.survivorId!].experience;
      state.survivors[intent.survivorId!] = XPManager.addXP(state.survivors[intent.survivorId!], xpGained);
      const after = state.survivors[intent.survivorId!].experience;
      if (after !== before) {
        collector.emit({
          type: 'SURVIVOR_XP_GAINED',
          survivorId: intent.survivorId!,
          amount: xpGained,
          newTotal: after,
        });
      }
    }

    state.lastAction = {
      type: ActionType.ATTACK,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      dice: [],
      hits: zombiesInZone.length,
      timestamp: Date.now(),
      description: `Threw Molotov — killed ${zombiesInZone.length} zombie(s), wounded ${survivorsInZone.length} survivor(s)`
    };
    return;
  }

  // --- Skill-based combat modifiers ---
  let bonusDice = 0;
  let bonusDamage = 0;
  if (isMelee && survivor.skills.includes('plus_1_die_melee')) bonusDice++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_die_ranged')) bonusDice++;
  if (survivor.skills.includes('plus_1_die_combat')) bonusDice++;
  if (isMelee && survivor.skills.includes('plus_1_damage_melee')) bonusDamage++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_damage_ranged')) bonusDamage++;
  if (survivor.skills.includes('plus_1_damage_combat')) bonusDamage++;
  if (isMelee && survivor.skills.includes('super_strength')) {
    bonusDamage = Math.max(bonusDamage, 3 - stats.damage);
  }

  let isDualWielding = false;
  let dualWieldIds: string[] = [];
  const canDual = stats.dualWield || survivor.skills.includes('ambidextrous');
  if (canDual) {
    const hand1 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_1' && c.type === 'WEAPON');
    const hand2 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_2' && c.type === 'WEAPON');
    if (hand1 && hand2 && hand1.name === hand2.name) {
      isDualWielding = true;
      dualWieldIds = [hand1.id, hand2.id];
    }
  }

  const ammo = stats.ammo;
  const hasAmmoReroll = !!ammo && survivor.inventory.some(
    (c: EquipmentCard) => c.name === (ammo === 'bullets' ? 'Plenty of Bullets' : 'Plenty of Shells')
  );

  const diceCount = stats.dice + bonusDice;
  const rangedDiceBonus = isRangedWeapon && survivor.skills.includes('plus_1_to_dice_roll_ranged');
  const meleeDiceBonus = isMelee && survivor.skills.includes('plus_1_to_dice_roll_melee');
  const combatDiceBonus = survivor.skills.includes('plus_1_to_dice_roll_combat');
  const diceBonus = (rangedDiceBonus || meleeDiceBonus || combatDiceBonus) ? 1 : 0;

  // Capture pre-attack snapshot if Lucky is available (clones explicitly allowed).
  // Lucky is per-Action: this fresh ATTACK starts with luckyUsed unset regardless
  // of prior turn history.
  const luckyAvailable = survivor.skills.includes('lucky');
  const attackEntitySnapshot = luckyAvailable ? captureAttackState(state) : undefined;

  const attackCount = isDualWielding ? 2 : 1;
  const rng = Rng.from(state.seed);
  let allRolls: number[] = [];
  let rerolledFromRolls: number[] = [];
  let rerollSourceSeen: 'plenty_of_bullets' | 'plenty_of_shells' | undefined;
  let totalHits = 0;
  let totalMisses = 0;
  let effectiveThreshold = Math.min(6, Math.max(2, stats.accuracy));

  const ammoSource: 'plenty_of_bullets' | 'plenty_of_shells' | undefined =
    ammo === 'bullets' ? 'plenty_of_bullets' : ammo === 'shells' ? 'plenty_of_shells' : undefined;

  // Per-hand results so we can emit one ATTACK_ROLLED per hand (§A dual-wield).
  type HandRoll = { rolls: number[]; hits: number; rerolledFrom?: number[] };
  const handRolls: HandRoll[] = [];

  for (let atk = 0; atk < attackCount; atk++) {
    const result: AttackRollResult = rollAttack(rng, {
      count: diceCount,
      accuracy: stats.accuracy,
      diceBonus,
      ammoReroll: hasAmmoReroll,
      ammoSource,
    });
    effectiveThreshold = result.effectiveThreshold;
    allRolls = allRolls.concat(result.rolls);
    if (result.rerolledFrom) {
      rerolledFromRolls = rerolledFromRolls.concat(result.rerolledFrom);
      if (result.rerollSource && result.rerollSource !== 'lucky') rerollSourceSeen = result.rerollSource;
    }
    totalHits += result.hits;
    totalMisses += (diceCount - result.hits);
    handRolls.push({ rolls: result.rolls, hits: result.hits, rerolledFrom: result.rerolledFrom });
  }
  state.seed = rng.snapshot();
  const seedAfterRoll = rng.snapshot();

  for (let h = 0; h < handRolls.length; h++) {
    const hr = handRolls[h];
    collector.emit({
      type: 'ATTACK_ROLLED',
      shooterId: intent.survivorId!,
      targetZoneId,
      weaponId: weapon.id,
      isMelee,
      dice: hr.rolls,
      hits: hr.hits,
      damagePerHit: stats.damage + bonusDamage,
      bonusDice: bonusDice > 0 ? bonusDice : undefined,
      bonusDamage: bonusDamage > 0 ? bonusDamage : undefined,
      hand: isDualWielding ? (h === 0 ? 'HAND_1' : 'HAND_2') : undefined,
    });
  }

  const rollbackSnapshot = attackEntitySnapshot
    ? {
        ...attackEntitySnapshot,
        seedAfterRoll,
        attackPayload: { ...(intent.payload || {}) },
        originalDice: allRolls.slice(),
      }
    : undefined;

  state.lastAction = {
    type: ActionType.ATTACK,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    dice: allRolls,
    hits: totalHits,
    timestamp: Date.now(),
    description: `Attacked with ${weapon.name}${isDualWielding ? ' (Dual Wield)' : ''} (Need ${effectiveThreshold}+)`,
    rerolledFrom: rerolledFromRolls.length > 0 ? rerolledFromRolls : undefined,
    rerollSource: rerolledFromRolls.length > 0 ? rerollSourceSeen : undefined,
    bonusDice: bonusDice > 0 ? bonusDice : undefined,
    bonusDamage: bonusDamage > 0 ? bonusDamage : undefined,
    damagePerHit: stats.damage + bonusDamage,
    rollbackSnapshot,
  };

  // --- Targeting priority + hits ---
  let zombiesInZone = (Object.values(state.zombies) as Zombie[]).filter(z => z.position.zoneId === targetZoneId);

  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Brute]: 1,
    [ZombieType.Abomination]: 1,
    [ZombieType.Walker]: 2,
    [ZombieType.Runner]: 3,
  };
  zombiesInZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  const hasSniper = survivor.skills.includes('sniper');
  const isPointBlankShot = hasPointBlank && distance === 0;
  const canChooseTargets = isMelee || hasSniper || isPointBlankShot;
  const targetIds: string[] = intent.payload?.targetZombieIds || [];

  if (canChooseTargets && targetIds.length > 0) {
    const orderedZombies: Zombie[] = [];
    for (const tid of targetIds) {
      const z = zombiesInZone.find(zz => zz.id === tid);
      if (z) orderedZombies.push(z);
    }
    for (const z of zombiesInZone) {
      if (!orderedZombies.includes(z)) orderedZombies.push(z);
    }
    zombiesInZone = orderedZombies;
  } else if (targetIds.length > 0) {
    const buckets = new Map<number, Zombie[]>();
    for (const z of zombiesInZone) {
      const p = priorityMap[z.type];
      if (!buckets.has(p)) buckets.set(p, []);
      buckets.get(p)!.push(z);
    }
    const sortedPriorities = [...buckets.keys()].sort((a, b) => a - b);
    const reordered: Zombie[] = [];
    for (const p of sortedPriorities) {
      const bucket = buckets.get(p)!;
      const picked: Zombie[] = [];
      for (const tid of targetIds) {
        const z = bucket.find(zz => zz.id === tid);
        if (z && !picked.includes(z)) picked.push(z);
      }
      for (const z of bucket) {
        if (!picked.includes(z)) picked.push(z);
      }
      reordered.push(...picked);
    }
    zombiesInZone = reordered;
  }

  let hits = totalHits;
  let xpGained = 0;

  // --- Friendly fire (RULEBOOK §10) — always on; not a house-rule toggle. ---
  const friendliesInZone = isRangedWeapon && !isPointBlankShot
    ? (Object.values(state.survivors) as Survivor[]).filter(
        s => s.position.zoneId === targetZoneId && s.id !== survivor.id && s.wounds < s.maxHealth
      )
    : [];

  const hasSteadyHand = survivor.skills.includes('steady_hand');
  const protectedIds: string[] = intent.payload?.protectedSurvivorIds || [];
  const ffTargets = hasSteadyHand
    ? friendliesInZone.filter(f => !protectedIds.includes(f.id))
    : friendliesInZone;

  if (ffTargets.length > 0 && totalMisses > 0 && !hasSniper) {
    // B7: reset Tough FF flag on every survivor in target zone at FF entry.
    for (const s of Object.values(state.survivors) as Survivor[]) {
      if (s.position.zoneId === targetZoneId) s.toughUsedFriendlyFire = false;
    }
    const damagePerMiss = stats.damage + bonusDamage;
    if (ffTargets.length === 1) {
      applyFriendlyFireMiss(state, ffTargets[0].id, damagePerMiss, totalMisses, collector);
    } else {
      state.pendingFriendlyFire = {
        shooterId: survivor.id,
        targetZoneId,
        missCount: totalMisses,
        damagePerMiss,
        eligibleSurvivorIds: ffTargets.map(f => f.id),
      };
      collector.emit({
        type: 'FRIENDLY_FIRE_PENDING',
        shooterId: survivor.id,
        targetZoneId,
        missCount: totalMisses,
        damagePerMiss,
        eligibleSurvivorIds: ffTargets.map(f => f.id),
      });
    }
  }

  // --- Hits → zombies in priority order ---
  for (const zombie of zombiesInZone) {
    if (hits <= 0) break;
    const toughness = getZombieToughness(zombie.type);
    const effectiveDamage = stats.damage + bonusDamage;
    if (effectiveDamage >= toughness) {
      delete state.zombies[zombie.id];
      xpGained += getZombieXP(zombie.type);
      hits--;
      collector.emit({
        type: 'ZOMBIE_KILLED',
        zombieId: zombie.id,
        zoneId: targetZoneId,
        killerSurvivorId: intent.survivorId!,
        zombieType: zombie.type,
      });

      if (state.objectives) {
        for (const obj of state.objectives) {
          if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
            if (!obj.targetId || obj.targetId === zombie.type) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) {
                obj.completed = true;
                collector.emit({ type: 'OBJECTIVE_COMPLETED', objectiveId: obj.id });
              }
            }
          }
        }
      }
    } else {
      hits--;
    }
  }

  if (xpGained > 0) {
    state.survivors[intent.survivorId!] = XPManager.addXP(state.survivors[intent.survivorId!], xpGained);
    collector.emit({
      type: 'SURVIVOR_XP_GAINED',
      survivorId: intent.survivorId!,
      amount: xpGained,
      newTotal: state.survivors[intent.survivorId!].experience,
    });
  }

  // Hold Your Nose: clear zone draws an equipment card.
  if (survivor.skills.includes('hold_your_nose')) {
    const remainingZombies = Object.values(state.zombies).filter(
      z => z.position.zoneId === targetZoneId
    );
    if (remainingZombies.length === 0 && zombiesInZone.length > 0) {
      const card = DeckService.drawCard(state, collector);
      if (card) {
        if (card.keywords?.includes('aaahh')) {
          // Aaahh!! cards trigger the trap and are discarded — never land in the
          // picker (rules-fidelity: see handleAaahhTrap in ItemHandlers.ts).
          handleAaahhTrap(state, intent.survivorId!, card, collector);
        } else {
          const s = state.survivors[intent.survivorId!];
          if (!s.drawnCard) s.drawnCard = card;
          else (s.drawnCardsQueue ||= []).push(card);
          collector.emitPrivate(
            {
              type: 'CARD_DRAWN',
              survivorId: intent.survivorId!,
              card,
            },
            [intent.survivorId!],
          );
        }
      }
    }
  }

  if (stats.noise) {
    const zone = state.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    state.noiseTokens = (state.noiseTokens || 0) + 1;
    collector.emit({
      type: 'WEAPON_FIRED_NOISE',
      shooterId: intent.survivorId!,
      zoneId: survivor.position.zoneId,
    });
    collector.emit({
      type: 'NOISE_GENERATED',
      zoneId: survivor.position.zoneId,
      amount: 1,
      newTotal: zone.noiseTokens,
    });
  }

  // Reload weapons spend their shot — both hand ids on dual wield (B4).
  if (weapon.keywords?.includes('reload')) {
    const inv = state.survivors[intent.survivorId!].inventory;
    const idsToFlip = isDualWielding ? dualWieldIds : [weapon.id];
    for (const id of idsToFlip) {
      const inst = inv.find(c => c.id === id);
      if (inst) inst.reloaded = false;
    }
  }
}

export function handleDistributeZombieWounds(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const zoneId: string = intent.payload?.zoneId;
  const assignments: Record<string, number> = intent.payload?.assignments;

  // --- Validate-first ---
  if (!zoneId || !assignments) throw new Error('Missing zoneId or assignments');
  const pending = state.pendingZombieWounds;
  if (!pending || pending.length === 0) throw new Error('No pending zombie wounds');
  const entryIndex = pending.findIndex(p => p.zoneId === zoneId);
  if (entryIndex < 0) throw new Error(`No pending wounds for zone ${zoneId}`);
  const entry = pending[entryIndex];

  const totalAssigned = Object.values(assignments).reduce((sum, n) => sum + n, 0);
  if (totalAssigned !== entry.totalWounds) {
    throw new Error(`Must assign exactly ${entry.totalWounds} wounds (got ${totalAssigned})`);
  }
  for (const survivorId of Object.keys(assignments)) {
    if (!entry.survivorIds.includes(survivorId)) {
      throw new Error(`Survivor ${survivorId} is not in the affected zone`);
    }
    if (assignments[survivorId] < 0) {
      throw new Error('Cannot assign negative wounds');
    }
  }

  // --- Mutations + emits ---
  for (const [survivorId, woundCount] of Object.entries(assignments)) {
    for (let i = 0; i < woundCount; i++) {
      const survivor = state.survivors[survivorId];
      if (!survivor || survivor.wounds >= survivor.maxHealth) continue;

      if (survivor.skills?.includes('tough') && !survivor.toughUsedZombieAttack) {
        survivor.toughUsedZombieAttack = true;
        continue;
      }

      survivor.wounds += 1;
      collector.emit({
        type: 'SURVIVOR_WOUNDED',
        survivorId,
        amount: 1,
        source: 'zombie',
      });
      if (survivor.wounds >= survivor.maxHealth) {
        handleSurvivorDeath(state, survivor.id);
        collector.emit({ type: 'SURVIVOR_DIED', survivorId: survivor.id });
      }
    }
  }

  collector.emit({
    type: 'ZOMBIE_WOUNDS_DISTRIBUTED',
    zoneId,
    assignments,
  });

  pending.splice(entryIndex, 1);
  if (pending.length === 0) {
    delete state.pendingZombieWounds;
  }
}

export function handleReload(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const weaponId = intent.payload?.weaponId;

  // --- Validate-first ---
  const candidates = survivor.inventory.filter(
    (c: EquipmentCard) => c.inHand && c.keywords?.includes('reload') && c.reloaded === false,
  );
  if (candidates.length === 0) throw new Error('No reloadable weapon to reload');
  const toReload = weaponId
    ? candidates.filter((c: EquipmentCard) => c.id === weaponId)
    : candidates;
  if (toReload.length === 0) throw new Error('Weapon is not reloadable or already loaded');

  // --- Mutations + emits ---
  for (const w of toReload) w.reloaded = true;
  collector.emit({
    type: 'WEAPON_RELOADED',
    survivorId: intent.survivorId!,
    weaponIds: toReload.map(w => w.id),
  });

  state.lastAction = {
    type: ActionType.RELOAD,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Reloaded ${toReload.map(w => w.name).join(', ')}`,
  };
}

export function handleAssignFriendlyFire(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const pending = state.pendingFriendlyFire;

  // --- Validate-first ---
  if (!pending) throw new Error('No pending friendly fire to assign');
  const shooter = state.survivors[pending.shooterId];
  if (!shooter) throw new Error('Shooter not found');
  if (intent.survivorId !== pending.shooterId) {
    throw new Error('Only the shooter can assign friendly fire');
  }
  if (intent.playerId !== shooter.playerId) {
    throw new Error("Only the shooter's player can assign friendly fire");
  }

  const assignments: Record<string, number> = intent.payload?.assignments || {};
  const totalAssigned = Object.values(assignments).reduce((sum, n) => sum + n, 0);
  if (totalAssigned !== pending.missCount) {
    throw new Error(`Must assign exactly ${pending.missCount} misses (got ${totalAssigned})`);
  }
  for (const [sid, count] of Object.entries(assignments)) {
    if (!pending.eligibleSurvivorIds.includes(sid)) {
      throw new Error(`Survivor ${sid} is not an eligible friendly-fire target`);
    }
    if (count < 0) throw new Error('Cannot assign negative misses');
  }

  // --- Mutations + emits ---
  // B7: reset Tough FF flag at FF-resolution entry on every survivor in the target zone.
  for (const s of Object.values(state.survivors) as Survivor[]) {
    if (s.position.zoneId === pending.targetZoneId) s.toughUsedFriendlyFire = false;
  }
  for (const [sid, count] of Object.entries(assignments)) {
    if (count > 0) applyFriendlyFireMiss(state, sid, pending.damagePerMiss, count, collector);
  }
  collector.emit({
    type: 'FRIENDLY_FIRE_ASSIGNED',
    shooterId: pending.shooterId,
    targetZoneId: pending.targetZoneId,
    assignments,
  });
  delete state.pendingFriendlyFire;
}

/**
 * Player-initiated Lucky reroll. Restores entity state from the snapshot,
 * re-runs the attack, then re-applies AP cost. The 6 `structuredClone` calls
 * inside the restore block are explicitly allowed under D21 — Lucky rewinds
 * real state and the snapshot stays server-side.
 */
export function handleRerollLucky(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];

  // --- Validate-first ---
  if (!survivor) throw new Error('Survivor not found');
  if (!survivor.skills.includes('lucky')) throw new Error('Survivor does not have Lucky');
  const last = state.lastAction;
  if (!last || last.type !== ActionType.ATTACK || last.survivorId !== intent.survivorId) {
    throw new Error('No recent attack to reroll');
  }
  if (last.luckyUsed) throw new Error('Lucky already used for this attack');
  const snap = last.rollbackSnapshot;
  if (!snap) throw new Error('Attack has no rollback snapshot — Lucky cannot apply');

  // --- Mutations + emits ---
  // Restore from snapshot (allowed clones — D21 entries 2/3).
  state.zombies = structuredClone(snap.zombies);
  state.survivors = structuredClone(snap.survivors);
  state.equipmentDeck = structuredClone(snap.equipmentDeck);
  state.equipmentDiscard = structuredClone(snap.equipmentDiscard);
  state.objectives = structuredClone(snap.objectives);
  state.noiseTokens = snap.noiseTokens;
  delete state.pendingFriendlyFire;
  for (const [zid, n] of Object.entries(snap.zoneNoise)) {
    if (state.zones[zid]) state.zones[zid].noiseTokens = n;
  }
  state.seed = [snap.seedAfterRoll[0], snap.seedAfterRoll[1], snap.seedAfterRoll[2], snap.seedAfterRoll[3]];

  // Re-dispatch handleAttack into a fresh sub-collector. Its events become the
  // ATTACK_REROLLED.followupEvents payload (§3.3.1).
  const subCollector = new EventCollectorClass();
  const rerunIntent: ActionRequest = {
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    type: ActionType.ATTACK,
    payload: snap.attackPayload as Record<string, unknown>,
  };
  handleAttack(state, rerunIntent, subCollector);

  // Re-apply the AP cost of the ATTACK. The recursive handleAttack does NOT
  // deduct AP (that's the dispatcher's job after the handler returns), and
  // REROLL_LUCKY is not a game-action so the dispatcher won't deduct for the
  // reroll either. Without this, Lucky would refund the AP the first attack spent.
  const extraCost = subCollector.extraAPCost ?? 0;
  const rawPref = snap.attackPayload?.preferredFreePool;
  const pref: AttackFreePool | undefined =
    rawPref === 'combat' || rawPref === 'melee' || rawPref === 'ranged'
      ? rawPref
      : undefined;
  deductAPWithFreeCheck(state, intent.survivorId!, ActionType.ATTACK, extraCost, pref, subCollector.attackIsMelee);

  // Annotate provenance on the new lastAction and burn Lucky for this ATTACK
  // (per-Action scope — a second reroll within the same ATTACK is rejected).
  if (state.lastAction && state.lastAction.type === ActionType.ATTACK) {
    state.lastAction.rerolledFrom = snap.originalDice;
    state.lastAction.rerollSource = 'lucky';
    state.lastAction.luckyUsed = true;
    delete state.lastAction.rollbackSnapshot;
  }

  // Emit ATTACK_REROLLED with the scoped PARTIAL_SNAPSHOT (§3.3.1). Equipment
  // deck contents are NOT in the patch — only counts.
  const newDice = state.lastAction?.dice ?? [];
  const zoneNoise: Record<string, number> = {};
  for (const [zid, zone] of Object.entries(state.zones)) zoneNoise[zid] = zone.noiseTokens ?? 0;
  collector.emit({
    type: 'ATTACK_REROLLED',
    shooterId: intent.survivorId!,
    originalDice: snap.originalDice,
    newDice,
    patch: {
      zombies: state.zombies,
      survivors: state.survivors,
      objectives: state.objectives,
      noiseTokens: state.noiseTokens,
      zoneNoise,
      equipmentDeckCount: state.equipmentDeck.length,
      equipmentDiscardCount: state.equipmentDiscard.length,
    },
    followupEvents: subCollector.drain(),
  });

  // The reroll is a turn-bounded skill burn — collector scratch must not
  // bleed into the dispatcher (no further AP deduction).
  collector.attackIsMelee = undefined;
  collector.extraAPCost = undefined;
}
