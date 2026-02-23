// src/client/ui/SurvivorDashboard.ts

import * as PIXI from 'pixi.js';
import { Survivor, DangerLevel, EquipmentCard } from '../../types/GameState';

const DANGER_COLORS: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0x0099FF,
  [DangerLevel.Yellow]: 0xFFFF00,
  [DangerLevel.Orange]: 0xFF9900,
  [DangerLevel.Red]: 0xFF0000,
};

const WIDTH = 300;
const HEIGHT = 600; // Increased height
const PADDING = 10;

export class SurvivorDashboard extends PIXI.Container {
  private bg: PIXI.Graphics;
  private nameText: PIXI.Text;
  private statsText: PIXI.Text;
  private dangerBar: PIXI.Graphics;
  private inventoryContainer: PIXI.Container;
  
  constructor() {
    super();

    // 1. Background
    this.bg = new PIXI.Graphics();
    this.addChild(this.bg);

    // 2. Name
    this.nameText = new PIXI.Text({ text: '', style: {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xFFFFFF,
      fontWeight: 'bold'
    }});
    this.nameText.position.set(PADDING, PADDING);
    this.addChild(this.nameText);

    // 3. Danger Level Bar
    this.dangerBar = new PIXI.Graphics();
    this.dangerBar.position.set(PADDING, 50);
    this.addChild(this.dangerBar);

    // 4. Stats (XP, Actions, Wounds)
    this.statsText = new PIXI.Text({ text: '', style: {
      fontFamily: 'Arial',
      fontSize: 16,
      fill: 0xCCCCCC
    }});
    this.statsText.position.set(PADDING, 80);
    this.addChild(this.statsText);

    // 5. Inventory Container
    this.inventoryContainer = new PIXI.Container();
    this.inventoryContainer.position.set(PADDING, 150);
    this.addChild(this.inventoryContainer);

    // Initial render
    this.drawBackground();
  }

  private drawBackground() {
    this.bg.clear();
    this.bg.rect(0, 0, WIDTH, HEIGHT);
    this.bg.fill({ color: 0x222222, alpha: 0.9 });
    this.bg.stroke({ width: 2, color: 0x666666 });
  }

  /**
   * Updates the dashboard with the latest survivor state.
   */
  public update(survivor: Survivor | null): void {
    if (!survivor) {
      this.visible = false;
      return;
    }
    this.visible = true;

    // Name
    this.nameText.text = `${survivor.name} (${survivor.characterClass})`;

    // Danger Bar
    const color = DANGER_COLORS[survivor.dangerLevel];
    this.dangerBar.clear();
    this.dangerBar.rect(0, 0, WIDTH - (PADDING * 2), 10);
    this.dangerBar.fill({ color });
    
    // Stats
    // XP
    const xp = `XP: ${survivor.experience}`;
    // Actions
    const ap = `Actions: ${survivor.actionsRemaining}/${survivor.actionsPerTurn}`;
    // Wounds
    const wounds = `Wounds: ${survivor.wounds}/${survivor.maxHealth}`;
    
    this.statsText.text = `${xp}\n${ap}\n${wounds}`;

    // Inventory
    this.renderInventory(survivor.inventory);
  }

  private renderInventory(inventory: EquipmentCard[]): void {
    this.inventoryContainer.removeChildren();

    // Draw Hands/Body Slots
    const hand1 = inventory.find(c => c.slot === 'HAND_1');
    const hand2 = inventory.find(c => c.slot === 'HAND_2');
    const body = inventory.find(c => c.slot === 'BODY');

    this.drawSlot('Left Hand', 0, hand1);
    this.drawSlot('Right Hand', 60, hand2);
    this.drawSlot('Body', 120, body);

    // Draw Backpack
    const backpackItems = inventory.filter(c => c.slot === 'BACKPACK');
    let backpackY = 180;
    this.drawLabel('Backpack (Max 3):', backpackY);
    backpackY += 25;

    // Fixed 3 Slots for Backpack
    for (let i = 0; i < 3; i++) {
        const item = backpackItems[i];
        if (item) {
            this.drawCardItem(item, 0, backpackY);
        } else {
            const placeholder = new PIXI.Text({ text: '(Empty)', style: { fontSize: 14, fill: 0x555555 } });
            placeholder.position.set(0, backpackY + 4);
            this.inventoryContainer.addChild(placeholder);
        }
        backpackY += 30;
    }
  }

  private drawSlot(label: string, y: number, item?: EquipmentCard): void {
    this.drawLabel(label, y);
    if (item) {
      this.drawCardItem(item, 0, y + 20);
    } else {
      const placeholder = new PIXI.Text({ text: '(Empty)', style: { fontSize: 14, fill: 0x555555 } });
      placeholder.position.set(0, y + 20);
      this.inventoryContainer.addChild(placeholder);
    }
  }

  private drawLabel(text: string, y: number): void {
    const label = new PIXI.Text({ text, style: { fontSize: 14, fill: 0xAAAAAA } });
    label.position.set(0, y);
    this.inventoryContainer.addChild(label);
  }

  private drawCardItem(card: EquipmentCard, x: number, y: number): void {
    const bg = new PIXI.Graphics();
    
    // Check if weapon for stats
    let text = card.name;
    if (card.stats) {
      text += ` [R:${card.stats.range[0]}-${card.stats.range[1]} D:${card.stats.dice}@${card.stats.accuracy}+ Dam:${card.stats.damage}]`;
    }

    const cardText = new PIXI.Text({ text, style: { fontSize: 14, fill: 0xFFFFFF } });
    
    // Background for card
    bg.rect(x, y, WIDTH - (PADDING * 2), 25);
    bg.fill({ color: 0x444444 });
    bg.stroke({ width: 1, color: 0x000000 });

    cardText.position.set(x + 5, y + 4);

    this.inventoryContainer.addChild(bg);
    this.inventoryContainer.addChild(cardText);
  }
}
