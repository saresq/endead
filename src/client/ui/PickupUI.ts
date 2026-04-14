
import { Survivor, EquipmentCard } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlot } from './components/ItemCard';
import { icon } from './components/icons';
import { modalManager } from './overlays/ModalManager';

const ALL_SLOTS = ['HAND_1', 'HAND_2', 'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const;

export class PickupUI {
  private modalId: string | null = null;

  private survivor: Survivor | null = null;
  private newCard: EquipmentCard | null = null;
  private serverInventory: EquipmentCard[] = []; // Truth from server
  private localSlots: Map<string, string> = new Map(); // cardId → slot (local overrides)
  private ghostSlot: string | null = null; // Where the new card is placed locally

  // Tap-to-select state
  private tapSelectedId: string | null = null;
  private tapSelectedIsGhost: boolean = false;

  public get currentSurvivorId(): string | undefined {
    return this.survivor?.id;
  }

  public isVisible(): boolean {
    return !!this.modalId && modalManager.isOpen(this.modalId);
  }

  public show(survivor: Survivor): void {
    if (!survivor.drawnCard) return;
    this.survivor = survivor;
    this.newCard = survivor.drawnCard;
    this.serverInventory = JSON.parse(JSON.stringify(survivor.inventory));
    this.localSlots = new Map();
    this.ghostSlot = null;
    this.tapSelectedId = null;
    this.tapSelectedIsGhost = false;

    if (this.modalId) modalManager.close(this.modalId);

    this.modalId = modalManager.open({
      title: 'New Item Found!',
      subtitle: 'Tap an item to select it, then tap a slot to move it.',
      size: 'md',
      persistent: true,
      bodyClassName: 'modal__body--stack',
      renderBody: () => this.renderBody(),
      renderFooter: () => this.renderFooter(),
      onOpen: (el) => this.attachClickHandler(el, el),
    });
  }

  public hide(): void {
    if (this.modalId) {
      modalManager.close(this.modalId);
      this.modalId = null;
    }
    this.survivor = null;
    this.newCard = null;
    this.ghostSlot = null;
    this.localSlots = new Map();
    this.tapSelectedId = null;
    this.tapSelectedIsGhost = false;
  }

  public update(survivor: Survivor): void {
    if (!this.survivor || this.survivor.id !== survivor.id) return;
    if (!survivor.drawnCard) { this.hide(); return; }
    this.survivor = survivor;
    this.serverInventory = JSON.parse(JSON.stringify(survivor.inventory));
    this.rerender();
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

  private rerender(): void {
    if (!this.modalId) return;
    const hint = this.tapSelectedId
      ? 'Now tap a slot to place the item there.'
      : 'Tap an item to select it, then tap a slot to move it.';
    modalManager.updateSubtitle(this.modalId, hint);
    modalManager.updateBody(this.modalId, this.renderBody());
    modalManager.updateFooter(this.modalId, this.renderFooter());
    this.attachTapListeners();
  }

  private renderBody(): string {
    if (!this.survivor || !this.newCard) return '';

    const newCardIsSelected = this.tapSelectedIsGhost && this.tapSelectedId === this.newCard.id;
    const isTargetForUnplace = this.tapSelectedId && !newCardIsSelected && this.ghostSlot;
    const featuredCard = renderItemCard(this.newCard, {
      variant: 'featured',
      badge: this.ghostSlot ? 'PLACED' : 'NEW',
      tappable: true,
      showSlot: false,
      placed: !!this.ghostSlot,
    });

    return `
      <div class="pickup-hero ${this.ghostSlot ? 'pickup-hero--placed' : ''} ${newCardIsSelected ? 'tap-selected' : ''} ${isTargetForUnplace ? 'tap-target' : ''}" data-tap-item="${this.newCard.id}" data-tap-ghost="true" data-tap-slot="UNPLACE">
        ${featuredCard}
      </div>

      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Backpack', 'sm')} Your Equipment</div>
        <div class="slot-row slot-row--hands">
          ${this.renderSlot('HAND_1', 'Hand 1')}
          ${this.renderSlot('HAND_2', 'Hand 2')}
        </div>
        <div class="slot-row slot-row--backpack">
          ${this.renderSlot('BACKPACK_0')}
          ${this.renderSlot('BACKPACK_1')}
          ${this.renderSlot('BACKPACK_2')}
        </div>
      </div>

      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Trash2', 'sm')} Discard</div>
        <div class="discard-zone ${this.tapSelectedId && !(this.tapSelectedIsGhost && this.ghostSlot === 'DISCARD') ? 'tap-target' : ''}" data-tap-slot="DISCARD">
          ${this.renderDiscardItems()}
        </div>
      </div>`;
  }

  private renderFooter(): string {
    return `
      <span class="trade-footer__hint">Tap to select, then tap a slot to place.</span>
      <div class="trade-footer__actions">
        ${renderButton({ label: 'Skip Item', icon: 'X', variant: 'ghost', size: 'sm', dataAction: 'discard-new' })}
        ${renderButton({ label: 'Confirm', icon: 'Check', variant: 'primary', size: 'sm', disabled: !this.ghostSlot, dataAction: 'confirm-pickup' })}
      </div>`;
  }

  private renderSlot(slot: string, label?: string): string {
    const isGhostHere = this.ghostSlot === slot;
    const ownedItem = this.findOccupant(slot);
    const displayItem = isGhostHere ? this.newCard : ownedItem;
    const isItemSelected = displayItem && this.tapSelectedId === displayItem.id;
    const isTargetable = this.tapSelectedId && !isItemSelected;
    const slotClass = [
      'inv-slot',
      isGhostHere ? 'inv-slot--ghost' : displayItem ? 'inv-slot--filled' : '',
      isItemSelected ? 'tap-selected' : '',
      isTargetable ? 'tap-target' : '',
    ].filter(Boolean).join(' ');
    const labelHtml = label ? `<span class="inv-slot__label">${label}</span>` : '';

    const tapAttrs = displayItem
      ? `data-tap-item="${displayItem.id}" data-tap-ghost="${isGhostHere}"`
      : '';

    const content = displayItem
      ? renderItemCard(displayItem, { variant: isGhostHere ? 'ghost' : 'default', badge: isGhostHere ? 'NEW' : undefined, tappable: true, showSlot: false })
      : renderEmptySlot();

    return `
      <div class="${slotClass}" data-tap-slot="${slot}" ${tapAttrs}>
        ${labelHtml}
        ${content}
      </div>`;
  }

  private renderDiscardItems(): string {
    const inv = this.getVirtualInventory();
    const discarded = inv.filter(c => c.slot === 'DISCARD');
    const isSelected = (id: string) => this.tapSelectedId === id;
    const items: string[] = discarded.map(c => {
      const selected = isSelected(c.id);
      return `<div class="discard-item ${selected ? 'tap-selected' : ''}" data-tap-item="${c.id}" data-tap-ghost="false" data-tap-slot="DISCARD">${renderItemCard(c, { tappable: true, showSlot: false, discarded: true })}</div>`;
    });
    if (this.ghostSlot === 'DISCARD') {
      const selected = isSelected(this.newCard!.id) && this.tapSelectedIsGhost;
      items.push(`<div class="discard-item ${selected ? 'tap-selected' : ''}" data-tap-item="${this.newCard!.id}" data-tap-ghost="true" data-tap-slot="DISCARD">${renderItemCard(this.newCard!, { variant: 'ghost', tappable: true, showSlot: false, discarded: true })}</div>`);
    }
    return items.length > 0 ? items.join('') : renderEmptySlot();
  }

  // ─── Event Handling ──────────────────────────────────────────

  /** Attach persistent click handler for action buttons (once on modal open). */
  private attachClickHandler(el: HTMLElement, directEl?: HTMLElement): void {
    el.addEventListener('click', (e) => {
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
          onOpen: (confirmEl) => {
            confirmEl.addEventListener('click', (ev) => {
              if ((ev.target as HTMLElement).closest('[data-action="confirm-skip"]')) {
                modalManager.close();
                networkManager.sendAction({ playerId: survivor.playerId, survivorId: survivor.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'DISCARD' } });
              }
            });
          },
        });
      }

      if (target.dataset.action === 'confirm-pickup' && this.ghostSlot) {
        for (const [cardId, slot] of this.localSlots) {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.ORGANIZE, payload: { cardId, targetSlot: slot } });
        }
        if (this.ghostSlot === 'DISCARD') {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'DISCARD' } });
        } else {
          networkManager.sendAction({ playerId: this.survivor!.playerId, survivorId: this.survivor!.id, type: ActionType.RESOLVE_SEARCH, payload: { action: 'EQUIP', targetSlot: this.ghostSlot } });
        }
      }
    });

    this.attachTapListeners(directEl);
  }

  /** Attach tap-to-select listeners to current DOM (called after each render). */
  private attachTapListeners(directEl?: HTMLElement): void {
    const el = directEl ?? (this.modalId ? modalManager.getElement(this.modalId) : null);
    if (!el) return;

    el.querySelectorAll('[data-tap-item], [data-tap-slot]').forEach(tapEl => {
      tapEl.addEventListener('click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        // Don't handle taps on action buttons
        if ((e.target as HTMLElement).closest('[data-action]')) return;

        // Stop bubbling so a parent [data-tap-slot] doesn't also fire
        e.stopPropagation();

        const tapItemId = target.dataset.tapItem;
        const tapSlot = target.dataset.tapSlot;
        const isGhost = target.dataset.tapGhost === 'true';

        // Phase 1: Item tapped — select it
        if (tapItemId && !this.tapSelectedId) {
          this.tapSelectedId = tapItemId;
          this.tapSelectedIsGhost = isGhost;
          this.rerender();
          return;
        }

        // Tapping same item — deselect
        if (tapItemId && this.tapSelectedId === tapItemId) {
          this.tapSelectedId = null;
          this.tapSelectedIsGhost = false;
          this.rerender();
          return;
        }

        // Phase 2: Slot tapped while item is selected — move to that slot
        if (this.tapSelectedId && tapSlot) {
          const selId = this.tapSelectedId;
          const selGhost = this.tapSelectedIsGhost;
          this.tapSelectedId = null;
          this.tapSelectedIsGhost = false;
          this.handleMove(tapSlot, selId, selGhost);
          return;
        }

        // Tapping a different item while one is selected — switch selection
        if (tapItemId && this.tapSelectedId && tapItemId !== this.tapSelectedId) {
          this.tapSelectedId = tapItemId;
          this.tapSelectedIsGhost = isGhost;
          this.rerender();
          return;
        }
      });
    });
  }

  /** Move the currently selected item to the target slot. */
  private handleMove(targetSlot: string, passedId?: string, passedGhost?: boolean): void {
    const selectedId = passedId ?? this.tapSelectedId;
    const selectedIsGhost = passedGhost ?? this.tapSelectedIsGhost;
    if (!selectedId) return;

    // ── Unplace: move ghost back to featured area ──
    if (targetSlot === 'UNPLACE') {
      if (selectedIsGhost) { this.ghostSlot = null; }
      this.rerender();
      return;
    }

    const occupant = this.findOccupant(targetSlot);

    // ── Ghost (new item) move ──
    if (selectedIsGhost) {
      if (targetSlot === 'DISCARD') { this.ghostSlot = 'DISCARD'; this.rerender(); return; }

      if (occupant) {
        if (this.ghostSlot && this.ghostSlot !== 'DISCARD') {
          this.localSlots.set(occupant.id, this.ghostSlot);
        } else {
          this.localSlots.set(occupant.id, 'DISCARD');
        }
      }

      this.ghostSlot = targetSlot;
      this.rerender();
      return;
    }

    // ── Existing item move ──
    const inv = this.getVirtualInventory();
    const card = inv.find(c => c.id === selectedId);
    if (!card) return;

    const cardSlot = this.getEffectiveSlot(card);
    if (cardSlot === targetSlot) return;

    // Moving onto ghost's slot → swap card and ghost
    if (this.ghostSlot === targetSlot) {
      this.ghostSlot = cardSlot;
      this.localSlots.set(card.id, targetSlot);
      this.rerender();
      return;
    }

    // Swap with occupant (if any)
    if (occupant && occupant.id !== card.id) {
      this.localSlots.set(occupant.id, cardSlot);
    }

    this.localSlots.set(card.id, targetSlot);
    this.rerender();
  }
}
