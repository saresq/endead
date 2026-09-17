
import { GameState, EquipmentCard, Zombie, ZombieType, Survivor, ObjectiveType, Objective } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { XPManager } from '../XPManager';
import { skillCount } from '../../config/SkillRegistry';
import { DeckService } from '../DeckService';
import { resolveDrawnCard } from '../CardDraw';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { Rng } from '../Rng';
import { rollAttack } from '../CombatDice';
import { visibleZones } from '../LineOfSight';
import { getZombieToughness, deductAPWithFreeCheck, zombiesInZone } from './handlerUtils';
import { applyWound, recordKill } from '../Wounds';
import { es, equipmentName, skillName } from '../../strings/es';

/** Monotonic id per attack action — the instance Tough and Lucky are spent against. */
let nextAttackId = 1;

/**
 * Spends hits over targets already in assignment order.
 *
 * `onUnkillable` is what a hit that cannot kill the current target does. Ranged
 * attacks follow target priority, so they stop: a tougher zombie shields the
 * ones behind it. Melee (and free targeting) assigns hits freely, so it skips to
 * the next target rather than wasting the hit.
 */
function assignHits(
  state: GameState,
  targets: Zombie[],
  hits: number,
  damage: number,
  opts: { onUnkillable: 'stop' | 'skip'; reaper?: boolean; zoneId: string },
): { xp: number; hitsLeft: number; kills: number } {
  let xp = 0;
  let left = hits;
  let kills = 0;

  for (const zombie of targets) {
    if (left <= 0) break;
    // A Reaper bonus kill may already have claimed this one.
    if (!state.zombies[zombie.id]) continue;

    if (damage < getZombieToughness(zombie.type)) {
      if (opts.onUnkillable === 'stop') break;
      continue;
    }

    xp += recordKill(state, zombie);
    kills++;
    left--;

    // Reaper: one extra kill of the same type per killing hit, free.
    if (opts.reaper) {
      const extra = zombiesInZone(state, opts.zoneId).find(z => z.type === zombie.type);
      if (extra) {
        xp += recordKill(state, extra);
        kills++;
      }
    }
  }

  return { xp, hitsLeft: left, kills };
}

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

