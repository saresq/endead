
import { Survivor, EquipmentCard, TradeSession, GameState } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';

export class TradeUI {
  private container: HTMLElement;
  
  // State
  private mySurvivor: Survivor | null = null;
  private partnerSurvivor: Survivor | null = null;
  private session: TradeSession | null = null;
  
  // Local modifications
  private myInventory: EquipmentCard[] = []; // Current layout of my items
  private myOffer: string[] = []; // IDs of items I am offering
  private partnerOffer: EquipmentCard[] = []; // Items partner is offering (Read Only)
  
  // Track where I want to put received items
  private receivedItemSlots: Record<string, string> = {}; // CardId -> SlotName

  private draggedItemId: string | null = null;
  private draggedFrom: 'inventory' | 'offer' | 'partner_offer' | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'trade-ui-container';
    this.container.className = 'modal-overlay';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  public sync(mySurvivor: Survivor, session: TradeSession, globalState: GameState): void {
    const isActive = mySurvivor.id === session.activeSurvivorId;
    const partnerId = isActive ? session.targetSurvivorId : session.activeSurvivorId;
    const partner = globalState.survivors[partnerId];

    // Check if state changed significantly to warrant re-init or just re-render
    // For MVP, we re-sync fully every update.
    this.mySurvivor = mySurvivor;
    this.partnerSurvivor = partner;
    this.session = session;

    // We only update local inventory from server if it's the FIRST sync or if we assume server is truth.
    // If we want real-time drag without jitter, we need to be careful.
    // But since `TRADE_OFFER` sends the offer list, and `ORGANIZE` is instant, 
    // we should trust `mySurvivor.inventory` from server.
    // The `session.offers` contains the IDs of offered cards.
    
    this.myInventory = JSON.parse(JSON.stringify(mySurvivor.inventory));
    
    const myOfferIds = session.offers[mySurvivor.id] || [];
    this.myOffer = [...myOfferIds]; // Clone mutable copy

    const partnerOfferIds = session.offers[partnerId] || [];
    // Find partner cards from their inventory
    this.partnerOffer = partner.inventory.filter(c => partnerOfferIds.includes(c.id));

    // Sync receive layout
    const myLayout = session.receiveLayouts?.[mySurvivor.id] || {};
    this.receivedItemSlots = { ...myLayout };

    // Clean up receivedItemSlots: remove items no longer in partner offer
    Object.keys(this.receivedItemSlots).forEach(id => {
        if (!partnerOfferIds.includes(id)) {
            delete this.receivedItemSlots[id];
        }
    });

    // Auto-Assign New Ghost Items
    this.partnerOffer.forEach(card => {
        if (!this.receivedItemSlots[card.id]) {
            // Find a slot
            const slots = ['HAND_1', 'HAND_2', 'BACKPACK'];
            let assigned = false;
            
            for (const slot of slots) {
                if (slot === 'BACKPACK') {
                    // Always valid unless backpack is visually full?
                    // Game logic allows 3 items.
                    // Check if current layout + existing items fills it up.
                    const existingBackpack = this.myInventory.filter(c => c.slot === 'BACKPACK' && !this.myOffer.includes(c.id)).length;
                    const ghostBackpack = Object.values(this.receivedItemSlots).filter(s => s === 'BACKPACK').length;
                    if ((existingBackpack + ghostBackpack) < 3) {
                        this.receivedItemSlots[card.id] = 'BACKPACK';
                        assigned = true;
                        break;
                    }
                } else {
                    const existing = this.myInventory.find(c => c.slot === slot && !this.myOffer.includes(c.id));
                    const ghost = Object.values(this.receivedItemSlots).includes(slot);
                    if (!existing && !ghost) {
                        this.receivedItemSlots[card.id] = slot;
                        assigned = true;
                        break;
                    }
                }
            }
            
            // If full, assign to DISCARD
            if (!assigned) {
                this.receivedItemSlots[card.id] = 'DISCARD';
            }
        }
    });

    this.container.style.display = 'flex';
    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.mySurvivor = null;
    this.partnerSurvivor = null;
    this.session = null;
  }

