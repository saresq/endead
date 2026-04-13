# Task: ActionProcessor Split & State Cloning

**Priority**: Nice to Have  
**Status**: Dead code removed, types cleaned up. Major refactor remains.

## 1. Split ActionProcessor into Handler Modules
ActionProcessor.ts is ~1400+ lines. Split into:
```
src/services/handlers/
  CombatHandler.ts
  MovementHandler.ts  
  SearchHandler.ts
  DoorHandler.ts
  TradeHandler.ts
```
Keep ActionProcessor.ts as dispatcher only.

## 2. Consistent State Cloning Strategy
Mix of JSON.parse deep clone, shallow copy, and direct mutation across handlers.
Standardize on one approach (e.g., structuredClone or immer).

## 3. StateDiff Network Optimization
StateDiff.ts exists and is used for animation detection, but full network diff optimization is not wired up. Currently sends full state on every action.
