
import { GameState, EquipmentCard, Zombie, ZombieType, Survivor, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { Rng } from '../Rng';
import { rollAttack, applyLuckyReroll, AttackRollResult } from '../CombatDice';
import { handleSurvivorDeath, getDistance, hasLineOfSight, getZombieToughness, getZombieXP, deductAPWithFreeCheck } from './handlerUtils';

/**
 * Capture pre-attack entity state for a potential Lucky reroll.
 * The `seedAfterRoll` field is stamped once we know where the dice consumption
 * ended, so the reroll picks up fresh dice from there.
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
 * Respects Tough (absorbs 1 miss once per turn) and Is That All You've Got?
 * (defers wounds to discard-to-negate picker).
 */
function applyFriendlyFireMiss(state: GameState, survivorId: string, damagePerMiss: number, missCount: number): void {
  const friendly = state.survivors[survivorId];
  if (!friendly || friendly.wounds >= friendly.maxHealth) return;

  for (let i = 0; i < missCount; i++) {
    if (friendly.skills?.includes('tough') && !friendly.toughUsedFriendlyFire) {
      friendly.toughUsedFriendlyFire = true;
      continue;
    }
    if (friendly.skills?.includes('is_that_all_youve_got') && friendly.inventory.length > 0) {
      friendly.pendingWounds = (friendly.pendingWounds || 0) + damagePerMiss;
      continue;
    }
    friendly.wounds += damagePerMiss;
    if (friendly.wounds >= friendly.maxHealth) {
      handleSurvivorDeath(state, survivorId);
      return;
    }
  }
}

export function handleAttack(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
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

  // Reload weapons (e.g. Sawed-Off) must be reloaded between shots.
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

  // Point-Blank: ranged weapons can fire at Range 0, bypassing min range
  const hasPointBlank = survivor.skills.includes('point_blank');
  let effectiveMinRange = stats.range[0];
  let effectiveMaxRange = stats.range[1];
  if (hasPointBlank && distance === 0) {
    effectiveMinRange = 0;
  }

  // +1 Max Range skill
  if (survivor.skills.includes('plus_1_max_range')) {
    effectiveMaxRange += 1;
  }

  if (distance < effectiveMinRange || distance > effectiveMaxRange) {
      throw new Error(`Target out of range (${distance}). Weapon range: ${stats.range.join('-')}`);
  }

  // Melee attacks can only target the attacker's own zone.
  // Hybrid weapons (e.g. Gunblade) resolve as melee at distance 0 and ranged otherwise.
  const isMelee = stats.range[1] === 0 || (!!stats.hybrid && distance === 0);
  (newState as any)._attackIsMelee = isMelee;
  if (isMelee && targetZoneId !== currentZoneId) {
      throw new Error('Melee attacks can only target your own zone');
  }

  // Ranged LOS check: path must not pass through wall-blocked edges
  const isRangedWeapon = !isMelee;
  if (isRangedWeapon && currentZoneId !== targetZoneId) {
      if (!hasLineOfSight(newState, currentZoneId, targetZoneId)) {
          throw new Error('No line of sight to target zone');
      }
  }

  // --- Molotov special handler ---
  if (stats.special === 'molotov') {
      // Kill ALL zombies in target zone
      const zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];
      let xpGained = 0;
      for (const zombie of zombiesInZone) {
          xpGained += getZombieXP(zombie.type);
          delete newState.zombies[zombie.id];

          // Update Kill Objectives
          if (newState.objectives) {
              newState.objectives.forEach((obj: Objective) => {
                  if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
                      if (!obj.targetId || obj.targetId === zombie.type) {
                          obj.amountCurrent += 1;
                          if (obj.amountCurrent >= obj.amountRequired) {
                              obj.completed = true;
                          }
                      }
                  }
              });
          }
      }

      // Wound ALL survivors in target zone (1 wound each)
      const survivorsInZone = (Object.values(newState.survivors) as Survivor[]).filter(
          s => s.position.zoneId === targetZoneId && s.wounds < s.maxHealth
      );
      for (const target of survivorsInZone) {
          // "Is That All You've Got?" — defer wounds to player choice
          if (target.skills?.includes('is_that_all_youve_got') && target.inventory.length > 0) {
              target.pendingWounds = (target.pendingWounds || 0) + 1;
              continue;
          }
          target.wounds += 1;
          if (target.wounds >= target.maxHealth) {
              handleSurvivorDeath(newState, target.id);
          }
      }

      // Discard Molotov from inventory
      const molotovIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === weapon!.id);
      if (molotovIndex !== -1) {
          const [discarded] = survivor.inventory.splice(molotovIndex, 1);
          newState.equipmentDiscard.push(discarded);
      }

      // Generate noise
      const zone = newState.zones[survivor.position.zoneId];
      zone.noiseTokens = (zone.noiseTokens || 0) + 1;
      newState.noiseTokens = (newState.noiseTokens || 0) + 1;

      if (xpGained > 0) {
          newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpGained);
      }

      newState.lastAction = {
          type: ActionType.ATTACK,
          playerId: intent.playerId,
          survivorId: intent.survivorId,
          dice: [],
          hits: zombiesInZone.length,
          timestamp: Date.now(),
          description: `Threw Molotov — killed ${zombiesInZone.length} zombie(s), wounded ${survivorsInZone.length} survivor(s)`
      };

      return newState;
  }

  // --- Compute skill-based combat modifiers ---

  let bonusDice = 0;
  let bonusDamage = 0;

  // +1 Die skills (matching weapon type only)
  if (isMelee && survivor.skills.includes('plus_1_die_melee')) bonusDice++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_die_ranged')) bonusDice++;
  if (survivor.skills.includes('plus_1_die_combat')) bonusDice++;

  // +1 Damage skills
  if (isMelee && survivor.skills.includes('plus_1_damage_melee')) bonusDamage++;
  if (isRangedWeapon && survivor.skills.includes('plus_1_damage_ranged')) bonusDamage++;
  if (survivor.skills.includes('plus_1_damage_combat')) bonusDamage++;

  // Super Strength: melee weapons deal Damage 3
  if (isMelee && survivor.skills.includes('super_strength')) {
    bonusDamage = Math.max(bonusDamage, 3 - stats.damage); // Override to at least 3
  }

  // Dual-wield check: both hands hold weapons capable of dual-wielding
  let isDualWielding = false;
  let dualWieldIds: string[] = [];
  const canDual = stats.dualWield ||
    survivor.skills.includes('ambidextrous') ||
    (isMelee && survivor.skills.includes('swordmaster'));
  if (canDual) {
    const hand1 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_1' && c.type === 'WEAPON');
    const hand2 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_2' && c.type === 'WEAPON');
    if (hand1 && hand2 && hand1.name === hand2.name) {
      isDualWielding = true;
      dualWieldIds = [hand1.id, hand2.id];
    }
  }

  // Plenty of Bullets / Plenty of Shells: re-roll misses once when the weapon
  // matches the ammo type. Usable from any inventory slot (Hand or Backpack).
  const ammo = stats.ammo;
  const hasAmmoReroll = !!ammo && survivor.inventory.some(
    (c: EquipmentCard) => c.name === (ammo === 'bullets' ? 'Plenty of Bullets' : 'Plenty of Shells')
  );

  // Barbarian: substitute weapon dice with zombie count in zone (melee only)
  let baseDice = stats.dice;
  if (isMelee && survivor.skills.includes('barbarian') && intent.payload?.useBarbarian) {
    const zombieCountInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId).length;
    baseDice = zombieCountInZone;
  }

  const diceCount = baseDice + bonusDice;
  // +1 to Dice Roll: adds +1 to each die result (clamped to 6) on matching actions.
  const rangedDiceBonus = isRangedWeapon && survivor.skills.includes('plus_1_to_dice_roll_ranged');
  const meleeDiceBonus = isMelee && survivor.skills.includes('plus_1_to_dice_roll_melee');
  const combatDiceBonus = survivor.skills.includes('plus_1_to_dice_roll_combat');
  const diceBonus = (rangedDiceBonus || meleeDiceBonus || combatDiceBonus) ? 1 : 0;

  // Capture pre-attack entity state if this survivor could Lucky-reroll the result.
  const luckyAvailable = survivor.skills.includes('lucky') && !survivor.luckyUsedThisTurn;
  const attackEntitySnapshot = luckyAvailable ? captureAttackState(newState) : undefined;

  // Perform attack(s) — dual wield = two separate attacks
  const attackCount = isDualWielding ? 2 : 1;
  const rng = Rng.from(newState.seed);
  let allRolls: number[] = [];
  let rerolledFromRolls: number[] = [];
  let rerollSourceSeen: 'plenty_of_bullets' | 'plenty_of_shells' | undefined;
  let totalHits = 0;
  let totalMisses = 0;
  let effectiveThreshold = Math.max(2, stats.accuracy);

  const ammoSource: 'plenty_of_bullets' | 'plenty_of_shells' | undefined =
    ammo === 'bullets' ? 'plenty_of_bullets' : ammo === 'shells' ? 'plenty_of_shells' : undefined;

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
  }
  newState.seed = rng.snapshot();
  const seedAfterRoll = rng.snapshot();

  const rollbackSnapshot = attackEntitySnapshot
    ? {
        ...attackEntitySnapshot,
        seedAfterRoll,
        attackPayload: { ...(intent.payload || {}) },
        originalDice: allRolls.slice(),
      }
    : undefined;

  newState.lastAction = {
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

  // Zombicide 2E targeting priority (ranged default):
  // Brute/Abomination first (attacker chooses between them), then Walker, then Runner.
  // Melee: player freely assigns hits — honor client-supplied targetZombieIds.
  let zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];

  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Brute]: 1,
    [ZombieType.Abomination]: 1,
    [ZombieType.Walker]: 2,
    [ZombieType.Runner]: 3,
  };

  zombiesInZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  const hasSniper = survivor.skills.includes('sniper');
  const isPointBlankShot = hasPointBlank && distance === 0;
  // Free target choice: melee always, plus Sniper / Point-Blank for ranged.
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
    // Ranged without Sniper/Point-Blank: player may still pick among equal-priority
    // targets (e.g. Brute vs. Abomination). Reorder only within each priority tier.
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

  // Friendly fire: per rules, MISSES wound survivors in the target zone.
  // Hits go to zombies. Only applies to ranged attacks with friendlies present.
  // Melee (range 0) is never subject to friendly fire. Hybrid weapons (Gunblade)
  // also skip FF when resolving as melee at distance 0 — use `isRangedWeapon`
  // rather than raw weapon range.
  const friendliesInZone = isRangedWeapon && newState.config.friendlyFire && !isPointBlankShot
      ? (Object.values(newState.survivors) as Survivor[]).filter(
            s => s.position.zoneId === targetZoneId && s.id !== survivor.id && s.wounds < s.maxHealth
        )
      : [];

  // Low Profile: survivors with this skill can't be hit by FF (Molotov still applies — handled separately above)
  const ffAfterLowProfile = friendliesInZone.filter(f => !f.skills?.includes('low_profile'));

  // Steady Hand: shooter can protect specific survivors from FF
  const hasSteadyHand = survivor.skills.includes('steady_hand');
  const protectedIds: string[] = intent.payload?.protectedSurvivorIds || [];
  const ffTargets = hasSteadyHand
    ? ffAfterLowProfile.filter(f => !protectedIds.includes(f.id))
    : ffAfterLowProfile;

  // Friendly fire (RULEBOOK §10): player assigns misses in any way they want.
  //   - 0 eligible targets or 0 misses: nothing to do
  //   - 1 eligible target: apply directly (no choice)
  //   - 2+ eligible targets: stash pendingFriendlyFire for player assignment
  if (ffTargets.length > 0 && totalMisses > 0 && !hasSniper) {
    const damagePerMiss = stats.damage + bonusDamage;
    if (ffTargets.length === 1) {
      applyFriendlyFireMiss(newState, ffTargets[0].id, damagePerMiss, totalMisses);
    } else {
      newState.pendingFriendlyFire = {
        shooterId: survivor.id,
        targetZoneId,
        missCount: totalMisses,
        damagePerMiss,
        eligibleSurvivorIds: ffTargets.map(f => f.id),
      };
    }
  }

  // Hits go to zombies in targeting priority order
  for (const zombie of zombiesInZone) {
      if (hits <= 0) break;

      const toughness = getZombieToughness(zombie.type);
      const effectiveDamage = stats.damage + bonusDamage;
      if (effectiveDamage >= toughness) {
          delete newState.zombies[zombie.id];
          xpGained += getZombieXP(zombie.type);
          hits--;

          // Update Kill Objectives
          if (newState.objectives) {
              newState.objectives.forEach((obj: Objective) => {
                  if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
                      if (!obj.targetId || obj.targetId === zombie.type) {
                          obj.amountCurrent += 1;
                          if (obj.amountCurrent >= obj.amountRequired) {
                              obj.completed = true;
                          }
                      }
                  }
              });
          }
      } else {
          hits--;
      }
  }

  if (xpGained > 0) {
    newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpGained);
  }

  // Hold Your Nose: draw equipment card when last zombie in zone eliminated
  if (survivor.skills.includes('hold_your_nose')) {
    const remainingZombies = Object.values(newState.zombies).filter(
      (z: any) => z.position.zoneId === targetZoneId
    );
    if (remainingZombies.length === 0 && zombiesInZone.length > 0) {
      // Zone was cleared — draw 1 equipment card (not a search action).
      // Route through picker so the player decides keep/equip/discard.
      const drawResult = DeckService.drawCard(newState);
      if (drawResult.card) {
        const s = newState.survivors[intent.survivorId!];
        if (!s.drawnCard) s.drawnCard = drawResult.card;
        else (s.drawnCardsQueue ||= []).push(drawResult.card);
      }
      newState.equipmentDeck = drawResult.newState.equipmentDeck;
      newState.equipmentDiscard = drawResult.newState.equipmentDiscard;
      newState.seed = drawResult.newState.seed;
    }
  }

  // Hit & Run: if any kill occurred, grant 1 free move
  if (survivor.skills.includes('hit_and_run') && xpGained > 0) {
    survivor.freeMovesRemaining = (survivor.freeMovesRemaining || 0) + 1;
  }

  if (stats.noise) {
      const zone = newState.zones[survivor.position.zoneId];
      zone.noiseTokens = (zone.noiseTokens || 0) + 1;
      newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

  // Reload weapons expend their shot — must be reloaded before firing again.
  // Dual-wield fires both copies, so flip both hand ids (B4).
  if (weapon.keywords?.includes('reload')) {
    const inv = newState.survivors[intent.survivorId!].inventory;
    const idsToFlip = isDualWielding ? dualWieldIds : [weapon.id];
    for (const id of idsToFlip) {
      const inst = inv.find(c => c.id === id);
      if (inst) inst.reloaded = false;
    }
  }

  return newState;
}