  private render(): void {
    if (!this.mySurvivor || !this.partnerSurvivor || !this.session) return;

    const myStatus = this.session.status[this.mySurvivor.id];
    const partnerStatus = this.session.status[this.partnerSurvivor.id];

    this.container.innerHTML = `
      <div class="modal trade-modal">
        <h2>Trading with ${this.partnerSurvivor.name}</h2>
        <div class="subtitle">You can rearrange your inventory for free</div>
        
        <div class="trade-workspace">
           <!-- My Inventory (Left) -->
           <div class="trade-panel my-inventory">
              <h3>My Inventory</h3>
              ${this.renderInventoryGrid(this.myInventory, this.myOffer)}
           </div>

           <!-- Trade Table (Center) -->
           <div class="trade-panel trade-table">
              <h3>Offers</h3>
              <div class="offer-box my-offer" data-drop="offer">
                 <h4>I Give:</h4>
                 <div class="offer-grid">
                    ${this.renderOfferList(this.myInventory, this.myOffer, true)}
                 </div>
              </div>
              
              <div class="exchange-icon">⇄</div>

               <div class="offer-box partner-offer">
                  <h4>${this.partnerSurvivor.name} Gives:</h4>
                  <div class="offer-grid">
                     ${this.renderCardList(this.partnerOffer, true)}
                  </div>
               </div>
            </div>
        </div>

        <div class="trade-footer">
           <div class="status-indicators">
              <div class="status ${myStatus ? 'ready' : ''}">Me: ${myStatus ? 'READY' : 'Not Ready'}</div>
              <div class="status ${partnerStatus ? 'ready' : ''}">${this.partnerSurvivor.name}: ${partnerStatus ? 'READY' : 'Not Ready'}</div>
           </div>
           
           <div class="button-group">
             <button id="btn-cancel-trade" class="secondary">Cancel Trade</button>
             <button id="btn-accept-trade" class="primary ${myStatus ? 'active' : ''}">${myStatus ? 'Unaccept' : 'Accept Trade'}</button>
           </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private renderInventoryGrid(inventory: EquipmentCard[], offeredIds: string[]): string {
      // Items I own that I am NOT offering
      const visibleItems = inventory.filter(c => !offeredIds.includes(c.id));
      
      // Items I am receiving that I have assigned a slot
      const ghostItems = this.partnerOffer.filter(c => this.receivedItemSlots[c.id]);

      // Helper to find item at slot (either owned or ghost)
      const getItemAtSlot = (slot: string, index?: number) => {
          // Check my inventory first
          let item = visibleItems.find(c => {
             if (c.slot === slot) {
                 // For BACKPACK, we need to handle index if multiple items?
                 // Current logic just filters by slot=BACKPACK.
                 // The game doesn't strictly track backpack index position in the model (just list order).
                 // But for UI slots [0,1,2], we just take the Nth item.
                 return true; 
             }
             return false;
          });
          
          if (slot === 'BACKPACK') {
              // Get all backpack items
              const backpackItems = visibleItems.filter(c => c.slot === 'BACKPACK');
              
              // Also get ghost items assigned to backpack? 
              // Wait, receivedItemSlots values are just slot names like 'HAND_1', 'BACKPACK'.
              // It doesn't track index.
              // So we just pool them.
              
              const allBackpack = [...backpackItems];
              // Add ghost items for backpack
              const ghostBackpack = ghostItems.filter(c => this.receivedItemSlots[c.id] === 'BACKPACK');
              
              // Combine
              const combined = [...allBackpack, ...ghostBackpack];
              return combined[index!] || null;
          }

          // For Hands
          if (item) return item;

          // Check for ghost item
          const ghost = ghostItems.find(c => this.receivedItemSlots[c.id] === slot);
          return ghost || null;
      };

      const hand1 = getItemAtSlot('HAND_1');
      const hand2 = getItemAtSlot('HAND_2');
      
      // For backpack, we need to be careful.
      // If I have 1 item in backpack, and I assign a ghost item to backpack.
      // The grid should show 2 items.
      const backpack0 = getItemAtSlot('BACKPACK', 0);
      const backpack1 = getItemAtSlot('BACKPACK', 1);
      const backpack2 = getItemAtSlot('BACKPACK', 2);
      
      const isGhost = (card: EquipmentCard | null) => {
          return !!(card && this.partnerOffer.some(p => p.id === card.id));
      };

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
              <div class="slot-label">Discard Zone (Drag here to remove)</div>
              ${this.renderDiscardList(visibleItems, ghostItems)}
           </div>
        </div>
      `;
  }

