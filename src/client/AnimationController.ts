// src/client/AnimationController.ts

import * as PIXI from 'pixi.js';
import { EntityId, ZoneId } from '../types/GameState';

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

  constructor(app: PIXI.Application, getSprite: (id: EntityId) => PIXI.Container | undefined) {
    this.app = app;
    this.getSprite = getSprite;
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
   * Tween an entity from one screen position to another over ~300ms.
   */
  public animateMove(
    entityId: EntityId,
    fromX: number, fromY: number,
    toX: number, toY: number
  ): void {
    const sprite = this.getSprite(entityId);
    if (!sprite) return;

    this.animatingEntities.add(entityId);

    // Start at the old position
    sprite.position.set(fromX, fromY);

    const duration = 300; // ms
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
