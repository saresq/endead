
import { GameState, EquipmentCard, Zombie, ZombieType, Survivor, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';
import { DeckService } from '../DeckService';
import { EquipmentManager } from '../EquipmentManager';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { rollDice, rollDiceWithReroll } from '../DiceService';
import { handleSurvivorDeath, getDistance, hasLineOfSight, getZombieToughness, getZombieXP } from './handlerUtils';

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

  // Melee attacks can only target the attacker's own zone
  const isMelee = stats.range[1] === 0;
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
          } else if (target.inventory.length > 0) {
              const backpackIdx = target.inventory.findIndex((c: EquipmentCard) => !c.inHand);
              const discardIdx = backpackIdx >= 0 ? backpackIdx : target.inventory.length - 1;
              const [discarded] = target.inventory.splice(discardIdx, 1);
              newState.equipmentDiscard.push(discarded);
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
  const canDual = stats.dualWield ||
    survivor.skills.includes('ambidextrous') ||
    (isMelee && survivor.skills.includes('swordmaster'));
  if (canDual) {
    const hand1 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_1' && c.type === 'WEAPON');
    const hand2 = survivor.inventory.find((c: EquipmentCard) => c.slot === 'HAND_2' && c.type === 'WEAPON');
    if (hand1 && hand2 && hand1.name === hand2.name) {
      isDualWielding = true;
    }
  }

  // Plenty of Ammo: equipped in hand grants +1 die to ranged attacks
  if (isRangedWeapon) {
    const hasPlentyOfAmmo = survivor.inventory.some(
      (c: EquipmentCard) => c.name === 'Plenty of Ammo' && c.inHand
    );
    if (hasPlentyOfAmmo) bonusDice++;
  }

  const hasLucky = survivor.skills.includes('lucky');

  // Barbarian: substitute weapon dice with zombie count in zone (melee only)
  let baseDice = stats.dice;
  if (isMelee && survivor.skills.includes('barbarian') && intent.payload?.useBarbarian) {
    const zombieCountInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId).length;
    baseDice = zombieCountInZone;
  }

  const diceCount = baseDice + bonusDice;
  // Minimum accuracy is always 2+ (per rulebook §4, §10)
  const threshold = Math.max(2, stats.accuracy);

  // Perform attack(s) — dual wield = two separate attacks
  const attackCount = isDualWielding ? 2 : 1;
  let allRolls: number[] = [];
  let luckyOriginalRolls: number[] = [];
  let totalHits = 0;
  let totalMisses = 0;

  for (let atk = 0; atk < attackCount; atk++) {
    const result = hasLucky
      ? rollDiceWithReroll(newState.seed, diceCount, threshold)
      : rollDice(newState.seed, diceCount, threshold);
    newState.seed = result.newSeed;
    allRolls = allRolls.concat(result.rolls);
    if (result.luckyOriginal) {
      luckyOriginalRolls = luckyOriginalRolls.concat(result.luckyOriginal);
    }
    totalHits += result.hits;
    totalMisses += (diceCount - result.hits);
  }

  newState.lastAction = {
      type: ActionType.ATTACK,
      playerId: intent.playerId,
      survivorId: intent.survivorId,
      dice: allRolls,
      hits: totalHits,
      timestamp: Date.now(),
      description: `Attacked with ${weapon.name}${isDualWielding ? ' (Dual Wield)' : ''} (Need ${threshold}+)`,
      luckyRerollOriginal: luckyOriginalRolls.length > 0 ? luckyOriginalRolls : undefined,
      bonusDice: bonusDice > 0 ? bonusDice : undefined,
      bonusDamage: bonusDamage > 0 ? bonusDamage : undefined,
      damagePerHit: stats.damage + bonusDamage,
  };

  // Targeting priority: lowest toughness first (Walker -> Runner -> Brute -> Abomination)
  let zombiesInZone = Object.values(newState.zombies).filter((z: any) => z.position.zoneId === targetZoneId) as Zombie[];

  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Walker]: 1,
    [ZombieType.Runner]: 2,
    [ZombieType.Brute]: 3,
    [ZombieType.Abomination]: 4
  };

  zombiesInZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  // Sniper: free target choice — player specifies target order
  const hasSniper = survivor.skills.includes('sniper');
  if (hasSniper && intent.payload?.targetZombieIds?.length > 0) {
    const targetIds: string[] = intent.payload!.targetZombieIds;
    const orderedZombies: Zombie[] = [];
    for (const tid of targetIds) {
      const z = zombiesInZone.find(zz => zz.id === tid);
      if (z) orderedZombies.push(z);
    }
    // Append any remaining zombies not in the list
    for (const z of zombiesInZone) {
      if (!orderedZombies.includes(z)) orderedZombies.push(z);
    }
    zombiesInZone = orderedZombies;
  }

  // Point-Blank at Range 0: no friendly fire + free target choice
  const isPointBlankShot = hasPointBlank && distance === 0;

  // Point-Blank at Range 0: free target choice (same as sniper)
  if (isPointBlankShot && intent.payload?.targetZombieIds?.length > 0) {
    const targetIds: string[] = intent.payload!.targetZombieIds;
    const orderedZombies: Zombie[] = [];
    for (const tid of targetIds) {
      const z = zombiesInZone.find(zz => zz.id === tid);
      if (z) orderedZombies.push(z);
    }
    for (const z of zombiesInZone) {
      if (!orderedZombies.includes(z)) orderedZombies.push(z);
    }
    zombiesInZone = orderedZombies;
  }

  let hits = totalHits;
  let xpGained = 0;

  // Friendly fire: per rules, MISSES wound survivors in the target zone.
  // Hits go to zombies. Only applies to ranged attacks with friendlies present.
  // Melee (range 0) is never subject to friendly fire.
  const isRanged = stats.range[1] >= 1;
  const friendliesInZone = isRanged && newState.config.friendlyFire && !isPointBlankShot
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

  // Misses wound friendly survivors (each miss = weapon damage in wounds)
  if (ffTargets.length > 0 && !hasSniper) {
      let missesToApply = totalMisses;
      const effectiveDamageFF = stats.damage + bonusDamage;
      for (const friendly of ffTargets) {
          if (missesToApply <= 0) break;
          // Tough skill: absorb first FF wound independently from zombie attacks
          if (friendly.skills?.includes('tough') && !friendly.toughUsedFriendlyFire) {
              friendly.toughUsedFriendlyFire = true;
              missesToApply--;
              continue; // Wound absorbed
          }
          // "Is That All You've Got?" — defer wounds to player choice
          if (friendly.skills?.includes('is_that_all_youve_got') && friendly.inventory.length > 0) {
              friendly.pendingWounds = (friendly.pendingWounds || 0) + effectiveDamageFF;
              missesToApply--;
              continue;
          }
          friendly.wounds += effectiveDamageFF;
          missesToApply--;
          // Check if friendly died
          if (friendly.wounds >= friendly.maxHealth) {
              handleSurvivorDeath(newState, friendly.id);
          } else if (friendly.inventory.length > 0) {
              const backpackIdx = friendly.inventory.findIndex((c: EquipmentCard) => !c.inHand);
              const discardIdx = backpackIdx >= 0 ? backpackIdx : friendly.inventory.length - 1;
              const [discarded] = friendly.inventory.splice(discardIdx, 1);
              newState.equipmentDiscard.push(discarded);
          }
      }
  }

  // Hits go to zombies in targeting priority order
  let reaperUsed = false; // Reaper: max 1 bonus kill per Action
  let firstKilledType: ZombieType | null = null;
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

          // Track first kill type for Reaper
          if (!firstKilledType) firstKilledType = zombie.type;
      } else {
          hits--;
      }
  }

  // Reaper: auto-kill 1 additional identical zombie (once per Action, not per hit)
  const hasReaperCombat = survivor.skills.includes('reaper_combat');
  const hasReaperMelee = survivor.skills.includes('reaper_melee');
  if (!reaperUsed && firstKilledType && (hasReaperCombat || (hasReaperMelee && isMelee))) {
    const sameTypeZombie = Object.values(newState.zombies).find(
      (z: any) => z.position.zoneId === targetZoneId && z.type === firstKilledType
    ) as Zombie | undefined;
    if (sameTypeZombie) {
      delete newState.zombies[sameTypeZombie.id];
      xpGained += getZombieXP(sameTypeZombie.type);
      reaperUsed = true;
      if (newState.objectives) {
        newState.objectives.forEach((obj: Objective) => {
          if (obj.type === ObjectiveType.KillZombie && !obj.completed) {
            if (!obj.targetId || obj.targetId === sameTypeZombie.type) {
              obj.amountCurrent += 1;
              if (obj.amountCurrent >= obj.amountRequired) obj.completed = true;
            }
          }
        });
      }
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
      // Zone was cleared — draw 1 equipment card (not a search action)
      const drawResult = DeckService.drawCard(newState);
      if (drawResult.card) {
        if (!EquipmentManager.isHandFull(survivor) && EquipmentManager.hasSpace(survivor)) {
          newState.survivors[intent.survivorId!] = EquipmentManager.addCard(survivor, drawResult.card);
        } else {
          survivor.drawnCard = drawResult.card;
        }
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
    // Standard wound equipment discard for each wound taken
    if (survivor.inventory.length > 0) {
      const backpackIdx = survivor.inventory.findIndex((c: EquipmentCard) => !c.inHand);
      const discardIdx = backpackIdx >= 0 ? backpackIdx : survivor.inventory.length - 1;
      const [discarded] = survivor.inventory.splice(discardIdx, 1);
      newState.equipmentDiscard.push(discarded);
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

      // Armor check
      const armorIndex = survivor.inventory.findIndex(
        (c: EquipmentCard) => c.type === 'ARMOR' && c.inHand && c.armorValue && c.armorValue > 0
      );
      if (armorIndex >= 0) {
        const armor = survivor.inventory.splice(armorIndex, 1)[0];
        newState.equipmentDiscard.push(armor);
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
      } else if (survivor.inventory.length > 0) {
        const backpackIdx = survivor.inventory.findIndex((c: EquipmentCard) => !c.inHand);
        const discardIdx = backpackIdx >= 0 ? backpackIdx : survivor.inventory.length - 1;
        const [discarded] = survivor.inventory.splice(discardIdx, 1);
        newState.equipmentDiscard.push(discarded);
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
