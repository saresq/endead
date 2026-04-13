# Task: Remaining Client Infrastructure Issues

**Priority**: Should Fix  
**Status**: destroy() added to PixiBoardRenderer, console.logs removed. These remain.

## 1. innerHTML Full Re-renders
**Files**: GameHUD, PickupUI, LobbyUI

Using `innerHTML` rebuilds entire DOM trees on every state update. Destroys form state, breaks drag animations.
Consider targeted DOM updates or a lightweight virtual DOM diff.

## 2. AnimationController Incomplete
**File**: `src/client/AnimationController.ts`

Spawn/death animation stubs exist but are not functional. Position-based trigger bug (fires on zone ID change, not actual movement).

## 3. Reconnection User Feedback
No notification shown to user on WebSocket reconnect. Add `notificationManager.show()` call in NetworkManager reconnect handler.

## 4. State Rollback on Server Rejection
No recovery when server rejects an action. Client state becomes stale. Consider optimistic update + rollback pattern.
