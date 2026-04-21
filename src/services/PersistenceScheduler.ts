import { GameState } from '../types/GameState';
import { persistenceService } from './PersistenceService';
import { projectForSocket } from '../server/projectForSocket';

export interface SchedulableRoom {
  id: string;
  gameState: GameState;
  dirty: boolean;
}

type RoomLookup = (roomId: string) => SchedulableRoom | null;
type RoomIterator = () => Iterable<SchedulableRoom>;

const IDLE_MS = 10_000;

export class PersistenceScheduler {
  private idleTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly getRoom: RoomLookup,
    private readonly listRooms: RoomIterator,
  ) {}

  markDirty(roomId: string): void {
    const room = this.getRoom(roomId);
    if (!room) return;
    room.dirty = true;
    this.resetIdle(roomId);
  }

  triggerZombiePhaseComplete(roomId: string): void {
    this.scheduleFlush(roomId);
  }

  triggerEndTurn(roomId: string): void {
    this.scheduleFlush(roomId);
  }

  triggerLastDisconnect(roomId: string): void {
    this.scheduleFlush(roomId);
    this.clearIdle(roomId);
  }

  onRoomRemoved(roomId: string): void {
    this.clearIdle(roomId);
  }

  flushAllSync(): number {
    let written = 0;
    for (const room of this.listRooms()) {
      this.clearIdle(room.id);
      if (this.flushSync(room)) written++;
    }
    return written;
  }

  // SwarmComms §3.5 / §3.7.1: persistence routes through projectForSocket
  // with `socket=null` — the server-local view retains seed + deck contents
  // but defensively drops any transient scratch that slips onto GameState.
  private flushSync(room: SchedulableRoom): boolean {
    if (!room.dirty) return false;
    try {
      const persistable = projectForSocket(room.gameState, null);
      persistenceService.saveRoom(room.id, persistable);
      room.dirty = false;
      return true;
    } catch (e) {
      console.error(`[PersistenceScheduler] Failed to persist room ${room.id}:`, e);
      return false;
    }
  }

  private scheduleFlush(roomId: string): void {
    setImmediate(() => {
      const room = this.getRoom(roomId);
      if (!room) return;
      this.flushSync(room);
    });
  }

  private resetIdle(roomId: string): void {
    this.clearIdle(roomId);
    const timer = setTimeout(() => {
      this.idleTimers.delete(roomId);
      const room = this.getRoom(roomId);
      if (!room) return;
      this.flushSync(room);
    }, IDLE_MS);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
    this.idleTimers.set(roomId, timer);
  }

  private clearIdle(roomId: string): void {
    const existing = this.idleTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.idleTimers.delete(roomId);
    }
  }
}
