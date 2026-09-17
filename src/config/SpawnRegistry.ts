
import { SpawnCard, DangerLevel, ZombieType } from '../types/GameState';

// Zombicide 2nd Edition Zombie deck — 40 cards (rules/16-card-registry.md#zombie-deck-40-cards).
//
// Each card names one Zombie type and gives an amount per Danger Level
// (Blue / Yellow / Orange / Red).
//   #001-#018 — the easier half: lower amounts, and no Abomination at Blue.
//   #019-#036 — the harder half: bigger amounts, Abominations from Blue on.
//   #037-#040 — Extra Activation: nothing spawns, every Zombie of that type
//               activates again, and the card has no effect at Blue.
// Cards marked Rush place their Zombies and then activate them immediately.
// Runners never have a Rush card.
//
// Transcribed from the per-card amounts published by the ZombiDeck companion
// app (github.com/dapitch666/ZombiDeck), whose source data names the Brute a
// Fatty — the 1st Edition term. Cross-checked against every figure the rulebook
// does give: the tier split, no Blue Abomination below #019, the 2x Walker /
// 1x Brute / 1x Runner Extra Activations, the absence of Runner Rush cards, and
// the 3/5/7/9 Walker card the rulebook prints as its example.

export const SPAWN_CARDS: SpawnCard[] = [
  // ─── #001-#018 — the easier half ───────────────────────
  // #001 — Walker
  {
    id: 'spawn-001',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6 } },
  },
  // #002 — Walker
  {
    id: 'spawn-002',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 7 } },
  },
  // #003 — Walker
  {
    id: 'spawn-003',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9 } },
  },
  // #004 — Walker
  {
    id: 'spawn-004',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 8 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 10 } },
  },
  // #005 — Walker Rush
  {
    id: 'spawn-005',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6 }, rush: true },
  },
  // #006 — Walker Rush
  {
    id: 'spawn-006',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 3 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 5 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 7 }, rush: true },
  },
  // #007 — Walker Rush
  {
    id: 'spawn-007',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9 }, rush: true },
  },
  // #008 — Walker Rush
  {
    id: 'spawn-008',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 6 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 8 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 10 }, rush: true },
  },
  // #009 — Brute
  {
    id: 'spawn-009',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 3 } },
  },
  // #010 — Brute
  {
    id: 'spawn-010',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 4 } },
  },
  // #011 — Brute Rush
  {
    id: 'spawn-011',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 1 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 2 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 3 }, rush: true },
  },
  // #012 — Brute Rush
  {
    id: 'spawn-012',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 2 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 3 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 4 }, rush: true },
  },
  // #013 — Runner
  {
    id: 'spawn-013',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3 } },
  },
  // #014 — Runner
  {
    id: 'spawn-014',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3 } },
  },
  // #015 — Runner
  {
    id: 'spawn-015',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4 } },
  },
  // #016 — Runner
  {
    id: 'spawn-016',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4 } },
  },
  // #017 — Abomination
  {
    id: 'spawn-017',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1 } },
  },
  // #018 — Abomination
  {
    id: 'spawn-018',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1 } },
  },

  // ─── #019-#036 — the harder half ───────────────────────
  // #019 — Walker
  {
    id: 'spawn-019',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8 } },
  },
  // #020 — Walker
  {
    id: 'spawn-020',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9 } },
  },
  // #021 — Walker
  {
    id: 'spawn-021',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 8 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 10 } },
  },
  // #022 — Walker
  {
    id: 'spawn-022',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 8 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 10 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 12 } },
  },
  // #023 — Walker Rush
  {
    id: 'spawn-023',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 6 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8 }, rush: true },
  },
  // #024 — Walker Rush
  {
    id: 'spawn-024',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 3 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 5 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 7 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 9 }, rush: true },
  },
  // #025 — Walker Rush
  {
    id: 'spawn-025',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 4 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 6 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 8 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 10 }, rush: true },
  },
  // #026 — Walker Rush
  {
    id: 'spawn-026',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 6 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 8 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 10 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 12 }, rush: true },
  },
  // #027 — Brute
  {
    id: 'spawn-027',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 4 } },
  },
  // #028 — Brute
  {
    id: 'spawn-028',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 5 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 6 } },
  },
  // #029 — Brute Rush
  {
    id: 'spawn-029',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 1 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 2 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 3 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 4 }, rush: true },
  },
  // #030 — Brute Rush
  {
    id: 'spawn-030',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Brute]: 2 }, rush: true },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Brute]: 3 }, rush: true },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Brute]: 4 }, rush: true },
    [DangerLevel.Red]: { zombies: { [ZombieType.Brute]: 5 }, rush: true },
  },
  // #031 — Runner
  {
    id: 'spawn-031',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4 } },
  },
  // #032 — Runner
  {
    id: 'spawn-032',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 4 } },
  },
  // #033 — Runner
  {
    id: 'spawn-033',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 5 } },
  },
  // #034 — Runner
  {
    id: 'spawn-034',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Runner]: 3 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 5 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 6 } },
  },
  // #035 — Abomination
  {
    id: 'spawn-035',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1 } },
  },
  // #036 — Abomination
  {
    id: 'spawn-036',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1 } },
  },

  // ─── #037-#040 — Extra Activation ──────────────────────
  // #037 — Extra Activation: Walker
  {
    id: 'spawn-037',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Red]: { extraActivation: ZombieType.Walker },
  },
  // #038 — Extra Activation: Walker
  {
    id: 'spawn-038',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Red]: { extraActivation: ZombieType.Walker },
  },
  // #039 — Extra Activation: Brute
  {
    id: 'spawn-039',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Brute },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Brute },
    [DangerLevel.Red]: { extraActivation: ZombieType.Brute },
  },
  // #040 — Extra Activation: Runner
  {
    id: 'spawn-040',
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Runner },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Runner },
    [DangerLevel.Red]: { extraActivation: ZombieType.Runner },
  },
];
