// src/tests/StateDiff.test.ts

import { generateDiff, applyPatch } from '../utils/StateDiff';

const stateA = {
  turn: 1,
  players: ['p1', 'p2'],
  survivors: {
    's1': { hp: 3, pos: { x: 0, y: 0 } },
    's2': { hp: 3, pos: { x: 1, y: 1 } }
  },
  deck: ['c1', 'c2', 'c3']
};

const stateB = {
  turn: 2,
  players: ['p1', 'p2'], // No change
  survivors: {
    's1': { hp: 2, pos: { x: 1, y: 0 } }, // HP change, Pos change
    's2': { hp: 3, pos: { x: 1, y: 1 } }, // No change
    's3': { hp: 3, pos: { x: 0, y: 0 } }  // New survivor
  },
  deck: ['c1', 'c2'] // Card drawn (removed from end in this simplified view, or c3 removed)
};

console.log('--- Test 1: Generate Diff ---');
const patch = generateDiff(stateA, stateB);
console.log('Patch:', JSON.stringify(patch, null, 2));

console.log('--- Test 2: Apply Patch ---');
const stateC = applyPatch(stateA, patch);
console.log('Result State:', JSON.stringify(stateC, null, 2));

console.log('--- Test 3: Verify Equality ---');
const jsonB = JSON.stringify(stateB);
const jsonC = JSON.stringify(stateC);

if (jsonB === jsonC) {
  console.log('PASS: State C matches State B');
} else {
  console.error('FAIL: State C does not match State B');
  console.log('Expected:', jsonB);
  console.log('Actual:  ', jsonC);
}

// Test Array Truncation specifically
const arrA = [1, 2, 3];
const arrB = [1];
const patchArr = generateDiff(arrA, arrB);
console.log('Array Truncation Patch:', JSON.stringify(patchArr));
const resArr = applyPatch(arrA, patchArr);
console.log('Array Truncation Result:', JSON.stringify(resArr));
if (JSON.stringify(resArr) === JSON.stringify(arrB)) console.log('PASS: Array Truncation');
else console.error('FAIL: Array Truncation');
