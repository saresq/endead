import * as PIXI from 'pixi.js';
import { ZombieType } from '../types/GameState';

/**
 * Manages sprite assets for survivors, zombies, items, and action icons.
 * Falls back gracefully when assets are not yet available —
 * callers should check for undefined return and render placeholders.
 *
 * Asset directory structure (expected in public/):
 *   images/sprites/survivors/{classId}.png  (64x64)
 *   images/sprites/zombies/{type}.png       (64x64)
 *   images/icons/items/{itemId}.png         (48x48)
 *   images/icons/actions/{action}.png       (32x32)
 *   images/icons/zone/{indicator}.png       (32x32)
 */

export class AssetManager {
  private survivorTextures = new Map<string, PIXI.Texture>();
  private zombieTextures = new Map<string, PIXI.Texture>();
  private itemIconTextures = new Map<string, PIXI.Texture>();
  private actionIconTextures = new Map<string, PIXI.Texture>();
  private zoneIconTextures = new Map<string, PIXI.Texture>();
  private _isReady = false;

  public get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Attempt to load all sprite assets. Missing files are silently skipped.
   */
  async loadAssets(): Promise<void> {
    if (this._isReady) return;

    const survivorClasses = ['wanda', 'doug', 'amy', 'ned', 'phil', 'josh'];
    const zombieTypes = ['walker', 'runner', 'brute', 'abomination'];
    const items = [
      'crowbar', 'fire_axe', 'machete', 'katana', 'chainsaw', 'pan', 'baseball_bat',
      'pistol', 'sawed_off', 'shotgun', 'sniper_rifle', 'smg', 'molotov',
      'flashlight', 'plenty_of_ammo', 'goalie_mask', 'canned_food', 'water',
    ];
    const actions = ['search', 'noise', 'door', 'objective', 'trade', 'end_turn', 'attack', 'sprint'];
    const zoneIndicators = ['noise', 'searchable', 'spawn', 'exit', 'objective'];

    const loadInto = async (map: Map<string, PIXI.Texture>, basePath: string, ids: string[]) => {
      for (const id of ids) {
        try {
          const texture = await PIXI.Assets.load(`${basePath}/${id}.png`);
          if (texture) map.set(id, texture);
        } catch {
          // Asset not found — skip silently
        }
      }
    };

    await Promise.all([
      loadInto(this.survivorTextures, '/images/sprites/survivors', survivorClasses),
      loadInto(this.zombieTextures, '/images/sprites/zombies', zombieTypes),
      loadInto(this.itemIconTextures, '/images/icons/items', items),
      loadInto(this.actionIconTextures, '/images/icons/actions', actions),
      loadInto(this.zoneIconTextures, '/images/icons/zone', zoneIndicators),
    ]);

    this._isReady = true;
  }

  getSurvivorTexture(characterClass: string): PIXI.Texture | undefined {
    const key = characterClass.toLowerCase().replace(/\s+/g, '_');
    return this.survivorTextures.get(key);
  }

  getZombieTexture(type: ZombieType): PIXI.Texture | undefined {
    const key = type.toLowerCase();
    return this.zombieTextures.get(key);
  }

  getItemIcon(itemName: string): PIXI.Texture | undefined {
    const key = itemName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    return this.itemIconTextures.get(key);
  }

  getActionIcon(action: string): PIXI.Texture | undefined {
    return this.actionIconTextures.get(action);
  }

  getZoneIcon(indicator: string): PIXI.Texture | undefined {
    return this.zoneIconTextures.get(indicator);
  }

  /**
   * Get the URL path for an item icon (for use in HTML <img> tags).
   * Returns undefined if the asset hasn't been loaded.
   */
  getItemIconUrl(itemName: string): string | undefined {
    const key = itemName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    if (this.itemIconTextures.has(key)) {
      return `/images/icons/items/${key}.png`;
    }
    return undefined;
  }

  getActionIconUrl(action: string): string | undefined {
    if (this.actionIconTextures.has(action)) {
      return `/images/icons/actions/${action}.png`;
    }
    return undefined;
  }
}

export const assetManager = new AssetManager();