  private renderDiscardList(inventory: EquipmentCard[], ghostItems: EquipmentCard[]): string {
      const ownedDiscard = inventory.filter(c => c.slot === 'DISCARD');
      const ghostDiscard = ghostItems.filter(c => this.receivedItemSlots[c.id] === 'DISCARD');
      
      const all = [...ownedDiscard, ...ghostDiscard];
      
      const isGhost = (card: EquipmentCard) => {
          return !!(card && this.partnerOffer.some(p => p.id === card.id));
      };

      return all.map(c => this.renderCard(c, true, isGhost(c))).join('');
  }

  private renderOfferList(inventory: EquipmentCard[], offeredIds: string[], draggable: boolean): string {
      const offeredCards = inventory.filter(c => offeredIds.includes(c.id));
      return this.renderCardList(offeredCards, draggable);
  }

  private renderCardList(cards: EquipmentCard[], draggable: boolean): string {
      return cards.map(c => `
         <div class="offer-slot">
            ${this.renderCard(c, draggable, false)}
         </div>
      `).join('');
  }

  private renderCard(card: EquipmentCard | null | undefined, draggable: boolean, isGhost: boolean = false): string {
      if (!card) return '';
      return `
        <div class="trade-item ${isGhost ? 'ghost-item' : ''}" 
             draggable="${draggable}" 
             data-id="${card.id}"
             data-ghost="${isGhost}">
           <div class="item-name">${card.name}</div>
           <div class="item-type">${card.type}</div>
           ${isGhost ? '<div class="ghost-badge">GET</div>' : ''}
        </div>
      `;
  }