export function handleResolveWounds(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];

  if (!survivor.pendingWounds || survivor.pendingWounds <= 0) {
    throw new Error('No pending wounds to resolve');
  }

  const discardIds: string[] = intent.payload?.discardCardIds || [];

  // Validate all cards are in inventory
  for (const cardId of discardIds) {
    if (!survivor.inventory.some((c: EquipmentCard) => c.id === cardId)) {
      throw new Error(`Card ${cardId} not in inventory`);
    }
  }

  // Cannot discard more cards than pending wounds
  const negated = Math.min(discardIds.length, survivor.pendingWounds);

  // Discard chosen cards
  for (let i = 0; i < negated; i++) {
    const idx = survivor.inventory.findIndex((c: EquipmentCard) => c.id === discardIds[i]);
    if (idx >= 0) {
      const [discarded] = survivor.inventory.splice(idx, 1);
      newState.equipmentDiscard.push(discarded);
    }
  }

  // Apply remaining wounds
  const remainingWounds = survivor.pendingWounds - negated;
  for (let w = 0; w < remainingWounds; w++) {
    survivor.wounds += 1;
    if (survivor.wounds >= survivor.maxHealth) {
      handleSurvivorDeath(newState, survivor.id);
      break;
    }
  }

  survivor.pendingWounds = 0;

  return newState;
}

