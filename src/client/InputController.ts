
import * as PIXI from 'pixi.js';
import { GameState, EntityId, ZoneId, PlayerId, Zombie, EquipmentCard } from '../types/GameState';
import { ActionType } from '../types/Action';
import { TILE_SIZE, ENTITY_RADIUS } from '../config/Layout';
import { getZoneLayout } from './utils/zoneLayout';
import { networkManager } from './NetworkManager';
import { gameStore } from './GameStore';
import { PixiBoardRenderer } from './PixiBoardRenderer';
import { RenderOptions } from './PixiBoardRenderer';
import { modalManager } from './ui/overlays/ModalManager';
import { getZombieTypeDisplay } from './config/ZombieTypeConfig';
import { icon } from './ui/components/icons';

export class InputController {
  private app: PIXI.Application;
  private renderer: PixiBoardRenderer;
  private selectedSurvivorId: EntityId | null = null;
  private pendingMoveZoneId: ZoneId | null = null;
  private localPlayerId: PlayerId;
  private interactionMode: 'DEFAULT' | 'ATTACK' | 'OPEN_DOOR' | 'SPRINT' | 'CHARGE' | 'BLOODLUST_MELEE' | 'LIFESAVER' = 'DEFAULT';
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

  public get mode(): string {
    return this.interactionMode;
  }

  public get weaponId(): EntityId | null {
    return this.selectedWeaponId;
  }

