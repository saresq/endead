
import { Survivor, EquipmentCard, TradeSession, GameState } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlot } from './components/ItemCard';
import { icon } from './components/icons';
import { modalManager } from './overlays/ModalManager';

// Icons used: Backpack, ArrowLeftRight, Trash2

export class TradeUI {
  private modalId: string | null = null;

  private mySurvivor: Survivor | null = null;
  private partnerSurvivor: Survivor | null = null;
  private session: TradeSession | null = null;

  private myInventory: EquipmentCard[] = [];
  private myOffer: string[] = [];
  private partnerOffer: EquipmentCard[] = [];
  private receivedItemSlots: Record<string, string> = {};

  // Tap-to-select state
  private tapSelectedId: string | null = null;
  private tapSelectedFrom: 'inventory' | 'offer' | 'partner_offer' | null = null;

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
        subtitle: 'Tap an item to select, then tap where to move it.',
        size: 'md',
        persistent: true,
        bodyClassName: 'modal__body--stack',
        renderBody: () => this.renderBody(),
        renderFooter: () => this.renderFooter(),
        onOpen: (el) => {
          this.attachClickHandler(el);
          this.attachTapListeners(el);
        },
      });
    } else {
      this.rerender();
    }
  }

  public hide(): void {
    if (this.modalId) {
      modalManager.close(this.modalId);
      this.modalId = null;
    }
    this.mySurvivor = null;
    this.partnerSurvivor = null;
    this.session = null;
    this.tapSelectedId = null;
    this.tapSelectedFrom = null;
  }

  // ─── Rendering ───────────────────────────────────────────────

  private rerender(): void {
    if (!this.modalId) return;
    const hint = this.tapSelectedId
      ? 'Now tap a slot or the offer zone to move the item.'
      : 'Tap an item to select, then tap where to move it.';
    modalManager.updateSubtitle(this.modalId, hint);
    modalManager.updateBody(this.modalId, this.renderBody());
    modalManager.updateFooter(this.modalId, this.renderFooter());
    this.attachTapListeners();
  }

  private renderBody(): string {
    if (!this.mySurvivor || !this.partnerSurvivor || !this.session) return '';

    const myStatus = this.session.status[this.mySurvivor.id];
    const partnerStatus = this.session.status[this.partnerSurvivor.id];

    return `
      ${this.renderMyInventory()}
      ${this.renderOfferZone(myStatus, partnerStatus)}
      ${this.renderDiscardZone()}`;
  }

  private renderFooter(): string {
    if (!this.mySurvivor || !this.partnerSurvivor || !this.session) return '';

    const myStatus = this.session.status[this.mySurvivor.id];
    const partnerStatus = this.session.status[this.partnerSurvivor.id];

    return `
      <div class="trade-status">
        <span class="trade-status__item ${myStatus ? 'trade-status__item--ready' : ''}">
          <span class="trade-status__dot"></span>Me: ${myStatus ? 'Ready' : 'Not Ready'}
        </span>
        <span class="trade-status__item ${partnerStatus ? 'trade-status__item--ready' : ''}">
          <span class="trade-status__dot"></span>${this.partnerSurvivor.name}: ${partnerStatus ? 'Ready' : 'Not Ready'}
        </span>
      </div>
      <div class="trade-footer__actions">
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

    const renderSlot = (data: { card: EquipmentCard | null; ghost: boolean }, slot: string, label?: string) => {
      const isItemSelected = data.card && this.tapSelectedId === data.card.id;
      const isTargetable = this.tapSelectedId && !isItemSelected;
      const cls = [
        'inv-slot',
        data.ghost ? 'inv-slot--ghost' : data.card ? 'inv-slot--filled' : '',
        isItemSelected ? 'tap-selected' : '',
        isTargetable ? 'tap-target' : '',
      ].filter(Boolean).join(' ');
      const labelHtml = label ? `<span class="inv-slot__label">${label}</span>` : '';
      const tapFrom = data.ghost ? 'partner_offer' : 'inventory';
      const tapAttrs = data.card
        ? `data-tap-item="${data.card.id}" data-tap-from="${tapFrom}"`
        : '';
      const content = data.card
        ? renderItemCard(data.card, { variant: data.ghost ? 'ghost' : 'default', badge: data.ghost ? 'GET' : undefined, tappable: true, showSlot: false })
        : renderEmptySlot();
      return `<div class="${cls}" data-tap-slot="${slot}" ${tapAttrs}>${labelHtml}${content}</div>`;
    };

    const hand1 = getItem('HAND_1');
    const hand2 = getItem('HAND_2');
    const bp0 = getItem('BACKPACK_0');
    const bp1 = getItem('BACKPACK_1');
    const bp2 = getItem('BACKPACK_2');

    return `
      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Backpack', 'sm')} Your Equipment</div>
        <div class="slot-row slot-row--hands">
          ${renderSlot(hand1, 'HAND_1', 'Hand 1')}
          ${renderSlot(hand2, 'HAND_2', 'Hand 2')}
        </div>
        <div class="slot-row slot-row--backpack">
          ${renderSlot(bp0, 'BACKPACK_0')}
          ${renderSlot(bp1, 'BACKPACK_1')}
          ${renderSlot(bp2, 'BACKPACK_2')}
        </div>
      </div>`;
  }

  private renderOfferZone(myStatus: boolean, partnerStatus: boolean): string {
    const myOfferCards = this.myOffer.map(id => {
      const card = this.myInventory.find(c => c.id === id);
      if (!card) return '';
      const isSelected = this.tapSelectedId === card.id;
      return `<div class="${isSelected ? 'tap-selected' : ''}" data-tap-item="${card.id}" data-tap-from="offer">${renderItemCard(card, { tappable: true, showSlot: false })}</div>`;
    }).join('');

    const partnerOfferCards = this.partnerOffer.map(card => {
      const isSelected = this.tapSelectedId === card.id;
      return `<div class="${isSelected ? 'tap-selected' : ''}" data-tap-item="${card.id}" data-tap-from="partner_offer">${renderItemCard(card, { variant: 'ghost', tappable: true, showSlot: false })}</div>`;
    }).join('');

    const offerTargetable = this.tapSelectedId && this.tapSelectedFrom === 'inventory';

    return `
      <div class="offer-panel">
        <div class="offer-section ${offerTargetable ? 'tap-target' : ''}" data-tap-slot="OFFER">
          <div class="offer-section__title">${icon('ArrowLeftRight', 'sm')} I Give</div>
          <div class="offer-section__items">${myOfferCards || '<span class="text-placeholder">Tap an item then tap here to offer</span>'}</div>
        </div>
        <div class="offer-divider">${icon('ArrowLeftRight', 'sm')}</div>
        <div class="offer-section">
          <div class="offer-section__title">${this.partnerSurvivor!.name} Gives</div>
          <div class="offer-section__items">${partnerOfferCards || '<span class="text-placeholder">Nothing offered yet</span>'}</div>
        </div>
      </div>`;
  }

  private renderDiscardZone(): string {
    const visibleItems = this.myInventory.filter(c => !this.myOffer.includes(c.id));
    const ghostItems = this.partnerOffer.filter(c => this.receivedItemSlots[c.id]);
    const discarded = visibleItems.filter(c => c.slot === 'DISCARD');
    const ghostDiscarded = ghostItems.filter(c => this.receivedItemSlots[c.id] === 'DISCARD');
    const discardContent = [...discarded, ...ghostDiscarded].map(c => {
      const isG = ghostItems.some(g => g.id === c.id);
      const isSelected = this.tapSelectedId === c.id;
      const tapFrom = isG ? 'partner_offer' : 'inventory';
      return `<div class="${isSelected ? 'tap-selected' : ''}" data-tap-item="${c.id}" data-tap-from="${tapFrom}">${renderItemCard(c, { variant: isG ? 'ghost' : 'default', badge: isG ? 'GET' : undefined, tappable: true, showSlot: false, discarded: true })}</div>`;
    }).join('');

    return `
      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Trash2', 'sm')} Discard</div>
        <div class="discard-zone ${this.tapSelectedId && !discarded.some(c => c.id === this.tapSelectedId) && !ghostDiscarded.some(c => c.id === this.tapSelectedId) ? 'tap-target' : ''}" data-tap-slot="DISCARD">
          ${discardContent || renderEmptySlot()}
        </div>
      </div>`;
  }

  // ─── Event Handling ──────────────────────────────────────────

  /** Attach persistent click handler for action buttons (once on modal open). */
  private attachClickHandler(el: HTMLElement): void {
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
  }

  /** Attach tap-to-select listeners to current DOM (called after each render). */
  private attachTapListeners(directEl?: HTMLElement): void {
    const el = directEl ?? (this.modalId ? modalManager.getElement(this.modalId) : null);
    if (!el) return;

    el.querySelectorAll('[data-tap-item], [data-tap-slot]').forEach(tapEl => {
      tapEl.addEventListener('click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        if ((e.target as HTMLElement).closest('[data-action]')) return;

        // Stop bubbling so a parent [data-tap-slot] doesn't also fire
        e.stopPropagation();

        const tapItemId = target.dataset.tapItem;
        const tapSlot = target.dataset.tapSlot;
        const tapFrom = target.dataset.tapFrom as typeof this.tapSelectedFrom;

        // Phase 1: Item tapped — select it
        if (tapItemId && !this.tapSelectedId) {
          this.tapSelectedId = tapItemId;
          this.tapSelectedFrom = tapFrom || 'inventory';
          this.rerender();
          return;
        }

        // Tapping same item — deselect
        if (tapItemId && this.tapSelectedId === tapItemId) {
          this.tapSelectedId = null;
          this.tapSelectedFrom = null;
          this.rerender();
          return;
        }

        // Phase 2: Slot/zone tapped while item is selected — move
        if (this.tapSelectedId && tapSlot) {
          const id = this.tapSelectedId;
          const from = this.tapSelectedFrom;
          this.tapSelectedId = null;
          this.tapSelectedFrom = null;
          this.handleMove(tapSlot, id, from);
          return;
        }

        // Tapping a different item — switch selection or move to its slot
        if (tapItemId && this.tapSelectedId && tapItemId !== this.tapSelectedId) {
          if (tapSlot) {
            const id = this.tapSelectedId;
            const from = this.tapSelectedFrom;
            this.tapSelectedId = null;
            this.tapSelectedFrom = null;
            this.handleMove(tapSlot, id, from);
          } else {
            this.tapSelectedId = tapItemId;
            this.tapSelectedFrom = tapFrom || 'inventory';
            this.rerender();
          }
          return;
        }
      });
    });
  }

  /** Move the currently selected item to the target slot/zone. */
  private handleMove(targetSlot: string, passedId?: string, passedFrom?: typeof this.tapSelectedFrom): void {
    const selectedId = passedId ?? this.tapSelectedId;
    const selectedFrom = passedFrom ?? this.tapSelectedFrom;
    if (!selectedId) return;

    // ── Move to offer zone ──
    if (targetSlot === 'OFFER') {
      if (selectedFrom === 'partner_offer') { this.rerender(); return; }
      if (!this.myOffer.includes(selectedId)) {
        this.myOffer.push(selectedId);
        this.sendOfferUpdate();
      }
      this.rerender();
      return;
    }

    // ── Find what's in the target slot ──
    let victimId: string | null = null;
    if (targetSlot !== 'DISCARD') {
      const visibleItems = this.myInventory.filter(c => !this.myOffer.includes(c.id));
      const occupant = visibleItems.find(c => c.slot === targetSlot);
      if (occupant) victimId = occupant.id;
      if (!victimId) {
        const ghostOccupant = this.partnerOffer.find(c => this.receivedItemSlots[c.id] === targetSlot);
        if (ghostOccupant) victimId = ghostOccupant.id;
      }
      if (victimId === selectedId) { this.rerender(); return; }
    }

    const isSelectedGhost = selectedFrom === 'partner_offer';
    const isVictimGhost = victimId ? Object.keys(this.receivedItemSlots).includes(victimId) : false;

    // Swap logic when ghost items are involved
    if (victimId && (isSelectedGhost || isVictimGhost)) {
      let sourceSlot: string | null = null;
      if (isSelectedGhost) { sourceSlot = this.receivedItemSlots[selectedId] || null; }
      else { sourceSlot = this.myInventory.find(i => i.id === selectedId)?.slot ?? null; }

      if (sourceSlot) {
        if (this.myOffer.includes(selectedId)) {
          this.myOffer = this.myOffer.filter(id => id !== selectedId);
          this.sendOfferUpdate();
        }
        if (isVictimGhost) { this.receivedItemSlots[victimId] = sourceSlot; }
        else if (sourceSlot !== 'DISCARD') { networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: victimId, targetSlot: sourceSlot } }); }
        if (isSelectedGhost) { this.receivedItemSlots[selectedId] = targetSlot; }
        else if (targetSlot !== 'DISCARD') { networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: selectedId, targetSlot } }); }
        this.rerender();
        return;
      }
    }

    // Assigning partner offer item to a slot
    if (selectedFrom === 'partner_offer') {
      this.receivedItemSlots[selectedId] = targetSlot;
      this.rerender();
      return;
    }

    // Returning from offer — un-offer and place at the target slot
    if (this.myOffer.includes(selectedId)) {
      this.myOffer = this.myOffer.filter(id => id !== selectedId);
      this.sendOfferUpdate();

      const card = this.myInventory.find(c => c.id === selectedId);
      if (card && card.slot !== targetSlot) {
        if (targetSlot === 'DISCARD') {
          // Local-only — don't send ORGANIZE+DISCARD to server
          card.slot = 'DISCARD' as any;
          card.inHand = false;
        } else {
          const occupant = this.myInventory.find(c => c.slot === targetSlot && c.id !== selectedId && !this.myOffer.includes(c.id));
          if (occupant) {
            occupant.slot = card.slot;
            occupant.inHand = (card.slot === 'HAND_1' || card.slot === 'HAND_2');
            networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: occupant.id, targetSlot: card.slot } });
          }
          card.slot = targetSlot as any;
          card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');
          networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: selectedId, targetSlot } });
        }
      }

      this.rerender();
      return;
    }

    // Reorganize — swap in local inventory
    const card = this.myInventory.find(c => c.id === selectedId);
    if (card && card.slot !== targetSlot) {
      if (targetSlot === 'DISCARD') {
        // DISCARD in trade is local-only staging — don't send to server
        // (server ORGANIZE+DISCARD permanently deletes the card)
        card.slot = 'DISCARD' as any;
        card.inHand = false;
      } else {
        const oldSlot = card.slot;
        const occupant = this.myInventory.find(c => c.slot === targetSlot && c.id !== selectedId);
        if (occupant) {
          occupant.slot = oldSlot;
          occupant.inHand = (oldSlot === 'HAND_1' || oldSlot === 'HAND_2');
          // Don't send ORGANIZE to DISCARD — it permanently deletes on the server
          if (oldSlot !== 'DISCARD') {
            networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: occupant.id, targetSlot: oldSlot } });
          }
        }
        card.slot = targetSlot as any;
        card.inHand = (targetSlot === 'HAND_1' || targetSlot === 'HAND_2');
        // Moving out of DISCARD is local-only (card was locally staged there)
        if (oldSlot !== 'DISCARD') {
          networkManager.sendAction({ playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id, type: ActionType.ORGANIZE, payload: { cardId: selectedId, targetSlot } });
        }
      }
      this.rerender();
    }
  }

  private sendOfferUpdate(): void {
    networkManager.sendAction({
      playerId: this.mySurvivor!.playerId, survivorId: this.mySurvivor!.id,
      type: ActionType.TRADE_OFFER, payload: { offerCardIds: this.myOffer },
    });
  }
}