export function handleDistributeZombieWounds(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const zoneId: string = intent.payload?.zoneId;
  const assignments: Record<string, number> = intent.payload?.assignments;

  if (!zoneId || !assignments) throw new Error('Missing zoneId or assignments');

  const pending = newState.pendingZombieWounds as GameState['pendingZombieWounds'];
  if (!pending || pending.length === 0) throw new Error('No pending zombie wounds');

  const entryIndex = pending.findIndex((p: any) => p.zoneId === zoneId);
  if (entryIndex < 0) throw new Error(`No pending wounds for zone ${zoneId}`);

  const entry = pending[entryIndex];

  // Validate: total assigned must equal totalWounds
  const totalAssigned = Object.values(assignments).reduce((sum, n) => sum + n, 0);
  if (totalAssigned !== entry.totalWounds) {
    throw new Error(`Must assign exactly ${entry.totalWounds} wounds (got ${totalAssigned})`);
  }

  // Validate: all survivor IDs must be valid and in the zone
  for (const survivorId of Object.keys(assignments)) {
    if (!entry.survivorIds.includes(survivorId)) {
      throw new Error(`Survivor ${survivorId} is not in the affected zone`);
    }
    if (assignments[survivorId] < 0) {
      throw new Error('Cannot assign negative wounds');
    }
  }

  // Apply wounds to each survivor
  for (const [survivorId, woundCount] of Object.entries(assignments)) {
    for (let i = 0; i < woundCount; i++) {
      const survivor = newState.survivors[survivorId];
      if (!survivor || survivor.wounds >= survivor.maxHealth) continue;

      // Tough skill: ignore first wound per zombie Attack Step
      if (survivor.skills?.includes('tough') && !survivor.toughUsedZombieAttack) {
        survivor.toughUsedZombieAttack = true;
        continue;
      }

      // "Is That All You've Got?" — defer to equipment discard choice
      if (survivor.skills?.includes('is_that_all_youve_got') && survivor.inventory.length > 0) {
        survivor.pendingWounds = (survivor.pendingWounds || 0) + 1;
        continue;
      }

      survivor.wounds += 1;

      if (survivor.wounds >= survivor.maxHealth) {
        handleSurvivorDeath(newState, survivor.id);
      }
    }
  }

  // Remove the resolved entry
  pending.splice(entryIndex, 1);
  if (pending.length === 0) {
    delete newState.pendingZombieWounds;
  }

  return newState;
}