  public setMode(mode: 'DEFAULT' | 'ATTACK' | 'OPEN_DOOR' | 'SPRINT' | 'CHARGE' | 'BLOODLUST_MELEE' | 'LIFESAVER', weaponId?: EntityId): void {
    const nextWeaponId = weaponId || null;
    // Toggle off when re-selecting the same mode (and same weapon, for ATTACK)
    if (mode !== 'DEFAULT' && mode === this.interactionMode && nextWeaponId === this.selectedWeaponId) {
      this.interactionMode = 'DEFAULT';
      this.selectedWeaponId = null;
      if (this.onModeChange) this.onModeChange('DEFAULT');
      this.requestRender();
      return;
    }
    this.interactionMode = mode;
    this.selectedWeaponId = nextWeaponId;
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

    const availableDoorZones = this.getAvailableDoorZones(state);

    // Compute AP cost per move zone (base 1 + zombie penalty)
    const moveCostByZone = this.getMoveCostByZone(state, validMoveZones);

    const sprintZones = this.interactionMode === 'SPRINT' ? this.getValidSprintZones(state) : [];
    if (this.interactionMode === 'SPRINT') {
      console.log('[Sprint] mode=SPRINT, sprintZones:', sprintZones.length, sprintZones);
    }

    const attackZones = this.interactionMode === 'ATTACK' ? this.getValidAttackZones(state) : [];

    return {
      activeSurvivorId: this.selectedSurvivorId || undefined,
      validMoveZones,
      pendingMoveZoneId: pendingMoveZoneId || undefined,
      moveCostByZone,
      availableDoorZones,
      sprintZones,
      attackZones,
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
          this.handleAttackClick(currentState, clickedZoneId, survivor);
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'OPEN_DOOR') {
          this.sendOpenDoorAction(clickedZoneId);
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'SPRINT') {
          const sprintPath = this.findSprintPath(currentState, survivor.position.zoneId, clickedZoneId);
          if (sprintPath) {
            networkManager.sendAction({
              playerId: this.localPlayerId,
              survivorId: this.selectedSurvivorId!,
              type: ActionType.SPRINT,
              payload: { path: sprintPath },
            });
          }
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'CHARGE') {
          this.sendSkillZoneAction(ActionType.CHARGE, clickedZoneId);
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'BLOODLUST_MELEE') {
          this.sendSkillZoneAction(ActionType.BLOODLUST_MELEE, clickedZoneId);
          this.setMode('DEFAULT');
        } else if (this.interactionMode === 'LIFESAVER') {
          this.sendLifesaverAction(clickedZoneId, currentState);
          this.setMode('DEFAULT');
        } else {
          // DEFAULT = MOVE (tap once to preview, tap again to confirm)
          const validMoveZones = this.getValidMoveZones(currentState);
          if (currentZone && validMoveZones.includes(clickedZoneId)) {
            if (this.pendingMoveZoneId === clickedZoneId) {
              this.sendMoveAction(clickedZoneId, currentState);
              this.pendingMoveZoneId = null;
            } else {
              this.pendingMoveZoneId = clickedZoneId;
            }
            this.requestRender();
          } else {
            console.warn('InputController: Target zone not reachable.');
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

  private getMoveCostForZone(state: GameState): number {
    if (!this.selectedSurvivorId) return 1;
    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || survivor.skills.includes('slippery')) return 1;

    const zombiesInZone = Object.values(state.zombies)
      .filter((z: any) => z.position.zoneId === survivor.position.zoneId).length;
    return 1 + zombiesInZone;
  }

  private getMoveCostByZone(state: GameState, validZones: ZoneId[]): Record<ZoneId, number> | undefined {
    const cost = this.getMoveCostForZone(state);
    if (cost <= 1 || validZones.length === 0) return undefined;
    const map: Record<ZoneId, number> = {};
    for (const z of validZones) map[z] = cost;
    return map;
  }

  private getValidMoveZones(state: GameState): ZoneId[] {
    if (!this.selectedSurvivorId || this.interactionMode !== 'DEFAULT') return [];

    const activePlayerId = state.players[state.activePlayerIndex];
    if (activePlayerId !== this.localPlayerId) return [];

    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || survivor.playerId !== this.localPlayerId || survivor.actionsRemaining < 1) return [];

    const currentZone = state.zones[survivor.position.zoneId];
    if (!currentZone) return [];

    const moveCost = this.getMoveCostForZone(state);
    if (survivor.actionsRemaining < moveCost) return [];

    const hasExtraZone = survivor.skills.includes('plus_1_zone_per_move');
    const maxDepth = hasExtraZone ? 2 : 1;
    const isSlippery = survivor.skills.includes('slippery');
    const reachable: ZoneId[] = [];

    // Depth-1: immediate adjacent zones (not blocked by doors)
    for (const conn of currentZone.connections) {
      if (conn.hasDoor && !conn.doorOpen) continue;
      reachable.push(conn.toZoneId);
    }

    // Depth-2: zones reachable through an intermediate zone (plus_1_zone_per_move only)
    if (maxDepth >= 2) {
      for (const conn of currentZone.connections) {
        if (conn.hasDoor && !conn.doorOpen) continue;
        const midZone = state.zones[conn.toZoneId];
        if (!midZone) continue;

        // Entering a zone with zombies stops movement (unless slippery)
        if (!isSlippery) {
          const hasZombies = Object.values(state.zombies)
            .some((z: any) => z.position.zoneId === conn.toZoneId);
          if (hasZombies) continue;
        }

        for (const conn2 of midZone.connections) {
          if (conn2.hasDoor && !conn2.doorOpen) continue;
          if (conn2.toZoneId === survivor.position.zoneId) continue;
          if (!reachable.includes(conn2.toZoneId)) {
            reachable.push(conn2.toZoneId);
          }
        }
      }
    }

    return reachable;
  }

  private getValidSprintZones(state: GameState): ZoneId[] {
    if (!this.selectedSurvivorId) return [];

    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || !survivor.skills.includes('sprint') || survivor.sprintUsedThisTurn) return [];
    if (survivor.actionsRemaining < 1) return [];

    const startZoneId = survivor.position.zoneId;
    const isSlippery = survivor.skills.includes('slippery');
    const reachable: ZoneId[] = [];

    // BFS to depth 3, tracking paths; zombie zone stops movement
    type Node = { zoneId: ZoneId; depth: number };
    const queue: Node[] = [{ zoneId: startZoneId, depth: 0 }];
    const visited = new Set<ZoneId>([startZoneId]);

    while (queue.length > 0) {
      const { zoneId, depth } = queue.shift()!;
      if (depth >= 3) continue;

      const zone = state.zones[zoneId];
      if (!zone) continue;

      // Entering a zone with zombies stops movement (except start zone)
      if (depth > 0 && !isSlippery) {
        const hasZombies = Object.values(state.zombies)
          .some((z: any) => z.position.zoneId === zoneId);
        if (hasZombies) continue; // can't continue past zombie zone
      }

      for (const conn of zone.connections) {
        if (conn.hasDoor && !conn.doorOpen) continue;
        if (visited.has(conn.toZoneId)) continue;
        visited.add(conn.toZoneId);
        const nextDepth = depth + 1;
        if (nextDepth >= 2) { // Sprint requires at least 2 zones
          reachable.push(conn.toZoneId);
        }
        queue.push({ zoneId: conn.toZoneId, depth: nextDepth });
      }
    }

    return reachable;
  }