  private attachListeners(): void {
      this.container.querySelector('#btn-cancel-trade')?.addEventListener('click', () => {
          networkManager.sendAction({
              playerId: this.mySurvivor!.playerId,
              survivorId: this.mySurvivor!.id,
              type: ActionType.TRADE_CANCEL
          });
      });

      this.container.querySelector('#btn-accept-trade')?.addEventListener('click', () => {
          // Toggle accept
          // If already accepted, maybe sending OFFER update clears it? 
          // Or we need explicit unaccept?
          // The handler just sets status=true.
          // To unaccept, we can re-send the current offer (which resets status).
          
          if (this.session!.status[this.mySurvivor!.id]) {
              // Unaccept by resending offer (hacky but works with current logic)
              this.sendOfferUpdate();
          } else {
              networkManager.sendAction({
                  playerId: this.mySurvivor!.playerId,
                  survivorId: this.mySurvivor!.id,
                  type: ActionType.TRADE_ACCEPT,
                  payload: {
                      receiveLayout: this.receivedItemSlots
                  }
              });
          }
      });

      // Drag Logic
      const items = this.container.querySelectorAll('.trade-item[draggable="true"]');
      const slots = this.container.querySelectorAll('.slot, .offer-box[data-drop="offer"]');

      items.forEach(el => {
          el.addEventListener('dragstart', (e: any) => {
              this.draggedItemId = e.target.getAttribute('data-id');
              const isGhost = e.target.getAttribute('data-ghost') === 'true';
              
              // Determine source
              if (isGhost) {
                  this.draggedFrom = 'partner_offer';
              } else if (this.myOffer.includes(this.draggedItemId!)) {
                  this.draggedFrom = 'offer';
              } else if (this.partnerOffer.some(p => p.id === this.draggedItemId)) {
                  this.draggedFrom = 'partner_offer';
              } else {
                  this.draggedFrom = 'inventory';
              }
              e.dataTransfer.effectAllowed = 'move';
              setTimeout(() => e.target.classList.add('dragging'), 0);
          });
          el.addEventListener('dragend', (e: any) => {
              e.target.classList.remove('dragging');
              this.draggedItemId = null;
              this.draggedFrom = null;
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

      const dropType = targetEl.getAttribute('data-drop'); // 'inventory' or 'offer'
      const targetSlot = targetEl.getAttribute('data-slot'); // HAND_1, BACKPACK etc. (only if inventory)

      // 1. Move to Offer
      if (dropType === 'offer') {
          if (this.draggedFrom === 'partner_offer') return; // Cannot offer what you don't have yet

          if (!this.myOffer.includes(this.draggedItemId)) {
              this.myOffer.push(this.draggedItemId);
              this.sendOfferUpdate();
          }
          return;
      }

      // 2. Move to Inventory (or Reorganize)
      if (dropType === 'inventory') {
          // Identify if we are dropping onto an existing item to swap
          let victimId: string | null = null;
          if (targetSlot !== 'DISCARD') { // Don't swap if discarding
             const itemEl = targetEl.querySelector('.trade-item');
             if (itemEl) {
                 victimId = itemEl.getAttribute('data-id');
                 // If dropping onto itself, do nothing
                 if (victimId === this.draggedItemId) return;
             }
          }

          // Check if we need a Manual Swap (if Ghost items are involved)
          const isDraggedGhost = this.draggedFrom === 'partner_offer';
          const isVictimGhost = victimId ? Object.keys(this.receivedItemSlots).includes(victimId) : false;
          
          if (victimId && (isDraggedGhost || isVictimGhost)) {
              // We need to swap manually because Server won't handle Ghost items
              
              // 1. Determine Source Slot of Dragged Item
              let sourceSlot: string | null = null;
              if (isDraggedGhost) {
                  sourceSlot = this.receivedItemSlots[this.draggedItemId!] || null;
              } else {
                  const c = this.myInventory.find(i => i.id === this.draggedItemId);
                  sourceSlot = c && c.slot ? c.slot : null;
              }

              if (sourceSlot) {
                  // Remove from Offer if present (before moving)
                  if (this.myOffer.includes(this.draggedItemId)) {
                       this.myOffer = this.myOffer.filter(id => id !== this.draggedItemId);
                       this.sendOfferUpdate();
                  }

                  // 2. Move Victim to Source Slot
                  if (isVictimGhost) {
                      this.receivedItemSlots[victimId] = sourceSlot;
                  } else {
                      // Victim is Owned -> Send ORGANIZE
                      networkManager.sendAction({
                          playerId: this.mySurvivor!.playerId,
                          survivorId: this.mySurvivor!.id,
                          type: ActionType.ORGANIZE,
                          payload: { cardId: victimId, targetSlot: sourceSlot }
                      });
                  }

                  // 3. Move Dragged to Target Slot
                  if (isDraggedGhost) {
                      this.receivedItemSlots[this.draggedItemId] = targetSlot!; // targetSlot is safe due to drop logic
                  } else {
                      // Dragged is Owned -> Send ORGANIZE
                      networkManager.sendAction({
                          playerId: this.mySurvivor!.playerId,
                          survivorId: this.mySurvivor!.id,
                          type: ActionType.ORGANIZE,
                          payload: { cardId: this.draggedItemId, targetSlot: targetSlot! }
                      });
                  }
                  
                  this.render();
                  return;
              }
          }

          // Fallback to standard logic (Owned-vs-Owned OR Empty Slot OR Discard)

          // If came from Partner Offer, we are assigning a slot
          if (this.draggedFrom === 'partner_offer') {
               if (targetSlot) {
                   this.receivedItemSlots[this.draggedItemId] = targetSlot;
                   // Just re-render locally, will be sent on Accept
                   this.render(); 
               }
               return;
          }

          // If came from Offer, remove from Offer
          if (this.myOffer.includes(this.draggedItemId)) {
              this.myOffer = this.myOffer.filter(id => id !== this.draggedItemId);
              this.sendOfferUpdate();
              // We effectively "returned" it.
              // We ALSO need to set its slot if we dropped on a specific slot.
          }

          // Handle Slot Change (Reorganize)
          if (targetSlot) {
              const card = this.myInventory.find(c => c.id === this.draggedItemId);
              if (card && card.slot !== targetSlot) {
                  // Logic: Send ORGANIZE action.
                  networkManager.sendAction({
                      playerId: this.mySurvivor!.playerId,
                      survivorId: this.mySurvivor!.id,
                      type: ActionType.ORGANIZE,
                      payload: {
                          cardId: this.draggedItemId,
                          targetSlot: targetSlot
                      }
                  });
              }
          }
      }
  }

  private sendOfferUpdate(): void {
      networkManager.sendAction({
          playerId: this.mySurvivor!.playerId,
          survivorId: this.mySurvivor!.id,
          type: ActionType.TRADE_OFFER,
          payload: {
              offerCardIds: this.myOffer
          }
      });
  }
}
