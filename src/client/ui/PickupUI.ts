
import { Survivor, EquipmentCard } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlot } from './components/ItemCard';
import { icon } from './components/icons';
import { modalManager } from './overlays/ModalManager';

const ALL_SLOTS = ['HAND_1', 'HAND_2', 'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const;

export class PickupUI {
  private container: HTMLElement;

  private survivor: Survivor | null = null;
  private newCard: EquipmentCard | null = null;
  private serverInventory: EquipmentCard[] = []; // Truth from server
  private localSlots: Map<string, string> = new Map(); // cardId → slot (local overrides)
  private ghostSlot: string | null = null; // Where the new card is placed locally

  private draggedItemId: string | null = null;
  private draggedIsGhost: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'pickup-ui-container';
    this.container.className = 'trade-overlay';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);

    // Attach click listener once on the persistent container (not per-render)
    this.container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;

      if (target.dataset.action === 'discard-new') {
        const survivor = this.survivor!;
        modalManager.open({
          title: 'Skip Item?',
          size: 'sm',
          renderBody: () => '<p class="text-secondary">This item will be discarded.</p>',
          renderFooter: () => `
            ${renderButton({ label: 'Keep', variant: 'secondary', dataAction: 'modal-close' })}
            ${renderButton({ label: 'Skip', variant: 'destructive', dataAction: 'confirm-skip' })}
          `,
          onOpen: (el) => {
            el.addEventListener('click', (ev) => {
              if ((ev.target as HTMLElement).closest('[data-action="confirm-skip"]')) {
                modalManager.close();
                networkManager.sendAction({ playerId: survivor.playerId, survivorId: survivor.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'DISCARD' } });
              }
            });
          },
        });
      }

      if (target.dataset.action === 'confirm-pickup' && this.ghostSlot) {
        // Commit all local moves to server first
        for (const [cardId, slot] of this.localSlots) {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.ORGANIZE, payload: { cardId, targetSlot: slot } });
        }
        // Equip or discard the new item
        if (this.ghostSlot === 'DISCARD') {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'DISCARD' } });
        } else {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'EQUIP', targetSlot: this.ghostSlot } });
        }
      }
    });
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
    this.serverInventory = JSON.parse(JSON.stringify(survivor.inventory));
    this.localSlots = new Map();
    this.ghostSlot = null;
    this.container.style.display = 'flex';
    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.survivor = null;
    this.newCard = null;
    this.ghostSlot = null;
    this.localSlots = new Map();
  }

  public update(survivor: Survivor): void {
    if (!this.survivor || this.survivor.id !== survivor.id) return;
    if (!survivor.drawnCard) { this.hide(); return; }
    this.survivor = survivor;
    this.serverInventory = JSON.parse(JSON.stringify(survivor.inventory));
    this.render();
  }

  /** Returns the effective slot for an item, considering local overrides. */
  private getEffectiveSlot(card: EquipmentCard): string {
    return this.localSlots.get(card.id) ?? card.slot ?? 'BACKPACK_0';
  }

  /** Returns the virtual inventory with local moves applied. */
  private getVirtualInventory(): EquipmentCard[] {
    return this.serverInventory.map(c => ({
      ...c,
      slot: this.getEffectiveSlot(c) as EquipmentCard['slot'],
    }));
  }

  /** Find the existing (non-ghost) item at a given slot. */
  private findOccupant(slot: string): EquipmentCard | null {
    if (slot === 'DISCARD') return null;
    return this.getVirtualInventory().find(c => c.slot === slot) ?? null;
  }

  // ─── Rendering ───────────────────────────────────────────────

  private render(): void {
    if (!this.survivor || !this.newCard) return;

    const featuredCard = renderItemCard(this.newCard, {
      variant: 'featured',
      badge: this.ghostSlot ? 'PLACED' : 'NEW',
      draggable: true,
      showSlot: false,
      placed: !!this.ghostSlot,
    });

    this.container.innerHTML = `
      <div class="trade-modal">
        <div class="trade-modal__header">
          <h2 class="trade-modal__title">New Item Found!</h2>
          <div class="trade-modal__subtitle">Drag the item to an inventory slot, or rearrange your gear.</div>
        </div>

        <div class="trade-modal__body">
          <div data-drop="new-item-area">
            ${featuredCard}
          </div>

          <div>
            <div class="trade-section__label">Hands</div>
            <div class="trade-slot-row">
              ${this.renderSlot('HAND_1', 'Hand 1')}
              ${this.renderSlot('HAND_2', 'Hand 2')}
            </div>
          </div>

          <div>
            <div class="trade-section__label">Backpack</div>
            <div class="trade-backpack-row">
              ${this.renderSlot('BACKPACK_0')}
              ${this.renderSlot('BACKPACK_1')}
              ${this.renderSlot('BACKPACK_2')}
            </div>
          </div>

          <div>
            <div class="trade-section__label">${icon('X', 'sm')} Drop here to remove</div>
            <div class="trade-discard" data-slot="DISCARD" data-drop="inventory">
              ${this.renderDiscardItems()}
            </div>
          </div>
        </div>

        <div class="trade-modal__footer">
          <span class="trade-modal__footer-hint">Drag items between slots to rearrange</span>
          <div class="trade-modal__footer-actions">
            ${renderButton({ label: 'Skip Item', icon: 'X', variant: 'ghost', size: 'sm', dataAction: 'discard-new' })}
            ${renderButton({ label: 'Confirm', icon: 'Check', variant: 'primary', size: 'sm', disabled: !this.ghostSlot, dataAction: 'confirm-pickup' })}
          </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private renderSlot(slot: string, label?: string): string {
    const isGhostHere = this.ghostSlot === slot;
    const ownedItem = this.findOccupant(slot);
    const displayItem = isGhostHere ? this.newCard : ownedItem;
    const filled = !!displayItem;
    const slotClass = isGhostHere ? 'trade-slot trade-slot--ghost' : filled ? 'trade-slot trade-slot--filled' : 'trade-slot';
    const labelHtml = label ? `<span class="trade-slot__label">${label}</span>` : '';

    const content = displayItem
      ? renderItemCard(displayItem, { variant: isGhostHere ? 'ghost' : 'default', badge: isGhostHere ? 'NEW' : undefined, draggable: true, showSlot: false })
      : renderEmptySlot();

    return `
      <div class="${slotClass}" data-slot="${slot}" data-drop="inventory">
        ${labelHtml}
        ${content}
      </div>`;
  }

  private renderDiscardItems(): string {
    const inv = this.getVirtualInventory();
    const discarded = inv.filter(c => c.slot === 'DISCARD');
    const items: string[] = discarded.map(c => renderItemCard(c, { draggable: true, showSlot: false, discarded: true }));
    if (this.ghostSlot === 'DISCARD') {
      items.push(renderItemCard(this.newCard!, { variant: 'ghost', draggable: true, showSlot: false, discarded: true }));
    }
    return items.length > 0 ? items.join('') : renderEmptySlot();
  }

  // ─── Event Handling ──────────────────────────────────────────

  private attachListeners(): void {
    const draggables = this.container.querySelectorAll('[draggable="true"]');
    const dropTargets = this.container.querySelectorAll('[data-drop]');

    draggables.forEach(el => {
      el.addEventListener('dragstart', (e: any) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        this.draggedItemId = item.getAttribute('data-id');
        this.draggedIsGhost = item.getAttribute('data-ghost') === 'true';
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => item.classList.add('dragging'), 0);
      });
      el.addEventListener('dragend', (e: any) => {
        const item = e.target.closest('[data-id]');
        item?.classList.remove('dragging');
        this.draggedItemId = null;
        this.draggedIsGhost = false;
      });
    });

    dropTargets.forEach(el => {
      el.addEventListener('dragover', (e: any) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e: any) => { e.preventDefault(); el.classList.remove('drag-over'); this.handleDrop(el); });
    });
  }

  private handleDrop(targetEl: Element): void {
    if (!this.draggedItemId) return;
    const dropType = targetEl.getAttribute('data-drop');
    const targetSlot = targetEl.getAttribute('data-slot');

    // ── Drop ghost back to featured area → unplace ──
    if (dropType === 'new-item-area') {
      if (this.draggedIsGhost) { this.ghostSlot = null; this.render(); }
      return;
    }
    if (dropType !== 'inventory' || !targetSlot) return;

    const occupant = this.findOccupant(targetSlot);

    // ════════════════════════════════════════════════
    //  GHOST (new item) drag
    // ════════════════════════════════════════════════
    if (this.draggedIsGhost) {
      if (targetSlot === 'DISCARD') { this.ghostSlot = 'DISCARD'; this.render(); return; }

      // If occupied, displace the occupant
      if (occupant) {
        if (this.ghostSlot && this.ghostSlot !== 'DISCARD') {
          // Ghost was placed somewhere — occupant takes ghost's old slot
          this.localSlots.set(occupant.id, this.ghostSlot);
        } else {
          // Ghost wasn't placed yet — occupant goes to discard
          this.localSlots.set(occupant.id, 'DISCARD');
        }
      }

      this.ghostSlot = targetSlot;
      this.render();
      return;
    }

    // ════════════════════════════════════════════════
    //  EXISTING item drag
    // ════════════════════════════════════════════════
    const inv = this.getVirtualInventory();
    const card = inv.find(c => c.id === this.draggedItemId);
    if (!card) return;

    const cardSlot = this.getEffectiveSlot(card);

    // Same slot — no-op
    if (cardSlot === targetSlot) return;

    // Dropping onto ghost's slot → swap card and ghost
    if (this.ghostSlot === targetSlot) {
      this.ghostSlot = cardSlot;
      this.localSlots.set(card.id, targetSlot);
      this.render();
      return;
    }

    // Swap with occupant (if any)
    if (occupant && occupant.id !== card.id) {
      this.localSlots.set(occupant.id, cardSlot);
    }

    this.localSlots.set(card.id, targetSlot);
    this.render();
  }
}
