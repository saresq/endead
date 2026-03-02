
import * as PIXI from 'pixi.js';

export class TileService {
  private tilesheet: PIXI.Texture | null = null;
  private tileTextures: Map<string, PIXI.Texture> = new Map();
  public isReady = false;

  private TILE_PADDING = 28;
  private TILE_SIZE = 675; // Approx match for 4247x2138
  private COLS = 6;
  private ROWS = 3;

  async loadAssets(): Promise<void> {
    if (this.isReady) return;

    try {
      const texture = await PIXI.Assets.load('/images/tiles/default-tiles.png');
      this.tilesheet = texture;
      this.sliceTiles();
      this.isReady = true;
      console.log('TileService: Assets loaded successfully.');
    } catch (e) {
      console.error('TileService: Failed to load assets', e);
    }
  }

  private sliceTiles() {
    if (!this.tilesheet) return;

    // --- Correct Ordering ---
    // Row 0: 1R, 1V, 2R, 2V, 3R, 3V
    // Row 1: 4R, 4V, 5R, 5V, 6R, 6V
    // Row 2: 7R, 7V, 8R, 8V, 9R, 9V

    const ids: string[] = [];

    for (let row = 0; row < this.ROWS; row++) {
      for (let col = 0; col < this.COLS; col++) {
        // Calculate crop rectangle
        // Each tile is separated by padding.
        // X = Padding + (Col * (Size + Padding))
        // Y = Padding + (Row * (Size + Padding))
        
        const x = this.TILE_PADDING + (col * (this.TILE_SIZE + this.TILE_PADDING));
        const y = this.TILE_PADDING + (row * (this.TILE_SIZE + this.TILE_PADDING));
        
        // Ensure strictly within image bounds
        const frame = new PIXI.Rectangle(x, y, this.TILE_SIZE, this.TILE_SIZE);
        
        // Create sub-texture
        const tileTex = new PIXI.Texture({
           source: this.tilesheet.source,
           frame
        });

        // Determine ID
        // Col Pair: 0,1 -> Base 1 | 2,3 -> Base 2 | 4,5 -> Base 3
        const pairIndex = Math.floor(col / 2); // 0, 1, 2
        
        // Base Number Logic: Row 0 starts at 1, Row 1 at 4, Row 2 at 7
        const rowStart = (row * 3) + 1; // 1, 4, 7
        const baseNum = rowStart + pairIndex; // 1+0=1, 1+1=2...
        
        // Suffix: Even cols are 'R', Odd cols are 'V'
        const suffix = (col % 2 === 0) ? 'R' : 'V';
        
        const id = `${baseNum}${suffix}`;

        this.tileTextures.set(id, tileTex);
        ids.push(id);
      }
    }
    
    console.log(`TileService: Sliced ${ids.length} tiles:`, ids);
  }

  getTexture(id: string): PIXI.Texture | undefined {
    return this.tileTextures.get(id);
  }

  getAllIds(): string[] {
    // Sort logically 1R, 1V, 2R...
    const keys = Array.from(this.tileTextures.keys());
    return keys.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
    });
  }
}

export const tileService = new TileService();
