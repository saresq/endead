
import * as PIXI from 'pixi.js';
import { GameState, EntityId, ZoneId, PlayerId } from '../types/GameState';
import { ActionType } from '../types/Action';
import { TILE_SIZE, ENTITY_RADIUS } from '../config/Layout';
import { getZoneLayout } from './utils/zoneLayout';
import { networkManager } from './NetworkManager';
import { gameStore } from './GameStore';
import { PixiBoardRenderer } from './PixiBoardRenderer';
import { RenderOptions } from './PixiBoardRenderer';

export class InputController {
  private app: PIXI.Application;
  private renderer: PixiBoardRenderer;
  private selectedSurvivorId: EntityId | null = null;
  private pendingMoveZoneId: ZoneId | null = null;
  private localPlayerId: PlayerId;
  private interactionMode: 'DEFAULT' | 'ATTACK' | 'OPEN_DOOR' = 'DEFAULT';
  private selectedWeaponId: EntityId | null = null;
  
  // Callback for when selection changes (so the Renderer can highlight)
  private onSelectionChange?: (id: EntityId | null) => void;
  private onModeChange?: (mode: string) => void;

  constructor(app: PIXI.Application, renderer: PixiBoardRenderer, playerId: PlayerId, onSelectionChange?: (id: EntityId | null) => void, onModeChange?: (mode: string) => void) {
    this.app = app;
    this.renderer = renderer;
    this.localPlayerId = playerId;
    this.onSelectionChange = onSelectionChange;
    this.onModeChange = onModeChange;
    
    this.setupListeners();
  }

  public get selection(): EntityId | null {
    return this.selectedSurvivorId;
  }

  public setMode(mode: 'DEFAULT' | 'ATTACK' | 'OPEN_DOOR', weaponId?: EntityId): void {
    this.interactionMode = mode;
    this.selectedWeaponId = weaponId || null;
    if (mode !== 'DEFAULT') {
      this.pendingMoveZoneId = null;
    }
    if (this.onModeChange) this.onModeChange(mode);
    this.requestRender();
  }

  public getRenderOptions(state: GameState): RenderOptions {
    const validMoveZones = this.getValidMoveZones(state);
    const pendingMoveZoneId = this.pendingMoveZoneId && validMoveZones.includes(this.pendingMoveZoneId)
      ? this.pendingMoveZoneId
      : null;

    if (!pendingMoveZoneId && this.pendingMoveZoneId) {
      this.pendingMoveZoneId = null;
    }

    return {
      activeSurvivorId: this.selectedSurvivorId || undefined,
      validMoveZones,
      pendingMoveZoneId: pendingMoveZoneId || undefined,
    };
  }

