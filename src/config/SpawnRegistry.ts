
import { SpawnCard, DangerLevel, ZombieType } from '../types/GameState';

export const SPAWN_CARDS: SpawnCard[] = [
  // Card 1: Standard Escalation
  {
    id: 'spawn-001',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6 } }
  },
  // Card 2: Runner Introduction
  {
    id: 'spawn-002',
    [DangerLevel.Blue]: { zombies: {} }, // Nothing
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Runner]: 3 } }
  },
  // Card 3: Fatty Time
  {
    id: 'spawn-003',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Fatty]: 1 } }, // Fatty usually comes with walkers in real game, but keeping simple
    [DangerLevel.Orange]: { zombies: { [ZombieType.Fatty]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Fatty]: 3 } }
  },
  // Card 4: The Horde
  {
    id: 'spawn-004',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 2 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 4 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 6 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 8 } }
  },
  // Card 5: Mixed Bag
  {
    id: 'spawn-005',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Walker]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Walker]: 2, [ZombieType.Runner]: 1 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Walker]: 4, [ZombieType.Runner]: 2 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Walker]: 6, [ZombieType.Runner]: 3 } }
  },
  // Card 6: Abomination Threat (Rare at low levels, guaranteed at high)
  {
    id: 'spawn-006',
    [DangerLevel.Blue]: { zombies: { [ZombieType.Fatty]: 1 } },
    [DangerLevel.Yellow]: { zombies: { [ZombieType.Fatty]: 2 } },
    [DangerLevel.Orange]: { zombies: { [ZombieType.Abomination]: 1 } },
    [DangerLevel.Red]: { zombies: { [ZombieType.Abomination]: 1, [ZombieType.Walker]: 2 } }
  },
  // Card 7: Extra Activation
  {
    id: 'spawn-007',
    [DangerLevel.Blue]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Yellow]: { extraActivation: ZombieType.Walker },
    [DangerLevel.Orange]: { extraActivation: ZombieType.Runner },
    [DangerLevel.Red]: { extraActivation: ZombieType.Runner } // Fallback to Runner
  },
  
  // Card 8: Double Spawn
  {
    id: 'spawn-008',
    [DangerLevel.Blue]: { doubleSpawn: true },
    [DangerLevel.Yellow]: { doubleSpawn: true },
    [DangerLevel.Orange]: { doubleSpawn: true },
    [DangerLevel.Red]: { doubleSpawn: true }
  }
];