  private findSprintPath(state: GameState, fromZoneId: ZoneId, targetZoneId: ZoneId): ZoneId[] | null {
    const isSlippery = state.survivors[this.selectedSurvivorId!]?.skills.includes('slippery');

    // BFS to find shortest path of 2-3 zones
    type Node = { zoneId: ZoneId; path: ZoneId[] };
    const queue: Node[] = [{ zoneId: fromZoneId, path: [] }];
    const visited = new Set<ZoneId>([fromZoneId]);

    while (queue.length > 0) {
      const { zoneId, path } = queue.shift()!;
      if (path.length >= 3) continue;

      const zone = state.zones[zoneId];
      if (!zone) continue;

      // Zombie zone stops movement (except start)
      if (path.length > 0 && !isSlippery) {
        const hasZombies = Object.values(state.zombies)
          .some((z: any) => z.position.zoneId === zoneId);
        if (hasZombies) continue;
      }

      for (const conn of zone.connections) {
        if (conn.hasDoor && !conn.doorOpen) continue;
        if (visited.has(conn.toZoneId)) continue;
        visited.add(conn.toZoneId);
        const nextPath = [...path, conn.toZoneId];
        if (conn.toZoneId === targetZoneId && nextPath.length >= 2) {
          return nextPath;
        }
        queue.push({ zoneId: conn.toZoneId, path: nextPath });
      }
    }
    return null;
  }

  private getValidAttackZones(state: GameState): ZoneId[] {
    if (!this.selectedSurvivorId) return [];

    const activePlayerId = state.players[state.activePlayerIndex];
    if (activePlayerId !== this.localPlayerId) return [];

    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || survivor.playerId !== this.localPlayerId) return [];
    if (survivor.actionsRemaining < 1) return [];

