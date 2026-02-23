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
  // The renderer needs to expose these or we need a shared registry.
  // For now, we will assume we can get them via a callback or shared map.
  private getSprite: (id: EntityId) => PIXI.Container | undefined;

  constructor(app: PIXI.Application, getSprite: (id: EntityId) => PIXI.Container | undefined) {
    this.app = app;
    this.getSprite = getSprite;
  }

  public handleEvent(event: AnimationEvent): void {
    switch (event.type) {
      case 'SPAWN':
        this.animateSpawn(event.entityId);
        break;
      case 'MOVE':
        // Move animation requires previous position, usually handled by 
        // the sprite simply being at the old pos and tweening to new.
        // If the renderer updates the position immediately, we need to intercept or interpolate.
        // For MVP, we might just flash or highlight.
        break;
      case 'DEATH':
        this.animateDeath(event.entityId);
        break;
    }
  }

  private animateSpawn(entityId: EntityId): void {
    const sprite = this.getSprite(entityId);
    if (!sprite) return;

    // Pop-in animation
    sprite.scale.set(0);
    sprite.alpha = 0;

    let progress = 0;
    const animate = () => {
      progress += 0.1;
      if (progress >= 1) {
        sprite.scale.set(1);
        sprite.alpha = 1;
        this.app.ticker.remove(animate);
      } else {
        // Elastic ease out
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
      progress += 0.1;
      if (progress >= 1) {
        sprite.alpha = 0;
        this.app.ticker.remove(animate);
        // Renderer will likely remove it on next render if it's gone from state
      } else {
        sprite.alpha = 1 - progress;
        sprite.scale.set(1 + progress * 0.5); // Expand and fade
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