  private setupListeners(): void {
    // Assuming the app uses a standard mouse interaction model.
    // The Renderer draws graphics. Since it's stateless, it redraws.
    // We can either:
    // 1. Attach click listeners to specific graphics during render (Renderer modification)
    // 2. Add a global interaction layer on top (InputController owned)
    // 3. Simple hit testing on stage pointerdown
    
    // We choose (3) for decoupling and statelessness.
    
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    
    this.app.stage.on('pointerup', (event: PIXI.FederatedPointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.renderer.consumeGestureSuppression()) return;
      const { x, y } = event.global;
      this.handleClick(x, y);
    });
  }

  private handleClick(x: number, y: number): void {
    const currentState = gameStore.state;
    if (!currentState) return;

    // Convert Screen to World
    const worldPos = this.renderer.screenToWorld(x, y);
    const wx = worldPos.x;
    const wy = worldPos.y;

    const activePlayerId = currentState.players[currentState.activePlayerIndex];
    const isMyTurn = activePlayerId === this.localPlayerId;

    // 1. Check for Survivor Click (Selection) - Allowed ANYTIME
    const clickedSurvivorId = this.hitTestSurvivors(wx, wy, currentState);
    
    if (clickedSurvivorId) {
      const survivor = currentState.survivors[clickedSurvivorId];
      if (survivor && survivor.playerId === this.localPlayerId) {
        this.selectSurvivor(clickedSurvivorId);
      } else {
        // Enforce always selecting own survivor to keep UI visible
        this.selectMySurvivor(currentState);
      }
      return;
    }

    // 2. Check for Zone Click (Movement/Action) - ONLY IF MY TURN
    if (!isMyTurn) {
        // If not my turn, ensure my survivor is selected
        this.selectMySurvivor(currentState);
        this.clearPendingMove();
        return;
    }

    if (this.selectedSurvivorId) {
      const clickedZoneId = this.hitTestZones(wx, wy, currentState);
      
      if (clickedZoneId) {
        const survivor = currentState.survivors[this.selectedSurvivorId];
        // Ensure I only command MY survivor
        if (survivor.playerId !== this.localPlayerId) return;

        const currentZone = currentState.zones[survivor.position.zoneId];

        if (this.interactionMode === 'ATTACK') {
          this.sendAttackAction(clickedZoneId);
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'OPEN_DOOR') {
          this.sendOpenDoorAction(clickedZoneId);
          this.setMode('DEFAULT');
        } else {
          // DEFAULT = MOVE (tap once to preview, tap again to confirm)
          if (currentZone && currentZone.connections.some(c => c.toZoneId === clickedZoneId)) {
            if (this.pendingMoveZoneId === clickedZoneId) {
              this.sendMoveAction(clickedZoneId);
              this.pendingMoveZoneId = null;
            } else {
              this.pendingMoveZoneId = clickedZoneId;
            }
            this.requestRender();
          } else {
            console.warn('InputController: Target zone not connected.');
            this.clearPendingMove();
          }
        }
      } else {
        // Clicked outside any zone -> Deselect?
        // If we deselect, we lose UI.
        // Maybe just don't deselect on miss click?
        // Or select my survivor?
        this.selectMySurvivor(currentState);
        this.clearPendingMove();
        this.setMode('DEFAULT');
      }
    }
  }

  public selectMySurvivor(state: GameState): void {
    // Find first survivor owned by local player
    const mySurvivor = Object.values(state.survivors).find(s => s.playerId === this.localPlayerId);
    if (mySurvivor) {
        this.selectSurvivor(mySurvivor.id);
    }
  }

  public selectMySurvivorById(id: EntityId): void {
    this.selectSurvivor(id);
  }

  public confirmPendingMove(): void {
    if (this.pendingMoveZoneId) {
      this.sendMoveAction(this.pendingMoveZoneId);
      this.pendingMoveZoneId = null;
      this.requestRender();
    }
  }

  private selectSurvivor(id: EntityId): void {
    if (this.selectedSurvivorId !== id) {
      this.selectedSurvivorId = id;
      this.pendingMoveZoneId = null;
      if (this.onSelectionChange) this.onSelectionChange(id);
      this.setMode('DEFAULT'); // Reset mode on new selection
    }
  }

  private deselect(): void {
    if (this.selectedSurvivorId !== null) {
      this.selectedSurvivorId = null;
      this.pendingMoveZoneId = null;
      if (this.onSelectionChange) this.onSelectionChange(null);
      this.setMode('DEFAULT');
    }
  }

  private getValidMoveZones(state: GameState): ZoneId[] {
    if (!this.selectedSurvivorId || this.interactionMode !== 'DEFAULT') return [];

    const activePlayerId = state.players[state.activePlayerIndex];
    if (activePlayerId !== this.localPlayerId) return [];

    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || survivor.playerId !== this.localPlayerId || survivor.actionsRemaining < 1) return [];

    const currentZone = state.zones[survivor.position.zoneId];
    if (!currentZone) return [];

    // Filter out zones blocked by closed doors
    return currentZone.connections
      .filter(c => !(c.hasDoor && !c.doorOpen))
      .map(c => c.toZoneId);
  }

  private clearPendingMove(): void {
    if (!this.pendingMoveZoneId) return;
    this.pendingMoveZoneId = null;
    this.requestRender();
  }

  private requestRender(): void {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.selectedSurvivorId);
    }
  }

  private sendMoveAction(targetZoneId: ZoneId): void {
    if (!this.selectedSurvivorId) return;

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: ActionType.MOVE,
      payload: { targetZoneId },
    });
  }

  private sendAttackAction(targetZoneId: ZoneId): void {
    if (!this.selectedSurvivorId) return;

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: ActionType.ATTACK,
      payload: { 
        targetZoneId,
        weaponId: this.selectedWeaponId 
      },
    });
  }

  private sendOpenDoorAction(targetZoneId: ZoneId): void {
    if (!this.selectedSurvivorId) return;

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: ActionType.OPEN_DOOR,
      payload: { targetZoneId },
    });
  }

  // --- Hit Testing ---

  private hitTestSurvivors(x: number, y: number, state: GameState): EntityId | null {
    // Iterate all survivors to check distance
    // We need to reconstruct their positions based on the Renderer layout logic.
    // This duplicates layout logic slightly but keeps renderer pure.
    // If exact pixel-perfect selection is needed, consider sharing the "rendered positions" 
    // from the Renderer via a cache or query.
    // For this implementation, we use the simple grid + offset logic.
    
    const survivors = Object.values(state.survivors);
    
    // Group by zone just like renderer to get offsets
    const survivorsByZone: Record<ZoneId, typeof survivors> = {};
    for (const s of survivors) {
      const z = s.position.zoneId;
      if (!survivorsByZone[z]) survivorsByZone[z] = [];
      survivorsByZone[z].push(s);
    }

    for (const zoneId in survivorsByZone) {
      const zoneSurvivors = survivorsByZone[zoneId];
      const layout = getZoneLayout(zoneId);

      // Use centroid for multi-cell zones (matches renderer's calculatePosition)
      const centerX = layout.centroidX !== undefined
        ? layout.centroidX * TILE_SIZE + TILE_SIZE / 2
        : layout.col * TILE_SIZE + TILE_SIZE / 2;
      const centerY = layout.centroidY !== undefined
        ? layout.centroidY * TILE_SIZE + TILE_SIZE / 2
        : layout.row * TILE_SIZE + TILE_SIZE / 2;

      for (let i = 0; i < zoneSurvivors.length; i++) {
        const offsetX = -20 + (i % 3) * 40;
        const offsetY = -20 - Math.floor(i / 3) * 40;

        const cx = centerX + offsetX;
        const cy = centerY + offsetY;

        // Circle hit test
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= ENTITY_RADIUS * ENTITY_RADIUS) {
          return zoneSurvivors[i].id;
        }
      }
    }
    
    return null;
  }


  private hitTestZones(x: number, y: number, state: GameState): ZoneId | null {
    // For multi-cell zones: check exact cell membership, not just bounding box
    for (const zoneId in state.zones) {
      const layout = getZoneLayout(zoneId);
      if (!layout) continue;

      if (layout.cells && layout.cells.length > 1) {
        // Multi-cell zone: check if click is within any constituent cell
        for (const c of layout.cells) {
          const cx = c.x * TILE_SIZE;
          const cy = c.y * TILE_SIZE;
          if (x >= cx && x <= cx + TILE_SIZE && y >= cy && y <= cy + TILE_SIZE) {
            return zoneId;
          }
        }
      } else {
        // Single-cell zone: simple AABB check
        const zx = layout.col * TILE_SIZE;
        const zy = layout.row * TILE_SIZE;
        const zw = layout.w * TILE_SIZE;
        const zh = layout.h * TILE_SIZE;

        if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) {
          return zoneId;
        }
      }
    }
    return null;
  }
}
