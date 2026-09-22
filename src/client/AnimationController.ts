// src/client/AnimationController.ts

import * as PIXI from 'pixi.js';
import { EntityId, ZoneId } from '../types/GameState';
import { BOARD_THEME } from './config/BoardTheme';
import type { CueTone } from './ui/eventLog';

/** Board surface floating text is drawn on. */
export interface FxTarget {
  fxLayer: PIXI.Container;
  cameraScale: number;
  zoneCenter(zoneId: ZoneId): { x: number; y: number };
}

const FLOAT_TEXT_MS = 1200;
const FLOAT_TEXT_RISE_PX = 30;
const FLOAT_TEXT_FONT_PX = 22;
const MOVE_MS = 300;
/** Rush moves run slower — they happen inside one broadcast and must be seen. */
export const RUSH_MOVE_MS = 700;

export interface AnimationEvent {
  type: 'SPAWN' | 'MOVE' | 'ATTACK' | 'DEATH';
  entityId: EntityId;
  zoneId?: ZoneId; // Target zone for move, or spawn location
  payload?: any;
}

export class AnimationController {
  private app: PIXI.Application;

  // Registry of sprites managed by the Renderer (we access them to animate)
  private getSprite: (id: EntityId) => PIXI.Container | undefined;

  /** Entities currently being animated — the renderer should not snap their position. */
  private animatingEntities: Set<EntityId> = new Set();

  private fx: FxTarget | null;

  constructor(
    app: PIXI.Application,
    getSprite: (id: EntityId) => PIXI.Container | undefined,
    fx: FxTarget | null = null,
  ) {
    this.app = app;
    this.getSprite = getSprite;
    this.fx = fx;
  }

  /**
   * Short text over a zone that rises and fades (no rise under reduced motion).
   * Sized in screen pixels at spawn time, whatever the camera zoom.
   */
  public floatText(zoneId: ZoneId, text: string, tone: CueTone): void {
    const fx = this.fx;
    if (!fx) return;
    const scale = fx.cameraScale || 1;
    const label = new PIXI.Text({
      text,
      style: {
        fontFamily: BOARD_THEME.font.display,
        fontSize: FLOAT_TEXT_FONT_PX,
        fill: BOARD_THEME.cue[tone],
        stroke: { color: BOARD_THEME.cue.stroke, width: 4 },
        letterSpacing: 1,
      },
    });
    label.anchor.set(0.5);
    label.scale.set(1 / scale);
    const c = fx.zoneCenter(zoneId);
    // Stack cues that land on the same zone at once.
    const stacked = fx.fxLayer.children.filter(ch => (ch as { cueZone?: string }).cueZone === zoneId).length;
    const startY = c.y - (stacked * (FLOAT_TEXT_FONT_PX + 4)) / scale;
    label.position.set(c.x, startY);
    (label as unknown as { cueZone: string }).cueZone = zoneId;
    fx.fxLayer.addChild(label);

    const rise = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : FLOAT_TEXT_RISE_PX / scale;
    const start = performance.now();
    const animate = () => {
      if (label.destroyed) {
        this.app.ticker.remove(animate);
        return;
      }
      const t = Math.min((performance.now() - start) / FLOAT_TEXT_MS, 1);
      label.y = startY - rise * (1 - (1 - t) * (1 - t));
      // Hold fully visible for the first half, then fade.
      label.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      if (t >= 1) {
        this.app.ticker.remove(animate);
        label.destroy();
      }
    };
    this.app.ticker.add(animate);
  }

  /** Returns true if the entity is mid-animation (renderer should skip position snap). */
  public isAnimating(entityId: EntityId): boolean {
    return this.animatingEntities.has(entityId);
  }

  public handleEvent(event: AnimationEvent): void {
    switch (event.type) {
      case 'SPAWN':
        this.animateSpawn(event.entityId);
        break;
      case 'MOVE':
        if (event.payload?.fromX != null && event.payload?.toX != null) {
          this.animateMove(
            event.entityId,
            event.payload.fromX, event.payload.fromY,
            event.payload.toX, event.payload.toY
          );
        }
        break;
      case 'DEATH':
        this.animateDeath(event.entityId);
        break;
    }
  }

  /**
   * Tween an entity from one screen position to another over ~300ms, or
   * `durationMs` when the move is worth watching (a Rush, say).
   */
  public animateMove(
    entityId: EntityId,
    fromX: number, fromY: number,
    toX: number, toY: number,
    durationMs = MOVE_MS,
  ): void {
    const sprite = this.getSprite(entityId);
    if (!sprite) return;

    this.animatingEntities.add(entityId);

    // Start at the old position
    sprite.position.set(fromX, fromY);

    const duration = durationMs;
    const startTime = performance.now();

    const animate = () => {
      if (sprite.destroyed || !sprite.position) {
        this.app.ticker.remove(animate);
        this.animatingEntities.delete(entityId);
        return;
      }
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);

      // Ease-out quadratic
      const ease = 1 - (1 - t) * (1 - t);

      sprite.position.set(
        fromX + (toX - fromX) * ease,
        fromY + (toY - fromY) * ease,
      );

      if (t >= 1) {
        sprite.position.set(toX, toY);
        this.app.ticker.remove(animate);
        this.animatingEntities.delete(entityId);
      }
    };

    this.app.ticker.add(animate);
  }

  private animateSpawn(entityId: EntityId): void {
    const sprite = this.getSprite(entityId);
    if (!sprite) return;

    // Pop-in animation
    sprite.scale.set(0);
    sprite.alpha = 0;

    let progress = 0;
    const animate = () => {
      if (sprite.destroyed || !sprite.scale) {
        this.app.ticker.remove(animate);
        return;
      }
      progress += 0.1;
      if (progress >= 1) {
        sprite.scale.set(1);
        sprite.alpha = 1;
        this.app.ticker.remove(animate);
      } else {
        const scale = this.elasticOut(progress);
        sprite.scale.set(scale);
        sprite.alpha = progress;
      }
    };

    this.app.ticker.add(animate);
  }

  private animateDeath(entityId: EntityId): void {
    const sprite = this.getSprite(entityId);
    if (!sprite) return;

    let progress = 0;
    const animate = () => {
      if (sprite.destroyed || !sprite.scale) {
        this.app.ticker.remove(animate);
        return;
      }
      progress += 0.1;
      if (progress >= 1) {
        sprite.alpha = 0;
        this.app.ticker.remove(animate);
      } else {
        sprite.alpha = 1 - progress;
        sprite.scale.set(1 + progress * 0.5);
      }
    };

    this.app.ticker.add(animate);
  }

  // Easing function
  private elasticOut(t: number): number {
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  }
}
