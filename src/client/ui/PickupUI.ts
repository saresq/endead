
import { Survivor, EquipmentCard, GameState } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';

export class PickupUI {
  private container: HTMLElement;
  
  // State
  private survivor: Survivor | null = null;
  private newCard: EquipmentCard | null = null;
  
  // Local State
  private myInventory: EquipmentCard[] = []; 
  private ghostSlot: string | null = null; // Where the new card is currently placed locally

  private draggedItemId: string | null = null;
  private draggedIsGhost: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'pickup-ui-container';
    this.container.className = 'modal-overlay';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  public get currentSurvivorId(): string | undefined {
    return this.survivor?.id;
  }

  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  public show(survivor: Survivor): void {
    if (!survivor.drawnCard) return;

    this.survivor = survivor;
    this.newCard = survivor.drawnCard;
    
    // Initialize local inventory from server state
    this.myInventory = JSON.parse(JSON.stringify(survivor.inventory));
    
    // Reset ghost slot
    this.ghostSlot = null;
    
    // Auto-place ghost if possible (e.g. if hand empty) - wait, if hand empty we wouldn't be here usually?
    // Actually we changed logic to ALWAYS show if Hand Full.
    // If we have empty backpack slot, maybe pre-select it?
    // But requirement says "prefer hand".
    // If hand full, we don't auto-place in hand.
    // We leave it unassigned (in the "New Item" box) so user can decide.

    this.container.style.display = 'flex';
    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.survivor = null;
    this.newCard = null;
    this.ghostSlot = null;
  }

