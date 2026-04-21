
import { SpawnCard, DangerLevel, ZombieType } from '../types/GameState';

// Zombicide 2nd Edition Spawn Deck — 40 cards total (RULEBOOK §15)
// #001-#018: Easier spawns (lower counts, no Abominations at Blue)
// #019-#036: Harder spawns (higher counts, Abominations can appear earlier)
// #037-#040: Extra Activation cards (no spawn, activate all zombies of one type;
//            no effect at Blue). Distribution: 2× Walker, 1× Runner, 1× Brute.

export const SPAWN_CARDS: SpawnCard[] = [
  // ═══════════════════════════════════════════════════════
  // TIER 1: Easier Spawns (#001-#018)
  // ═══════════════════════════════════════════════════════

  // #001 — Light walkers
  {
    id: 'spawn-001',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6, [ZombieType.Runner]: 1 } },
  },
  // #002 — Walkers only
  {
    id: 'spawn-002',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9 } },
  },
  // #003 — Single walker ramp
  {
    id: 'spawn-003',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 5 } },
  },
  // #004 — Runner introduction
  {
    id: 'spawn-004',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3 } },
  },
  // #005 — Walker with runner mix
  {
    id: 'spawn-005',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 3, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Runner]: 2 } },
  },
  // #006 — Brute arrives at yellow
  {
    id: 'spawn-006',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Walker]: 2 } },
  },
  // #007 — Nothing at blue
  {
    id: 'spawn-007',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 7 } },
  },
  // #008 — Double runner
  {
    id: 'spawn-008',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4 } },
  },
  // #009 — Walkers crescendo
  {
    id: 'spawn-009',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6, [ZombieType.Brute]: 1 } },
  },
  // #010 — Light mixed
  {
    id: 'spawn-010',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 3, [ZombieType.Runner]: 2 } },
  },
  // #011 — Brute escalation
  {
    id: 'spawn-011',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Runner]: 1 } },
  },
  // #012 — Walker rush
  {
    id: 'spawn-012',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8 } },
  },
  // #013 — Runner ramp
  {
    id: 'spawn-013',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 1, [ZombieType.Walker]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 2, [ZombieType.Walker]: 3 } },
  },
  // #014 — Abomination at red only
  {
    id: 'spawn-014',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1 } },
  },
  // #015 — Light walkers 2
  {
    id: 'spawn-015',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 5, [ZombieType.Brute]: 1 } },
  },
  // #016 — Runners late
  {
    id: 'spawn-016',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3, [ZombieType.Walker]: 2 } },
  },
  // #017 — Brute at orange
  {
    id: 'spawn-017',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 3 } },
  },
  // #018 — Mixed walkers and brute
  {
    id: 'spawn-018',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Brute]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 2 } },
  },

  // ═══════════════════════════════════════════════════════
  // TIER 2: Harder Spawns (#019-#036)
  // ═══════════════════════════════════════════════════════

  // #019 — Heavy walkers
  {
    id: 'spawn-019',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 8 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 10 } },
  },
  // #020 — Brute from blue
  {
    id: 'spawn-020',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Walker]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Walker]: 4 } },
  },
  // #021 — Runner swarm
  {
    id: 'spawn-021',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4, [ZombieType.Walker]: 2 } },
  },
  // #022 — Mixed heavy
  {
    id: 'spawn-022',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 5, [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6, [ZombieType.Runner]: 3 } },
  },
  // #023 — Abomination at orange
  {
    id: 'spawn-023',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 3 } },
  },
  // #024 — Heavy walkers 2
  {
    id: 'spawn-024',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9, [ZombieType.Brute]: 1 } },
  },
  // #025 — Brute and runners
  {
    id: 'spawn-025',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Runner]: 2 } },
  },
  // #026 — Runner escalation
  {
    id: 'spawn-026',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2, [ZombieType.Walker]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3, [ZombieType.Walker]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4, [ZombieType.Walker]: 3 } },
  },
  // #027 — Brute heavy
  {
    id: 'spawn-027',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 3, [ZombieType.Runner]: 1 } },
  },
  // #028 — Abomination threat
  {
    id: 'spawn-028',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 2 } },
  },
  // #029 — Walker horde
  {
    id: 'spawn-029',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7, [ZombieType.Runner]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8, [ZombieType.Runner]: 2 } },
  },
  // #030 — Mixed with brute
  {
    id: 'spawn-030',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 5, [ZombieType.Brute]: 2 } },
  },
  // #031 — Nothing at blue, big at red
  {
    id: 'spawn-031',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 6, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8, [ZombieType.Brute]: 1 } },
  },
  // #032 — Runner and brute mix
  {
    id: 'spawn-032',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2, [ZombieType.Brute]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3, [ZombieType.Brute]: 2 } },
  },
  // #033 — Abomination early
  {
    id: 'spawn-033',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 4 } },
  },
  // #034 — Heavy runner
  {
    id: 'spawn-034',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1, [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2, [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3, [ZombieType.Walker]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4, [ZombieType.Walker]: 4 } },
  },
  // #035 — Brute pair
  {
    id: 'spawn-035',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1, [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Walker]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Walker]: 5 } },
  },
  // #036 — Abomination at red
  {
    id: 'spawn-036',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Brute]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2, [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Runner]: 2 } },
  },

  // ═══════════════════════════════════════════════════════
  // TIER 3: Extra Activation Cards (#037-#040) — RULEBOOK §15
  // No zombies spawn. All zombies of the indicated type perform
  // an extra Activation. No effect at Blue Danger Level.
  // Canonical Z2E core deck: 2× Walker, 1× Runner, 1× Brute.
  //
  // Rush (spawn-then-activate) is runtime-supported via
  // SpawnDetail.rush but is not part of the canonical 40-card
  // deck; it belongs to mission/expansion-specific spawn sets.
  // ═══════════════════════════════════════════════════════

  // #037 — Extra Activation: Walkers
  {
    id: 'spawn-037',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Red]: { extraActivation: ZombieType.Walker },
  },
  // #038 — Extra Activation: Walkers
  {
    id: 'spawn-038',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Red]: { extraActivation: ZombieType.Walker },
  },
  // #039 — Extra Activation: Runners
  {
    id: 'spawn-039',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Runner },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Runner },
    [DangerLevel.Red]: { extraActivation: ZombieType.Runner },
  },
  // #040 — Extra Activation: Brutes
  {
    id: 'spawn-040',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Brute },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Brute },
    [DangerLevel.Red]: { extraActivation: ZombieType.Brute },
  },
];
