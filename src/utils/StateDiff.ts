// src/utils/StateDiff.ts

export interface DiffOperation {
  op: 'add' | 'remove' | 'replace';
  path: (string | number)[];
  value?: any;
}

export type StatePatch = DiffOperation[];

/**
 * Generates a minimal list of operations to transform prev into next.
 */
export function generateDiff(prev: any, next: any): StatePatch {
  return diffRecursive([], prev, next);
}

/**
 * Applies the patch to the state, returning a new immutable state.
 */
export function applyPatch<T>(state: T, patch: StatePatch): T {
  if (!patch || patch.length === 0) return state;

  // Deep clone start
  const newState = JSON.parse(JSON.stringify(state));

  for (const op of patch) {
    applyOperation(newState, op);
  }

  return newState;
}

function diffRecursive(path: (string | number)[], objA: any, objB: any): StatePatch {
  // 1. Strict Equality
  if (objA === objB) return [];

  // 2. Type/Null Check -> Replace
  if (
    typeof objA !== typeof objB ||
    objA === null ||
    objB === null ||
    typeof objA !== 'object'
  ) {
    return [{ op: 'replace', path, value: objB }];
  }

  // 3. Date handling (if any, though GameState usually JSON)
  if (objA instanceof Date && objB instanceof Date) {
    return objA.getTime() === objB.getTime() ? [] : [{ op: 'replace', path, value: objB }];
  }

  // 4. Array Handling
  if (Array.isArray(objA)) {
    if (!Array.isArray(objB)) {
      return [{ op: 'replace', path, value: objB }];
    }

    const patch: StatePatch = [];
    const lenA = objA.length;
    const lenB = objB.length;
    
    // Iterate up to the length of the shorter array to compare items
    const commonLen = Math.min(lenA, lenB);
    for (let i = 0; i < commonLen; i++) {
      patch.push(...diffRecursive([...path, i], objA[i], objB[i]));
    }

    // If B is longer, ADD items (append)
    if (lenB > lenA) {
      for (let i = lenA; i < lenB; i++) {
        patch.push({ op: 'add', path: [...path, i], value: objB[i] });
      }
    }
    // If A is longer, REMOVE items (truncate)
    // Important: Remove from END to START to preserve indices for earlier removals
    else if (lenA > lenB) {
      for (let i = lenA - 1; i >= lenB; i--) {
        patch.push({ op: 'remove', path: [...path, i] });
      }
    }

    return patch;
  }

  // 5. Object Handling
  const patch: StatePatch = [];
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  const distinctKeys = new Set([...keysA, ...keysB]);

  for (const key of distinctKeys) {
    const newPath = [...path, key];
    const hasA = Object.prototype.hasOwnProperty.call(objA, key);
    const hasB = Object.prototype.hasOwnProperty.call(objB, key);

    if (!hasA && hasB) {
      patch.push({ op: 'add', path: newPath, value: objB[key] });
    } else if (hasA && !hasB) {
      patch.push({ op: 'remove', path: newPath });
    } else if (hasA && hasB) {
      patch.push(...diffRecursive(newPath, objA[key], objB[key]));
    }
  }

  return patch;
}

function applyOperation(root: any, op: DiffOperation) {
  let target = root;
  const p = op.path;
  
  if (p.length === 0) return; // Cannot replace root

  // Navigate to parent
  for (let i = 0; i < p.length - 1; i++) {
    const key = p[i];
    // Create intermediate structure if missing (though patch usually implies validity)
    if (target[key] === undefined) {
       target[key] = typeof p[i+1] === 'number' ? [] : {};
    }
    target = target[key];
  }

  const lastKey = p[p.length - 1];

  if (op.op === 'add' || op.op === 'replace') {
    // Array handling: If target is array and key is number
    if (Array.isArray(target) && typeof lastKey === 'number') {
      // 'add' at index usually means insert/append in JSON Patch,
      // but here we use index assignment for 'add' if it's an append.
      // If it's a sparse array or gap, assignment works.
      // However, if we generated 'add' for index 5 on an array of length 5, it's an append.
      // If we generated 'replace' for index 3, it's an assignment.
      if (op.op === 'add' && lastKey >= target.length) {
          target[lastKey] = op.value; 
      } else if (op.op === 'add') {
          // If we are "adding" at an existing index (insert), use splice
          // BUT our generator only generates 'add' for appends (lenB > lenA).
          // So assignment is correct for our specific generator.
          // Standard JSON Patch 'add' inserts. 
          // We will stick to our generator's contract: 'add' is used for new keys or new array indices (append).
          target[lastKey] = op.value;
      } else {
          target[lastKey] = op.value;
      }
    } else {
      target[lastKey] = op.value;
    }
  } else if (op.op === 'remove') {
    if (Array.isArray(target) && typeof lastKey === 'number') {
      // Array removal
      // Our generator produces removals from end-to-start for truncation.
      // So splice is safe.
      target.splice(lastKey, 1);
    } else {
      delete target[lastKey];
    }
  }
}
