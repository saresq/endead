
import { Survivor, EquipmentCard, TradeSession, GameState } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlot } from './components/ItemCard';
import { icon } from './components/icons';
import { modalManager } from './overlays/ModalManager';

export class TradeUI {
  private modalId: string | null = null;

  private mySurvivor: Survivor | null = null;
  private partnerSurvivor: Survivor | null = null;
  private session: TradeSession | null = null;

  private myInventory: EquipmentCard[] = [];
  private myOffer: string[] = [];
  private partnerOffer: EquipmentCard[] = [];
  private receivedItemSlots: Record<string, string> = {};

  private draggedItemId: string | null = null;
  private draggedFrom: 'inventory' | 'offer' | 'partner_offer' | null = null;

  /** AbortController for per-render drag/drop listeners */
  private listenerAc: AbortController | null = null;

  public sync(mySurvivor: Survivor, session: TradeSession, globalState: GameState): void {
    const isActive = mySurvivor.id === session.activeSurvivorId;
    const partnerId = isActive ? session.targetSurvivorId : session.activeSurvivorId;
    const partner = globalState.survivors[partnerId];

    this.mySurvivor = mySurvivor;
    this.partnerSurvivor = partner;
    this.session = session;
    this.myInventory = JSON.parse(JSON.stringify(mySurvivor.inventory));

    const myOfferIds = session.offers[mySurvivor.id] || [];
    this.myOffer = [...myOfferIds];

    const partnerOfferIds = session.offers[partnerId] || [];
    this.partnerOffer = partner.inventory.filter(c => partnerOfferIds.includes(c.id));

    const myLayout = session.receiveLayouts?.[mySurvivor.id] || {};
    this.receivedItemSlots = { ...myLayout };

    // Clean stale entries
    Object.keys(this.receivedItemSlots).forEach(id => {
      if (!partnerOfferIds.includes(id)) delete this.receivedItemSlots[id];
    });

    // Auto-assign new ghost items to available slots
    const allSlots = ['HAND_1', 'HAND_2', 'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const;
    this.partnerOffer.forEach(card => {
      if (this.receivedItemSlots[card.id]) return;
      for (const slot of allSlots) {
        const existing = this.myInventory.find(c => c.slot === slot && !this.myOffer.includes(c.id));
        const ghost = Object.values(this.receivedItemSlots).includes(slot);
        if (!existing && !ghost) { this.receivedItemSlots[card.id] = slot; return; }
      }
      this.receivedItemSlots[card.id] = 'DISCARD';
    });

    if (!this.modalId) {
      this.modalId = modalManager.open({
        title: `Trading with ${this.partnerSurvivor.name}`,
        size: 'lg',
        persistent: true,
        className: 'trade-modal--wide',
        renderBody: () => this.renderBody(),
        renderFooter: () => this.renderFooter(),
        onOpen: (el) => this.attachClickListener(el),
      });
    } else {
      this.updateModalContent();
    }
  }

  public hide(): void {
    this.abortListeners();
    if (this.modalId) {
      modalManager.close(this.modalId);
      this.modalId = null;
    }
    this.mySurvivor = null;
    this.partnerSurvivor = null;
    this.session = null;
  }

  // ─── Rendering ───────────────────────────────────────────────

  private updateModalContent(): void {
    if (!this.modalId) return;
    // Skip DOM replacement while a drag is in progress — the innerHTML
    // swap destroys the dragged element and cancels the browser's DnD operation.
    if (this.draggedItemId) return;
    modalManager.updateBody(this.modalId, this.renderBody());
    modalManager.updateFooter(this.modalId, this.renderFooter());
    this.attachDragListeners();
  }

  private renderBody(): string {
    if (!this.mySurvivor || !this.partnerSurvivor || !this.session) return '';

    const myStatus = this.session.status[this.mySurvivor.id];
    const partnerStatus = this.session.status[this.partnerSurvivor.id];

    return `
      <div class="trade-modal__subtitle">Drag items to the offer zone. Rearrange your inventory for free.</div>
      <div class="trade-columns">
        <div class="trade-column">
          <div class="trade-section__label">My Inventory</div>
          ${this.renderMyInventory()}
        </div>

        <div class="trade-column">
          <div class="trade-section__label">Offers</div>
          ${this.renderOfferZone(myStatus, partnerStatus)}
        </div>
      </div>`;
  }

  private renderFooter(): string {
    if (!this.mySurvivor || !this.partnerSurvivor || !this.session) return '';

    const myStatus = this.session.status[this.mySurvivor.id];
    const partnerStatus = this.session.status[this.partnerSurvivor.id];

    return `
      <div class="trade-status">
        <span class="trade-status__item ${myStatus ? 'trade-status__item--ready' : ''}">Me: ${myStatus ? 'Ready' : 'Not Ready'}</span>
        <span class="trade-status__item ${partnerStatus ? 'trade-status__item--ready' : ''}">${this.partnerSurvivor.name}: ${partnerStatus ? 'Ready' : 'Not Ready'}</span>
      </div>
      <div class="trade-modal__footer-actions">
        ${renderButton({ label: 'Cancel', icon: 'X', variant: 'secondary', size: 'sm', dataAction: 'cancel-trade' })}
        ${renderButton({ label: myStatus ? 'Unaccept' : 'Accept', icon: myStatus ? 'X' : 'Check', variant: myStatus ? 'secondary' : 'primary', size: 'sm', dataAction: 'accept-trade' })}
      </div>`;
  }

  private renderMyInventory(): string {
    const visibleItems = this.myInventory.filter(c => !this.myOffer.includes(c.id));
    const ghostItems = this.partnerOffer.filter(c => this.receivedItemSlots[c.id]);

    const getItem = (slot: string): { card: EquipmentCard | null; ghost: boolean } => {
      const owned = visibleItems.find(c => c.slot === slot);
      if (owned) return { card: owned, ghost: false };
      const ghost = ghostItems.find(c => this.receivedItemSlots[c.id] === slot);
      return { card: ghost || null, ghost: !!ghost };
    };

    const hand1 = getItem('HAND_1');
    const hand2 = getItem('HAND_2');
    const bp0 = getItem('BACKPACK_0');
    const bp1 = getItem('BACKPACK_1');
    const bp2 = getItem('BACKPACK_2');

    const renderSlot = (data: { card: EquipmentCard | null; ghost: boolean }, slot: string, label?: string) => {
      const cls = data.ghost ? 'trade-slot trade-slot--ghost' : data.card ? 'trade-slot trade-slot--filled' : 'trade-slot';
      const labelHtml = label ? `<span class="trade-slot__label">${label}</span>` : '';
      const content = data.card
        ? renderItemCard(data.card, { variant: data.ghost ? 'ghost' : 'default', badge: data.ghost ? 'GET' : undefined, draggable: true, showSlot: false })
        : renderEmptySlot();
      return `<div class="${cls}" data-slot="${slot}" data-drop="inventory">${labelHtml}${content}</div>`;
    };

    const discarded = visibleItems.filter(c => c.slot === 'DISCARD');
    const ghostDiscarded = ghostItems.filter(c => this.receivedItemSlots[c.id] === 'DISCARD');
    const discardContent = [...discarded, ...ghostDiscarded].map(c => {
      const isG = ghostItems.some(g => g.id === c.id);
      return renderItemCard(c, { variant: isG ? 'ghost' : 'default', badge: isG ? 'GET' : undefined, draggable: true, showSlot: false, discarded: true });
    }).join('');

    return `
      <div class="trade-slots">
        <div class="trade-slot-row">
          ${renderSlot(hand1, 'HAND_1', 'Hand 1')}
          ${renderSlot(hand2, 'HAND_2', 'Hand 2')}
        </div>
        <div class="trade-backpack-row">
          ${renderSlot(bp0, 'BACKPACK_0')}
          ${renderSlot(bp1, 'BACKPACK_1')}
          ${renderSlot(bp2, 'BACKPACK_2')}
        </div>
        <div>
          <div class="trade-section__label">${icon('X', 'sm')} Drop here to remove</div>
          <div class="trade-discard" data-slot="DISCARD" data-drop="inventory">
            ${discardContent || renderEmptySlot()}
          </div>
        </div>
      </div>`;
  }

  private renderOfferZone(myStatus: boolean, partnerStatus: boolean): string {
    const myOfferCards = this.myOffer.map(id => {
      const card = this.myInventory.find(c => c.id === id);
      if (!card) return '';
      return renderItemCard(card, { draggable: true, showSlot: false });
    }).join('');

    const partnerOfferCards = this.partnerOffer.map(card =>
      renderItemCard(card, { variant: 'ghost', draggable: true, showSlot: false })
    ).join('');

    return `
      <div class="trade-offer-box" data-drop="offer">
        <div class="trade-offer-box__title">I Give</div>
        <div class="trade-offer-box__items">${myOfferCards || '<span class="text-placeholder">Drag items here to offer</span>'}</div>
      </div>

      <div class="trade-exchange-arrow">&darr; &uarr;</div>

      <div class="trade-offer-box">
        <div class="trade-offer-box__title">${this.partnerSurvivor!.name} Gives</div>
        <div class="trade-offer-box__items">${partnerOfferCards || '<span class="text-placeholder">Nothing offered yet</span>'}</div>
      </div>`;
  }

  // ─── Event Handling ──────────────────────────────────────────

  /** Attach click listener once when the modal opens. */
  private attachClickListener(el: HTMLElement): void {
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;

      if (target.dataset.action === 'cancel-trade') {
        networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.TRADE_CANCEL });
      }
      if (target.dataset.action === 'accept-trade') {
        if (this.session!.status[this.mySurvivor!.id]) {
          this.sendOfferUpdate();
        } else {
          networkManager.sendAction({
            playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id,
            type: ActionType.TRADE_ACCEPT, payload: { receiveLayout: this.receivedItemSlots },
          });
        }
      }
    });

    this.attachDragListeners();
  }

  /** Abort previous drag/drop listeners and attach fresh ones. */
  private abortListeners(): void {
    this.listenerAc?.abort();
    this.listenerAc = null;
  }

  private attachDragListeners(): void {
    this.abortListeners();

    const el = this.modalId ? modalManager.getElement(this.modalId) : null;
    if (!el) return;

    this.listenerAc = new AbortController();
    const signal = this.listenerAc.signal;

    const draggables = el.querySelectorAll('[draggable="true"]');
    const dropTargets = el.querySelectorAll('[data-drop]');

    draggables.forEach(item => {
      item.addEventListener('dragstart', (e: any) => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        this.draggedItemId = card.getAttribute('data-id');
        const isGhost = card.getAttribute('data-ghost') === 'true';
        if (isGhost) { this.draggedFrom = 'partner_offer'; }
        else if (this.myOffer.includes(this.draggedItemId!)) { this.draggedFrom = 'offer'; }
        else { this.draggedFrom = 'inventory'; }
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => card.classList.add('dragging'), 0);
      }, { signal });
      item.addEventListener('dragend', (e: any) => {
        const card = e.target.closest('[data-id]');
        card?.classList.remove('dragging');
        this.draggedItemId = null;
        this.draggedFrom = null;
      }, { signal });
    });

    dropTargets.forEach(dt => {
      dt.addEventListener('dragover', (e: any) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dt.classList.add('drag-over'); }, { signal });
      dt.addEventListener('dragleave', () => dt.classList.remove('drag-over'), { signal });
      dt.addEventListener('drop', (e: any) => { e.preventDefault(); dt.classList.remove('drag-over'); this.handleDrop(dt); }, { signal });
    });
  }

  /** Schedule a re-render after the browser finishes its DnD lifecycle (dragend). */
  private scheduleRender(): void {
    // Use setTimeout(0) so the browser fires dragend and cleans up its
    // internal DnD state before we replace the DOM and re-attach listeners.
    setTimeout(() => this.updateModalContent(), 0);
  }

  private handleDrop(targetEl: Element): void {
    if (!this.draggedItemId) return;

    const dropType = targetEl.getAttribute('data-drop');
    const targetSlot = targetEl.getAttribute('data-slot');

    const draggedId = this.draggedItemId;
    const draggedFrom = this.draggedFrom;

    // Drop into offer zone
    if (dropType === 'offer') {
      if (draggedFrom === 'partner_offer') return;
      if (!this.myOffer.includes(draggedId)) {
        this.myOffer.push(draggedId);
        this.sendOfferUpdate();
        this.scheduleRender();
      }
      return;
    }

    if (dropType !== 'inventory' || !targetSlot) return;

    // Find what's in the target slot
    let victimId: string | null = null;
    if (targetSlot !== 'DISCARD') {
      const itemEl = targetEl.querySelector('.item-card[data-id]');
      if (itemEl) {
        victimId = itemEl.getAttribute('data-id');
        if (victimId === draggedId) return;
      }
    }

    const isDraggedGhost = draggedFrom === 'partner_offer';
    const isVictimGhost = victimId ? Object.keys(this.receivedItemSlots).includes(victimId) : false;

    // Swap logic when ghost items are involved
    if (victimId && (isDraggedGhost || isVictimGhost)) {
      let sourceSlot: string | null = null;
      if (isDraggedGhost) { sourceSlot = this.receivedItemSlots[draggedId] || null; }
      else { sourceSlot = this.myInventory.find(i => i.id === draggedId)?.slot ?? null; }

      if (sourceSlot) {
        if (this.myOffer.includes(draggedId)) {
          this.myOffer = this.myOffer.filter(id => id !== draggedId);
          this.sendOfferUpdate();
        }
        if (isVictimGhost) { this.receivedItemSlots[victimId] = sourceSlot; }
        else { networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: victimId, targetSlot: sourceSlot } }); }
        if (isDraggedGhost) { this.receivedItemSlots[draggedId] = targetSlot!; }
        else { networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: draggedId, targetSlot: targetSlot! } }); }
        this.scheduleRender();
        return;
      }
    }

    // Assigning partner offer item to a slot
    if (draggedFrom === 'partner_offer' && targetSlot) {
      this.receivedItemSlots[draggedId] = targetSlot;
      this.scheduleRender();
      return;
    }

    // Returning from offer
    if (this.myOffer.includes(draggedId)) {
      this.myOffer = this.myOffer.filter(id => id !== draggedId);
      this.sendOfferUpdate();
      this.scheduleRender();
      return;
    }

    // Reorganize — optimistically swap in local inventory
    if (targetSlot) {
      const card = this.myInventory.find(c => c.id === draggedId);
      if (card && card.slot !== targetSlot) {
        const occupant = this.myInventory.find(c => c.slot === targetSlot && c.id !== draggedId);
        if (occupant) {
          occupant.slot = card.slot;
          occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
        }
        card.slot = targetSlot as any;
        card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');

        networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: draggedId, targetSlot } });
        this.scheduleRender();
      }
    }
  }

  private sendOfferUpdate(): void {
    networkManager.sendAction({
      playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id,
      type: ActionType.TRADE_OFFER, payload: { offerCardIds: this.myOffer },
    });
  }
}