export function handleAttack(
  state: GameState,
  intent: ActionRequest,
  opts: { isRerun?: boolean } = {},
): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;
  const weaponId = intent.payload?.weaponId;

  if (!targetZoneId) throw new Error('Target zone required');

  let weapon: EquipmentCard | undefined;
  if (weaponId) {
    weapon = survivor.inventory.find((c: EquipmentCard) => c.id === weaponId && c.inHand);
    if (!weapon) throw new Error(es.errors.weaponNotInHand);
  } else {
    const weapons = survivor.inventory.filter((c: EquipmentCard) => c.type === 'WEAPON' && c.inHand);
    if (weapons.length === 1) weapon = weapons[0];
    else if (weapons.length === 0) throw new Error(es.errors.noWeaponInHand);
    else throw new Error(es.errors.chooseWeapon);
  }

  if (!weapon) throw new Error('No weapon found');
  if (weapon.type !== 'WEAPON' || !weapon.stats) throw new Error(es.errors.notAWeapon);

  const stats = weapon.stats;

  // A `reload` weapon holds one shot: it must be reloaded before firing again.
  const needsReload = !!weapon.keywords?.includes('reload');
  if (needsReload && weapon.loaded === false) {
    throw new Error(es.errors.weaponNeedsReload(equipmentName(weapon)));
  }

  // Lucky is one reroll per attack action, so a new attack re-arms it. The
  // Lucky rerun is the same action and must keep the skill spent.
  if (!opts.isRerun) survivor.luckyUsedThisAction = false;

  // The instance Tough is spent against for this action's friendly fire.
  const attackContextId = `attack-${nextAttackId++}`;

  const currentZoneId = survivor.position.zoneId;
  const distance = currentZoneId === targetZoneId ? 0 : visibleZones(state, currentZoneId).get(targetZoneId);
  if (distance === undefined) throw new Error(es.errors.noLineOfSight);

  // Point-Blank: ranged weapons can fire at Range 0, bypassing min range
  const hasPointBlank = survivor.skills.includes('point_blank');
  let effectiveMinRange = stats.range[0];
  let effectiveMaxRange = stats.range[1];
  if (hasPointBlank && distance === 0) {
    effectiveMinRange = 0;
  }

  // +1 Max Range skill (stacks with itself, like the other numeric bonuses)
  effectiveMaxRange += skillCount(survivor.skills, 'plus_1_max_range');

  if (distance < effectiveMinRange || distance > effectiveMaxRange) {
      throw new Error(es.errors.outOfRange(distance, stats.range.join('-')));
  }

  // Which mode this attack resolves in. A melee-only weapon is always melee; a
  // weapon usable both ways (Gunblade) is melee in the attacker's own zone
  // unless the player asked for ranged. Never inferred from the max range,
  // which would make every 0–1 weapon ranged.
  const dualMode = stats.melee === true && stats.range[1] >= 1;
  const requestedMode: string | undefined = intent.payload?.attackMode;
  const isMelee = stats.range[1] === 0
    || (dualMode && targetZoneId === currentZoneId && requestedMode !== 'RANGED');

  // Melee attacks can only target the attacker's own zone
  if (isMelee && targetZoneId !== currentZoneId) {
      throw new Error(es.errors.meleeOwnZone);
  }

  const isRangedWeapon = !isMelee;

  // --- Molotov special handler ---
  if (stats.special === 'molotov') {
      // Kill ALL zombies in target zone
      const zombiesInTargetZone = zombiesInZone(newState, targetZoneId);
      let xpGained = 0;
      for (const zombie of zombiesInTargetZone) {
          xpGained += recordKill(newState, zombie);
      }

      // A Molotov kills every actor in the zone, survivors included. It is a
      // kill, not a wound, so neither Tough nor a discard can save them.
      const survivorsInZone = (Object.values(newState.survivors) as Survivor[]).filter(
          s => s.position.zoneId === targetZoneId && s.wounds < s.maxHealth
      );
      for (const target of survivorsInZone) {
          applyWound(newState, target.id, target.maxHealth - target.wounds, { allowDiscardSave: false });
      }

      // Discard Molotov from inventory
      const molotovIndex = survivor.inventory.findIndex((c: EquipmentCard) => c.id === weapon!.id);
      if (molotovIndex !== -1) {
          const [discarded] = survivor.inventory.splice(molotovIndex, 1);
          DeckService.discard(newState, discarded);
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
          hits: zombiesInTargetZone.length,
          isMelee,
          timestamp: Date.now(),
          description: es.log.molotov(zombiesInTargetZone.length, survivorsInZone.length)
      };

      return newState;
  }

  // --- Compute skill-based combat modifiers ---

  let bonusDice = 0;
  let bonusDamage = 0;

  // +1 Die skills (matching weapon type only). Counted, not tested: a card can
  // grant the same skill twice — Odin's Red repeats his Blue +1 Die: Melee —
  // and the copies stack.
  const copies = (skillId: string) => skillCount(survivor.skills, skillId);

  if (isMelee) bonusDice += copies('plus_1_die_melee');
  if (isRangedWeapon) bonusDice += copies('plus_1_die_ranged');
  bonusDice += copies('plus_1_die_combat');

  // +1 Damage skills
  if (isMelee) bonusDamage += copies('plus_1_damage_melee');
  if (isRangedWeapon) bonusDamage += copies('plus_1_damage_ranged');
  bonusDamage += copies('plus_1_damage_combat');

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
    if (hand1 && hand2 && hand1.equipmentId === hand2.equipmentId) {
      isDualWielding = true;
    }
  }

  // Plenty of Bullets / Plenty of Shells: re-roll misses once when the weapon
  // matches the ammo type. Usable from any inventory slot (Hand or Backpack).
  const ammo = stats.ammo;
  const hasAmmoReroll = !!ammo && survivor.inventory.some(
    (c: EquipmentCard) => c.equipmentId === (ammo === 'bullets' ? 'plenty_of_bullets' : 'plenty_of_shells')
  );

  // Barbarian: substitute weapon dice with zombie count in zone (melee only)
  let baseDice = stats.dice;
  if (isMelee && survivor.skills.includes('barbarian') && intent.payload?.useBarbarian) {
    const zombieCountInZone = zombiesInZone(newState, targetZoneId).length;
    baseDice = zombieCountInZone;
  }

  const diceCount = baseDice + bonusDice;
  // +1 to Dice Roll — adds +1 to each die result (max 6) for the matching
  // Action type (rules/14-skills.md#1-to-dice-roll-action). Combat covers both melee and ranged.
  const diceBonus = copies('plus_1_to_dice_roll_combat')
    + (isMelee ? copies('plus_1_to_dice_roll_melee') : 0)
    + (isRangedWeapon ? copies('plus_1_to_dice_roll_ranged') : 0);

  // Roll 6: +1 Die Combat — each 6 grants another die, after any re-roll
  // (rules/14-skills.md#roll-6-1-die-action).
  const explodeOnSix = survivor.skills.includes('roll_6_plus_1_die_combat');

  // Capture pre-attack entity state if this survivor could Lucky-reroll the result.
  const luckyAvailable = survivor.skills.includes('lucky') && (!survivor.luckyUsedThisAction || !!survivor.cheatMode);
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
    const result = rollAttack(rng, {
      count: diceCount,
      accuracy: stats.accuracy,
      diceBonus,
      ammoReroll: hasAmmoReroll,
      ammoSource,
      explodeOnSix,
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
      threshold: effectiveThreshold,
      timestamp: Date.now(),
      description: es.log.attack(equipmentName(weapon), isDualWielding, effectiveThreshold),
      rerolledFrom: rerolledFromRolls.length > 0 ? rerolledFromRolls : undefined,
      rerollSource: rerolledFromRolls.length > 0 ? rerollSourceSeen : undefined,
      bonusDice: bonusDice > 0 ? bonusDice : undefined,
      bonusDamage: bonusDamage > 0 ? bonusDamage : undefined,
      damagePerHit: stats.damage + bonusDamage,
      isMelee,
      rollbackSnapshot,
  };

  // The shot is spent: a `reload` weapon needs a Reload action or the End Phase.
  if (needsReload) weapon.loaded = false;

  // Zombicide 2E targeting priority (ranged default):
  // Brute/Abomination first (attacker chooses between them), then Walker, then Runner.
  // Melee: player freely assigns hits — honor client-supplied targetZombieIds.
  let zombiesInTargetZone = zombiesInZone(newState, targetZoneId);

  const priorityMap: Record<ZombieType, number> = {
    [ZombieType.Brute]: 1,
    [ZombieType.Abomination]: 1,
    [ZombieType.Walker]: 2,
    [ZombieType.Runner]: 3,
  };

  zombiesInTargetZone.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  // A weapon carrying the `sniper` keyword grants the skill for this attack.
  const hasSniper = survivor.skills.includes('sniper') || !!weapon.keywords?.includes('sniper');
  const isPointBlankShot = hasPointBlank && distance === 0;
  // Free target choice: melee always, plus Sniper / Point-Blank for ranged.
  const canChooseTargets = isMelee || hasSniper || isPointBlankShot;

  // Free targeting reorders the whole zone. Otherwise the player may only break
  // ties inside one priority band — a Brute against an Abomination.
  const requestedIds: string[] = intent.payload?.targetZombieIds ?? [];
  if (requestedIds.length > 0) {
    const rank = new Map<string, number>();
    requestedIds.forEach((id, i) => rank.set(id, i));
    const band = (z: Zombie) => (canChooseTargets ? 0 : priorityMap[z.type]);
    zombiesInTargetZone.sort((a, b) => {
      const byBand = band(a) - band(b);
      if (byBand !== 0) return byBand;
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }

  let xpGained = 0;

  // Friendly fire: per rules, MISSES wound survivors in the target zone.
  // Hits go to zombies. Only applies to ranged attacks with friendlies present.
  // Melee is never subject to friendly fire.
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

  // Every miss lands: one survivor in the zone takes the weapon's damage for
  // each of them. Misses are never dropped once each survivor has taken one.
  if (ffTargets.length > 0 && !hasSniper && totalMisses > 0) {
      const damagePerMiss = stats.damage + bonusDamage;
      if (ffTargets.length === 1) {
          applyWound(newState, ffTargets[0].id, totalMisses * damagePerMiss, { toughKey: attackContextId });
      } else {
          // More than one possible victim: the shooter's player assigns the
          // misses, through the same pending decision as wound distribution.
          (newState.pendingZombieWounds ??= []).push({
              zoneId: targetZoneId,
              totalWounds: totalMisses,
              survivorIds: ffTargets.map(f => f.id),
              contextId: attackContextId,
              damagePerWound: damagePerMiss,
              assignedByPlayerId: intent.playerId,
              source: 'FRIENDLY_FIRE',
          });
      }
  }

  // Hits go to zombies. Ranged follows target priority and stops at a target it
  // cannot kill, so a Brute shields the Walkers behind it; melee and free
  // targeting skip that target instead of wasting the hit.
  const hasReaperCombat = survivor.skills.includes('reaper_combat');
  const hasReaperMelee = survivor.skills.includes('reaper_melee');
  const assignment = assignHits(
    newState,
    zombiesInTargetZone,
    totalHits,
    stats.damage + bonusDamage,
    {
      onUnkillable: canChooseTargets ? 'skip' : 'stop',
      reaper: hasReaperCombat || (hasReaperMelee && isMelee),
      zoneId: targetZoneId,
    },
  );
  xpGained += assignment.xp;

  if (xpGained > 0) {
    newState.survivors[intent.survivorId!] = XPManager.addXP(newState.survivors[intent.survivorId!], xpGained);
  }

  // Hold Your Nose: draw equipment card when last zombie in zone eliminated
  if (survivor.skills.includes('hold_your_nose')) {
    const remainingZombies = zombiesInZone(newState, targetZoneId);
    if (remainingZombies.length === 0 && zombiesInTargetZone.length > 0) {
      // Zone was cleared — draw 1 equipment card (not a search action).
      // Take the deck/discard/seed from the draw BEFORE resolving, or the
      // resolution's own discard would be overwritten; and resolve through the
      // shared path, which re-reads the survivor from state — `addXP` above
      // replaced the object `survivor` still points at.
      const drawResult = DeckService.drawCard(newState);
      newState.equipmentDeck = drawResult.newState.equipmentDeck;
      newState.equipmentDiscard = drawResult.newState.equipmentDiscard;
      newState.seed = drawResult.newState.seed;
      if (drawResult.card) {
        resolveDrawnCard(newState, intent.survivorId!, drawResult.card);
      }
    }
  }

  // Hit & Run: if any kill occurred, grant 1 free move that ignores the zombie-leave cost.
  // Re-read: addXP / Hold Your Nose replace the survivor object.
  if (survivor.skills.includes('hit_and_run') && xpGained > 0) {
    const attacker = newState.survivors[intent.survivorId!];
    attacker.freeMovesRemaining = (attacker.freeMovesRemaining || 0) + 1;
    attacker.hitAndRunFreeMove = true;
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

  if (!survivor) throw new Error('Survivor not found');
  if (survivor.playerId !== intent.playerId) throw new Error(es.errors.notYourSurvivor);
  if (!survivor.pendingWounds || survivor.pendingWounds <= 0) {
    throw new Error(es.errors.noPendingWounds);
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
      DeckService.discard(newState, discarded);
    }
  }

  // Apply remaining wounds. Tough and the discard save were already settled
  // when the wounds were deferred, so neither applies again here.
  applyWound(newState, survivor.id, survivor.pendingWounds - negated, { allowDiscardSave: false });

  survivor.pendingWounds = 0;

  return newState;
}

export function handleDistributeZombieWounds(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const zoneId: string = intent.payload?.zoneId;
  const contextId: string | undefined = intent.payload?.contextId;
  const assignments: Record<string, number> = intent.payload?.assignments;

  if (!zoneId || !assignments) throw new Error('Missing zoneId or assignments');

  const pending = newState.pendingZombieWounds as GameState['pendingZombieWounds'];
  if (!pending || pending.length === 0) throw new Error(es.errors.noPendingZombieWounds);

  const entryIndex = pending.findIndex(
    p => p.zoneId === zoneId && (contextId === undefined || p.contextId === contextId),
  );
  if (entryIndex < 0) throw new Error(es.errors.noPendingZombieWounds);

  const entry = pending[entryIndex];

  // Zombie wounds are the host's to distribute; friendly fire is the shooter's.
  const assigner = entry.assignedByPlayerId ?? newState.lobby.players[0]?.id;
  if (!assigner || intent.playerId !== assigner) throw new Error(es.errors.hostOnlyWounds);

  // Validate: total assigned must equal totalWounds
  const totalAssigned = Object.values(assignments).reduce((sum, n) => sum + n, 0);
  if (totalAssigned !== entry.totalWounds) {
    throw new Error(es.errors.assignExactWounds(entry.totalWounds, totalAssigned));
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

  // Apply wounds to each survivor. Friendly fire assigns misses, each worth the
  // weapon's damage; a zombie attack is one wound apiece.
  const perAssignment = entry.damagePerWound ?? 1;
  for (const [survivorId, assigned] of Object.entries(assignments)) {
    applyWound(newState, survivorId, assigned * perAssignment, {
      toughKey: entry.contextId,
      record: entry.source !== 'FRIENDLY_FIRE',
    });
  }

  // Remove the resolved entry
  pending.splice(entryIndex, 1);
  if (pending.length === 0) {
    delete newState.pendingZombieWounds;
  }

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
  if (!survivor.skills.includes('lucky')) throw new Error(es.errors.noSkill(skillName('lucky')));
  if (survivor.luckyUsedThisAction && !survivor.cheatMode) throw new Error(es.errors.skillUsed(skillName('lucky')));

  const last = state.lastAction;
  if (!last || last.type !== ActionType.ATTACK || last.survivorId !== intent.survivorId) {
    throw new Error(es.errors.noAttackToReroll);
  }
  const snap = last.rollbackSnapshot;
  if (!snap) throw new Error(es.errors.rerollUnavailable);

  // 1. Rebuild pre-attack entity state
  const restored = structuredClone(state) as GameState;
  restored.zombies = structuredClone(snap.zombies);
  restored.survivors = structuredClone(snap.survivors);
  restored.equipmentDeck = structuredClone(snap.equipmentDeck);
  restored.equipmentDiscard = structuredClone(snap.equipmentDiscard);
  restored.objectives = structuredClone(snap.objectives);
  restored.noiseTokens = snap.noiseTokens;
  for (const [zid, n] of Object.entries(snap.zoneNoise)) {
    if (restored.zones[zid]) restored.zones[zid].noiseTokens = n;
  }
  restored.seed = [snap.seedAfterRoll[0], snap.seedAfterRoll[1], snap.seedAfterRoll[2], snap.seedAfterRoll[3]];

  // 2. Burn the skill before recursing so the rerun doesn't capture a new snapshot.
  restored.survivors[intent.survivorId!].luckyUsedThisAction = true;

  // 3. Re-run the attack with the same payload from the seed-advanced position
  const rerunIntent: ActionRequest = {
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    type: ActionType.ATTACK,
    payload: snap.attackPayload as Record<string, unknown>,
  };
  // `isRerun` keeps the rerun on the original action: it must not re-arm Lucky.
  let reran = handleAttack(restored, rerunIntent, { isRerun: true });

  // 4. Re-apply the AP cost of the ATTACK. The recursive handleAttack does NOT deduct AP
  // (deduction normally happens in ActionProcessor after the handler returns), and
  // REROLL_LUCKY is not a game-action so the processor won't deduct for the reroll either.
  // Without this, Lucky would refund the AP the original attack spent.
  const extraCost = reran._extraAPCost || 0;
  delete reran._extraAPCost;
  reran = deductAPWithFreeCheck(reran, intent.survivorId!, ActionType.ATTACK, extraCost, reran.lastAction?.isMelee);

  // 5. Annotate the new lastAction with reroll provenance
  if (reran.lastAction && reran.lastAction.type === ActionType.ATTACK) {
    reran.lastAction.rerolledFrom = snap.originalDice;
    reran.lastAction.rerollSource = 'lucky';
    // Drop the now-stale snapshot; a second reroll is not allowed anyway
    delete reran.lastAction.rollbackSnapshot;
  }

  return reran;
}

/**
 * Reload action: a `reload` weapon holds one shot, so firing it again costs an
 * action to load it. The End Phase reloads every such weapon for free.
 */
export function handleReload(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  if (!survivor) throw new Error('Survivor not found');

  const weaponId = intent.payload?.weaponId;
  let weapon: EquipmentCard | undefined;
  if (weaponId) {
    weapon = survivor.inventory.find((c: EquipmentCard) => c.id === weaponId);
    if (!weapon) throw new Error(es.errors.weaponNotInHand);
  } else {
    const unloaded = survivor.inventory.filter(
      (c: EquipmentCard) => c.keywords?.includes('reload') && c.loaded === false,
    );
    if (unloaded.length === 0) throw new Error(es.errors.noWeaponInHand);
    if (unloaded.length > 1) throw new Error(es.errors.chooseWeapon);
    weapon = unloaded[0];
  }

  if (!weapon.keywords?.includes('reload')) {
    throw new Error(es.errors.weaponNotReloadable(equipmentName(weapon)));
  }
  if (weapon.loaded !== false) {
    throw new Error(es.errors.weaponAlreadyLoaded(equipmentName(weapon)));
  }

  weapon.loaded = true;

  newState.lastAction = {
    type: ActionType.RELOAD,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: es.log.reloaded(equipmentName(weapon)),
  };

  return newState;
}
