# Plan 10: Client Infrastructure & Code Quality

**Priority**: Should Fix (client fixes) / Nice to Have (architecture)
**Source tasks**:
- `09-code-quality/client-fixes.md`
- `09-code-quality/architecture-refactor.md`

**Why grouped**: Both are code quality improvements to the client. The innerHTML fix directly helps trading (Plan 01) and general stability. Architecture refactor is a larger effort that builds on stable client infrastructure.

**Note**: The innerHTML fix may already be partially addressed when fixing trading drag-and-drop (Plan 01). Check overlap.

---

## Step 1: Client Infrastructure Fixes (Should Fix)

### 1a. innerHTML Full Re-renders
- **Files**: GameHUD, PickupUI, LobbyUI
- Replace innerHTML rebuilds with targeted DOM updates
- Priority: PickupUI (affects trading), GameHUD (affects all gameplay)

### 1b. Reconnection User Feedback
- Add `notificationManager.show()` call in NetworkManager reconnect handler
- Quick win — just a notification on reconnect

### 1c. State Rollback on Server Rejection
- Add optimistic update + rollback pattern
- When server rejects an action, revert client state to last known good state

### 1d. AnimationController Completion
- Fix position-based trigger bug (fires on zone ID change, not actual movement)
- Complete spawn/death animation stubs

---

## Step 2: Architecture Refactor (Nice to Have)

### 2a. Split ActionProcessor into Handler Modules
- Create `src/services/handlers/` directory
- Split into: CombatHandler, MovementHandler, SearchHandler, DoorHandler, TradeHandler
- Keep ActionProcessor.ts as dispatcher only

### 2b. Consistent State Cloning Strategy
- Audit current mix of JSON.parse, shallow copy, direct mutation
- Standardize on `structuredClone` or immer

### 2c. StateDiff Network Optimization
- Wire up existing StateDiff.ts for network diff
- Send deltas instead of full state on every action

---

## Step 3: Validation

Spawn an agent to:
1. Read both source task files
2. Check GameHUD, PickupUI, LobbyUI for innerHTML usage — verify replaced
3. Check NetworkManager for reconnection notification
4. Check for state rollback pattern
5. Check ActionProcessor.ts — is it split into handler modules?
6. If fully resolved: delete both source task files
7. If partially resolved: create a new task with remaining items
