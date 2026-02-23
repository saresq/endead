// src/tests/ReplayService.test.ts

import { initialGameState, type GameState } from '../types/GameState';
import { ActionType } from '../types/Action';
import { replayGame, compareStates } from '../services/ReplayService';

// Mock simple test case
const mockHistory = [
  {
    playerId: 'player-1',
    survivorId: 'survivor-1',
    actionType: ActionType.MOVE,
    timestamp: 123456789,
    payload: { targetZoneId: 'street-intersection' }
  }
];

// Test the replay logic
try {
  console.log('Running Replay Test...');
  
  // 1. Run replay
  const testStart = JSON.parse(JSON.stringify(initialGameState));
  // Manually add survivor for test
  testStart.survivors['survivor-1'] = {
      id: 'survivor-1',
      playerId: 'player-1',
      name: 'Test',
      characterClass: 'Test',
      position: { x: 0, y: 0, zoneId: 'street-start' },
      actionsPerTurn: 3,
      actionsRemaining: 3,
      maxHealth: 3,
      wounds: 0,
      experience: 0,
      dangerLevel: 'BLUE',
      skills: [],
      inventory: [],
      hasMoved: false,
      hasSearched: false
  };

  const replayedState = replayGame(testStart, mockHistory);
  
  // 2. Expected final state (manually calculated or presumed from a live run)
  // For this test, we assume the move happens correctly.
  // Let's create a manual "expected" state to compare against.
  const expectedState = JSON.parse(JSON.stringify(testStart));
  expectedState.survivors['survivor-1'].position.zoneId = 'street-intersection';
  expectedState.survivors['survivor-1'].hasMoved = true;
  expectedState.survivors['survivor-1'].actionsRemaining = 2; // Default 3 - 1
  expectedState.history = []; // Replay result won't have history in comparison

  // 3. Compare
  const comparison = compareStates(expectedState, replayedState);

  if (comparison.equal) {
    console.log('PASS: Replay produced identical state.');
  } else {
    console.error('FAIL: Replay diverged.');
    console.error(`Diff: ${comparison.diff}`);
    console.log('Replayed State:', JSON.stringify(replayedState, null, 2));
    console.log('Expected State:', JSON.stringify(expectedState, null, 2));
  }

} catch (e) {
  console.error(`Test Error: ${e}`);
}