export function handleReload(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const weaponId = intent.payload?.weaponId;

  const candidates = survivor.inventory.filter(
    (c: EquipmentCard) => c.inHand && c.keywords?.includes('reload') && c.reloaded === false,
  );
  if (candidates.length === 0) throw new Error('No reloadable weapon to reload');

  const toReload = weaponId
    ? candidates.filter((c: EquipmentCard) => c.id === weaponId)
    : candidates;
  if (toReload.length === 0) throw new Error('Weapon is not reloadable or already loaded');

  for (const w of toReload) w.reloaded = true;

  newState.lastAction = {
    type: ActionType.RELOAD,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Reloaded ${toReload.map(w => w.name).join(', ')}`,
  };

  return newState;
}

export function handleAssignFriendlyFire(state: GameState, intent: ActionRequest): GameState {
  const pending = state.pendingFriendlyFire;
  if (!pending) throw new Error('No pending friendly fire to assign');

  // Strict auth: the caller must own the shooter survivor.
  const shooter = state.survivors[pending.shooterId];
  if (!shooter) throw new Error('Shooter not found');
  if (intent.survivorId !== pending.shooterId) {
    throw new Error('Only the shooter can assign friendly fire');
  }
  if (intent.playerId !== shooter.playerId) {
    throw new Error('Only the shooter\'s player can assign friendly fire');
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

  const newState = structuredClone(state);
  for (const [sid, count] of Object.entries(assignments)) {
    if (count > 0) applyFriendlyFireMiss(newState, sid, pending.damagePerMiss, count);
  }
  delete newState.pendingFriendlyFire;
  return newState;
}

/**
 * Player-initiated Lucky reroll. Rule-faithful: the reroll result is binding,
 * even if worse than the first attempt.
 *
 * Mechanics:
 *   1. Validate Lucky is owned + unspent and the survivor's last action was an ATTACK.
 *   2. Restore zombies/survivors/deck/objectives/noise from the pre-attack snapshot.
 *   3. Leave `state.seed` at the post-first-roll position — the fresh roll picks up there,
 *      so the new dice are deterministically different from the original.
 *   4. Mark Lucky spent on the survivor, then re-dispatch handleAttack with the saved intent.
 *   5. Merge: surface original dice as `rerolledFrom`, tag `rerollSource = 'lucky'`.
 */
export function handleRerollLucky(state: GameState, intent: ActionRequest): GameState {
  const survivor = state.survivors[intent.survivorId!];
  if (!survivor) throw new Error('Survivor not found');
  if (!survivor.skills.includes('lucky')) throw new Error('Survivor does not have Lucky');
  if (survivor.luckyUsedThisTurn) throw new Error('Lucky already used this turn');

  const last = state.lastAction;
  if (!last || last.type !== ActionType.ATTACK || last.survivorId !== intent.survivorId) {
    throw new Error('No recent attack to reroll');
  }
  const snap = last.rollbackSnapshot;
  if (!snap) throw new Error('Attack has no rollback snapshot — Lucky cannot apply');

  // 1. Rebuild pre-attack entity state
  const restored = structuredClone(state) as GameState;
  restored.zombies = structuredClone(snap.zombies);
  restored.survivors = structuredClone(snap.survivors);
  restored.equipmentDeck = structuredClone(snap.equipmentDeck);
  restored.equipmentDiscard = structuredClone(snap.equipmentDiscard);
  restored.objectives = structuredClone(snap.objectives);
  restored.noiseTokens = snap.noiseTokens;
  // Clear any pending friendly-fire from the original attack — the reroll will
  // recompute misses and re-stash if still applicable.
  delete restored.pendingFriendlyFire;
  for (const [zid, n] of Object.entries(snap.zoneNoise)) {
    if (restored.zones[zid]) restored.zones[zid].noiseTokens = n;
  }
  restored.seed = [snap.seedAfterRoll[0], snap.seedAfterRoll[1], snap.seedAfterRoll[2], snap.seedAfterRoll[3]];

  // 2. Burn the skill before recursing so the rerun doesn't capture a new snapshot.
  restored.survivors[intent.survivorId!].luckyUsedThisTurn = true;

  // 3. Re-run the attack with the same payload from the seed-advanced position
  const rerunIntent: ActionRequest = {
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    type: ActionType.ATTACK,
    payload: snap.attackPayload as Record<string, unknown>,
  };
  let reran = handleAttack(restored, rerunIntent);

  // 4. Re-apply the AP cost of the ATTACK. The recursive handleAttack does NOT deduct AP
  // (deduction normally happens in ActionProcessor after the handler returns), and
  // REROLL_LUCKY is not a game-action so the processor won't deduct for the reroll either.
  // Without this, Lucky would refund the AP the original attack spent.
  const extraCost = reran._extraAPCost || 0;
  delete reran._extraAPCost;
  const pref = snap.attackPayload?.preferredFreePool as
    | 'combat' | 'melee' | 'ranged' | 'move' | 'search' | undefined;
  reran = deductAPWithFreeCheck(reran, intent.survivorId!, ActionType.ATTACK, extraCost, pref);
  // Must strip _attackIsMelee AFTER deductAPWithFreeCheck so tryMelee/tryRanged
  // (handlerUtils) can key on it when resolving the free-pool choice (B2).
  delete (reran as { _attackIsMelee?: boolean })._attackIsMelee;

  // 5. Annotate the new lastAction with reroll provenance
  if (reran.lastAction && reran.lastAction.type === ActionType.ATTACK) {
    reran.lastAction.rerolledFrom = snap.originalDice;
    reran.lastAction.rerollSource = 'lucky';
    // Drop the now-stale snapshot; a second reroll is not allowed anyway
    delete reran.lastAction.rollbackSnapshot;
  }

  return reran;
}