  private render(): void {
    if (!this.survivor || !this.newCard) return;

    this.container.innerHTML = `
      <div class="modal trade-modal" style="height: 600px;">
        <h2>New Item Found!</h2>
        <div class="subtitle">Rearrange your inventory to make space for the new item.</div>
        
        <div class="trade-workspace">
           <!-- My Inventory (Left) -->
           <div class="trade-panel my-inventory">
              <h3>My Inventory</h3>
              ${this.renderInventoryGrid()}
           </div>

           <!-- New Item (Right) -->
           <div class="trade-panel trade-table" style="flex: 0.8;">
              <h3>New Item</h3>
              <div class="offer-box" data-drop="new-item-area">
                 <h4>Found:</h4>
                 <div class="offer-grid" style="justify-content: center;">
                    ${!this.ghostSlot ? this.renderCard(this.newCard, true, true) : '<div class="ghost-placeholder">Placed in Inventory</div>'}
                 </div>
              </div>
            </div>
        </div>

        <div class="trade-footer">
           <div class="status-indicators">
              <div class="status">Drag items to rearrange. Drag new item to a slot.</div>
           </div>
           
           <div class="button-group">
             <button id="btn-discard-new" class="secondary">Discard New Item</button>
             <button id="btn-confirm-pickup" class="primary ${this.ghostSlot ? 'active' : ''}" ${!this.ghostSlot ? 'disabled' : ''}>Confirm & Equip</button>
           </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private renderInventoryGrid(): string {
      // Helper to find item at slot (either owned or ghost)
      const getItemAtSlot = (slot: string, index?: number) => {
          // Check if Ghost is here
          if (this.ghostSlot === slot) {
              if (slot === 'BACKPACK') {
                  // For backpack, check if we are the Nth item?
                  // We just append ghost to end of backpack list for rendering
                  // Real items first
              } else {
                  return this.newCard;
              }
          }

          // Check owned items
          const owned = this.myInventory.filter(c => c.slot === slot);
          
          if (slot === 'BACKPACK') {
              const list = [...owned];
              if (this.ghostSlot === 'BACKPACK') list.push(this.newCard!);
              return list[index!] || null;
          }

          return owned[0] || (this.ghostSlot === slot ? this.newCard : null);
      };

      const hand1 = getItemAtSlot('HAND_1');
      const hand2 = getItemAtSlot('HAND_2');
      
      const backpack0 = getItemAtSlot('BACKPACK', 0);
      const backpack1 = getItemAtSlot('BACKPACK', 1);
      const backpack2 = getItemAtSlot('BACKPACK', 2);
      
      const isGhost = (c: EquipmentCard | null) => !!(c && c.id === this.newCard?.id);

      return `
        <div class="slot-group">
           <div class="slot-row">
              <div class="slot hand-slot" data-slot="HAND_1" data-drop="inventory">
                 <div class="slot-label">Hand 1</div>
                 ${this.renderCard(hand1, true, isGhost(hand1))}
              </div>
              <div class="slot hand-slot" data-slot="HAND_2" data-drop="inventory">
                 <div class="slot-label">Hand 2</div>
                 ${this.renderCard(hand2, true, isGhost(hand2))}
              </div>
           </div>
           
           <div class="inventory-separator"></div>

           <div class="backpack-grid">
              ${[backpack0, backpack1, backpack2].map((c, i) => `
                 <div class="slot backpack-slot" data-slot="BACKPACK" data-drop="inventory">
                    ${this.renderCard(c, true, isGhost(c))}
                 </div>
              `).join('')}
           </div>
           
           <div class="discard-zone" data-slot="DISCARD" data-drop="inventory">
              <div class="slot-label">Discard Zone (Existing Items)</div>
              ${this.myInventory.filter(c => c.slot === 'DISCARD').map(c => this.renderCard(c, true, false)).join('')}
           </div>
        </div>
      `;
  }

  private renderCard(card: EquipmentCard | null | undefined, draggable: boolean, isGhost: boolean): string {
      if (!card) return '';
      return `
        <div class="trade-item ${isGhost ? 'ghost-item' : ''}" 
             draggable="${draggable}" 
             data-id="${card.id}"
             data-ghost="${isGhost}">
           <div class="item-name">${card.name}</div>
           <div class="item-type">${card.type}</div>
           ${isGhost ? '<div class="ghost-badge">NEW</div>' : ''}
        </div>
      `;
  }

  private attachListeners(): void {
      // Discard New Item (Reject)
      this.container.querySelector('#btn-discard-new')?.addEventListener('click', () => {
          if (confirm('Are you sure you want to discard this new item?')) {
              networkManager.sendAction({
                  playerId: this.survivor!.playerId,
                  survivorId: this.survivor!.id,
                  type: ActionType.RESOLVE_SEARCH,
                  payload: { action: 'DISCARD' }
              });
              // Do not hide immediately; wait for server update to clear drawnCard
          }
      });

      // Confirm & Equip
      this.container.querySelector('#btn-confirm-pickup')?.addEventListener('click', () => {
          if (!this.ghostSlot) return;
          
          networkManager.sendAction({
              playerId: this.survivor!.playerId,
              survivorId: this.survivor!.id,
              type: ActionType.RESOLVE_SEARCH,
              payload: { 
                  action: 'EQUIP',
                  targetSlot: this.ghostSlot
              }
          });
          // Do not hide immediately; wait for server update
      });

      // Drag Logic
      const items = this.container.querySelectorAll('.trade-item[draggable="true"]');
      const slots = this.container.querySelectorAll('.slot, .offer-box[data-drop="new-item-area"], .discard-zone');

      items.forEach(el => {
          el.addEventListener('dragstart', (e: any) => {
              this.draggedItemId = e.target.getAttribute('data-id');
              this.draggedIsGhost = e.target.getAttribute('data-ghost') === 'true';
              e.dataTransfer.effectAllowed = 'move';
              setTimeout(() => e.target.classList.add('dragging'), 0);
          });
          el.addEventListener('dragend', (e: any) => {
              e.target.classList.remove('dragging');
              this.draggedItemId = null;
              this.draggedIsGhost = false;
          });
      });

      slots.forEach(el => {
          el.addEventListener('dragover', (e: any) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              el.classList.add('drag-over');
          });
          el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
          el.addEventListener('drop', (e: any) => {
              e.preventDefault();
              el.classList.remove('drag-over');
              this.handleDrop(el);
          });
      });
  }

  private handleDrop(targetEl: Element): void {
      if (!this.draggedItemId) return;

      const dropType = targetEl.getAttribute('data-drop'); 
      const targetSlot = targetEl.getAttribute('data-slot');

      // 1. Drop into "New Item Area" (Unequip Ghost)
      if (dropType === 'new-item-area') {
          if (this.draggedIsGhost) {
              this.ghostSlot = null;
              this.render();
          }
          return;
      }

      // 2. Drop into Inventory Slot
      if (dropType === 'inventory' && targetSlot) {
          
          // Case A: Dragging Ghost Item
          if (this.draggedIsGhost) {
              if (targetSlot === 'DISCARD') {
                  // Ghost to Discard -> Just unequip it (same as dropping to new item area)
                  // Or prompt to discard?
                  // User can use "Discard New Item" button.
                  // Let's just unassign it for now.
                  this.ghostSlot = null;
                  this.render();
                  return;
              }

              // Check occupancy
              // If target is BACKPACK, always allow (unless >3?)
              // If target is HAND and occupied, SWAP?
              // "Swap" means Occupant moves to... Ghost's old slot?
              // Ghost's old slot was either NULL or another slot.
              // If Null, occupant goes to... inventory?
              // No, occupant must go to a valid slot.
              // If we drag Ghost to Hand 1 (Occupied), we can't swap unless we move Occupant to Backpack/Discard first.
              // But wait, "player is free to rearrange".
              // Maybe we can auto-move occupant to first available backpack slot?
              // Or just block if occupied.
              // Let's check if occupied.
              const occupants = this.myInventory.filter(c => c.slot === targetSlot);
              
              if (targetSlot !== 'BACKPACK' && occupants.length > 0) {
                  // Occupied.
                  // Try to move occupant to Backpack?
                  const backpackCount = this.myInventory.filter(c => c.slot === 'BACKPACK').length;
                  const ghostInBackpack = this.ghostSlot === 'BACKPACK' ? 1 : 0;
                  
                  if (backpackCount + ghostInBackpack < 3) {
                      // Move occupant to backpack
                      const occupant = occupants[0];
                      this.sendOrganize(occupant.id, 'BACKPACK');
                      // Then assign Ghost
                      this.ghostSlot = targetSlot;
                      // Render happens after ORGANIZE usually, but we are optimistic?
                      // ORGANIZE is async.
                      // We should wait? No, we can just let the server update and re-render trigger.
                      // But we need to persist ghostSlot.
                      // TradeUI persists local state.
                      // Here `myInventory` is updated from server. `ghostSlot` is local.
                      // If we send ORGANIZE, `update()` will be called.
                      // We need to ensure `ghostSlot` is preserved?
                      // `show()` resets it.
                      // We need `update()` method separate from `show()`.
                  } else {
                      alert('Target slot occupied and Backpack is full. Move items manually first.');
                  }
              } else {
                  // Empty or Backpack
                  this.ghostSlot = targetSlot;
                  this.render();
              }
              return;
          }

          // Case B: Dragging Existing Item
          if (!this.draggedIsGhost) {
              // Standard ORGANIZE
              const card = this.myInventory.find(c => c.id === this.draggedItemId);
              
              // Check if we are dragging onto the Ghost Slot (Swap)
              if (this.ghostSlot === targetSlot) {
                  if (card) {
                      const oldSlot = card.slot || 'BACKPACK';
                      
                      // Move Ghost to Old Slot
                      // (If Old Slot is BACKPACK, it just adds to it, which is fine)
                      // (If Old Slot is HAND, it takes it)
                      this.ghostSlot = oldSlot;
                      
                      // Send Organize for Card -> Target Slot
                      // (Target slot is technically empty on server because Ghost isn't real there)
                      this.sendOrganize(card.id, targetSlot);
                      
                      // Force render immediately to update Ghost position visually
                      this.render();
                      return;
                  }
              }

              if (card && card.slot !== targetSlot) {
                  this.sendOrganize(card.id, targetSlot);
              }
          }
      }
  }

  private sendOrganize(cardId: string, targetSlot: string): void {
      networkManager.sendAction({
          playerId: this.survivor!.playerId,
          survivorId: this.survivor!.id,
          type: ActionType.ORGANIZE,
          payload: {
              cardId: cardId,
              targetSlot: targetSlot
          }
      });
  }

  public update(survivor: Survivor): void {
      if (!this.survivor || this.survivor.id !== survivor.id) return;
      if (!survivor.drawnCard) {
          this.hide();
          return;
      }

      this.survivor = survivor;
      this.myInventory = JSON.parse(JSON.stringify(survivor.inventory));
      // Keep ghostSlot as is
      
      this.render();
  }
}