    let weapon = this.selectedWeaponId
      ? survivor.inventory.find(c => c.id === this.selectedWeaponId && c.inHand)
      : undefined;
    if (!weapon) {
      const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);
      if (weapons.length === 1) weapon = weapons[0];
    }
    if (!weapon || !weapon.stats) return [];

    const stats = weapon.stats;
    const currentZoneId = survivor.position.zoneId;

    const zonesWithZombies = new Set<ZoneId>(
      Object.values(state.zombies).map((z: any) => z.position.zoneId)
    );

    const isMelee = stats.range[1] === 0;
    if (isMelee) {
      return zonesWithZombies.has(currentZoneId) ? [currentZoneId] : [];
    }

    const hasPlus1Range = survivor.skills.includes('plus_1_max_range');
    const hasPointBlank = survivor.skills.includes('point_blank');
    const minRange = stats.range[0];
    const maxRange = stats.range[1] + (hasPlus1Range ? 1 : 0);

    const targets: ZoneId[] = [];
    const queue: { zoneId: ZoneId; dist: number }[] = [{ zoneId: currentZoneId, dist: 0 }];
    const visited = new Set<ZoneId>([currentZoneId]);

    while (queue.length > 0) {
      const { zoneId, dist } = queue.shift()!;

      const effectiveMin = hasPointBlank && dist === 0 ? 0 : minRange;
      if (dist >= effectiveMin && dist <= maxRange && zonesWithZombies.has(zoneId)) {
        targets.push(zoneId);
      }

      if (dist >= maxRange) continue;

      const zone = state.zones[zoneId];
      if (!zone) continue;

      for (const conn of zone.connections) {
        if (visited.has(conn.toZoneId)) continue;
        if (conn.hasDoor && !conn.doorOpen) continue;
        visited.add(conn.toZoneId);
        queue.push({ zoneId: conn.toZoneId, dist: dist + 1 });
      }
    }

    return targets;
  }

  private getAvailableDoorZones(state: GameState): ZoneId[] {
    if (this.interactionMode !== 'OPEN_DOOR' || !this.selectedSurvivorId) return [];

    const activePlayerId = state.players[state.activePlayerIndex];
    if (activePlayerId !== this.localPlayerId) return [];

    const survivor = state.survivors[this.selectedSurvivorId];
    if (!survivor || survivor.playerId !== this.localPlayerId) return [];

    // Check if survivor has door-opening equipment in hand
    const hasOpener = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    if (!hasOpener) return [];

    const currentZone = state.zones[survivor.position.zoneId];
    if (!currentZone) return [];

    // Return zones connected via closed doors
    return currentZone.connections
      .filter(c => c.hasDoor && !c.doorOpen)
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

  private sendMoveAction(targetZoneId: ZoneId, state?: GameState): void {
    if (!this.selectedSurvivorId) return;

    // Check if target is a direct neighbor
    const survivor = state?.survivors[this.selectedSurvivorId];
    const currentZone = survivor ? state?.zones[survivor.position.zoneId] : null;
    const isDirect = currentZone?.connections.some(c => c.toZoneId === targetZoneId && !(c.hasDoor && !c.doorOpen));

    if (isDirect || !state || !currentZone) {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        survivorId: this.selectedSurvivorId,
        type: ActionType.MOVE,
        payload: { targetZoneId },
      });
    } else {
      // 2-zone move: find intermediate zone
      const path = this.findMovePath(state, survivor!.position.zoneId, targetZoneId);
      if (path) {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: this.selectedSurvivorId,
          type: ActionType.MOVE,
          payload: { path },
        });
      }
    }
  }

  private findMovePath(state: GameState, fromZoneId: ZoneId, targetZoneId: ZoneId): ZoneId[] | null {
    const fromZone = state.zones[fromZoneId];
    if (!fromZone) return null;

    for (const conn of fromZone.connections) {
      if (conn.hasDoor && !conn.doorOpen) continue;
      const midZone = state.zones[conn.toZoneId];
      if (!midZone) continue;

      for (const conn2 of midZone.connections) {
        if (conn2.hasDoor && !conn2.doorOpen) continue;
        if (conn2.toZoneId === targetZoneId) {
          return [conn.toZoneId, targetZoneId];
        }
      }
    }
    return null;
  }

  private sendAttackAction(targetZoneId: ZoneId, targetZombieIds?: EntityId[], weaponId?: EntityId | null): void {
    if (!this.selectedSurvivorId) return;

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: ActionType.ATTACK,
      payload: {
        targetZoneId,
        weaponId: weaponId !== undefined ? weaponId : this.selectedWeaponId,
        ...(targetZombieIds && targetZombieIds.length > 0 ? { targetZombieIds } : {}),
      },
    });
  }

  /**
   * Resolves a melee weapon's target selection. Per Zombicide 2E rules, melee attacks let the
   * player freely pick which zombies to kill. When the target zone has multiple killable zombies,
   * open a picker modal; otherwise dispatch directly.
   */
  private handleAttackClick(state: GameState, targetZoneId: ZoneId, survivor: any): void {
    const weapon: EquipmentCard | undefined = this.selectedWeaponId
      ? survivor.inventory.find((c: EquipmentCard) => c.id === this.selectedWeaponId && c.inHand)
      : survivor.inventory.find((c: EquipmentCard) => c.type === 'WEAPON' && c.inHand);
    if (!weapon || !weapon.stats) {
      this.sendAttackAction(targetZoneId);
      return;
    }

    const isMelee = weapon.stats.range[1] === 0;
    const zombiesInZone = Object.values(state.zombies).filter(
      (z: any) => z.position.zoneId === targetZoneId
    ) as Zombie[];

    if (!isMelee || zombiesInZone.length <= 1) {
      this.sendAttackAction(targetZoneId, undefined, weapon.id);
      return;
    }

    this.openMeleeTargetPicker(targetZoneId, zombiesInZone, weapon);
  }

  private openMeleeTargetPicker(targetZoneId: ZoneId, zombies: Zombie[], weapon: EquipmentCard): void {
    const maxPicks = Math.min(zombies.length, (weapon.stats?.dice ?? 1) + 2);
    const selection: EntityId[] = [];

    const renderBody = () => {
      return `
        <div class="stack stack--sm">
          <p class="text-muted-sm">Click zombies in the order you want to kill them. First click = first to die.</p>
          <div class="zombie-picker-grid">
            ${zombies.map(z => {
              const display = getZombieTypeDisplay(z.type);
              const orderIdx = selection.indexOf(z.id);
              const selectedClass = orderIdx >= 0 ? ' zombie-picker-btn--selected' : '';
              const badge = orderIdx >= 0
                ? `<span class="zombie-picker-btn__order">${orderIdx + 1}</span>`
                : '';
              return `
                <button class="zombie-picker-btn${selectedClass}" data-action="toggle-zombie" data-id="${z.id}" style="border-color:${display.colorHex}">
                  <span class="zombie-picker-btn__icon" style="color:${display.colorHex}">${icon(display.iconName, 'md')}</span>
                  <span class="zombie-picker-btn__label">${display.label}</span>
                  ${badge}
                </button>`;
            }).join('')}
          </div>
        </div>`;
    };

    const renderFooter = () => {
      const disabled = selection.length === 0 ? 'disabled' : '';
      const label = selection.length === 0
        ? 'Pick a target'
        : `Attack (${selection.length} target${selection.length > 1 ? 's' : ''})`;
      return `<button class="btn btn-primary" data-action="confirm-attack" ${disabled}>${label}</button>`;
    };

    const modalId = modalManager.open({
      title: 'Choose Targets',
      subtitle: `${weapon.name} (Melee) — pick kill order`,
      size: 'md',
      renderBody,
      renderFooter,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const toggle = target.closest('[data-action="toggle-zombie"]') as HTMLElement | null;
          if (toggle) {
            const id = toggle.dataset.id;
            if (!id) return;
            const idx = selection.indexOf(id);
            if (idx >= 0) {
              selection.splice(idx, 1);
            } else if (selection.length < maxPicks) {
              selection.push(id);
            }
            modalManager.updateBody(modalId, renderBody());
            modalManager.updateFooter(modalId, renderFooter());
            return;
          }
          const confirm = target.closest('[data-action="confirm-attack"]') as HTMLButtonElement | null;
          if (confirm && !confirm.disabled) {
            modalManager.close(modalId);
            this.sendAttackAction(targetZoneId, selection, weapon.id);
          }
        });
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

  /** Send Sprint/Charge/Bloodlust — uses path=[targetZoneId] for single-zone targeting */
  private sendSkillZoneAction(actionType: ActionType, targetZoneId: ZoneId): void {
    if (!this.selectedSurvivorId) return;

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: actionType,
      payload: { path: [targetZoneId] },
    });
  }

  /** Send Lifesaver — rescues all survivors in the target zone */
  private sendLifesaverAction(targetZoneId: ZoneId, state: GameState): void {
    if (!this.selectedSurvivorId) return;

    const survivorIds = Object.values(state.survivors)
      .filter(s => s.position.zoneId === targetZoneId && s.id !== this.selectedSurvivorId && s.wounds < s.maxHealth)
      .map(s => s.id);

    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId,
      type: ActionType.LIFESAVER,
      payload: { targetZoneId, targetSurvivorIds: survivorIds },
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

      // Zone bounds for clamping (matches renderer's calculatePosition)
      const margin = ENTITY_RADIUS;
      const zoneLeft = layout.col * TILE_SIZE + margin;
      const zoneRight = (layout.col + layout.w) * TILE_SIZE - margin;
      const zoneTop = layout.row * TILE_SIZE + margin;
      const zoneBottom = (layout.row + layout.h) * TILE_SIZE - margin;

      for (let i = 0; i < zoneSurvivors.length; i++) {
        const offsetX = -20 + (i % 3) * 40;
        const offsetY = -20 - Math.floor(i / 3) * 40;

        let cx = centerX + offsetX;
        let cy = centerY + offsetY;
        // Clamp to zone bounds
        cx = Math.max(zoneLeft, Math.min(zoneRight, cx));
        cy = Math.max(zoneTop, Math.min(zoneBottom, cy));

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
