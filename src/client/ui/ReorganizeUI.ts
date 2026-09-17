
import { Survivor, EquipmentCard } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlot } from './components/ItemCard';
import { icon } from './components/icons';
import { modalManager } from './overlays/ModalManager';
import { es, equipmentName } from '../../strings/es';

/**
 * Reorganize session modal. Opening it (`ORGANIZE_START`) already cost the
 * survivor one action, so every move here is free and goes straight to the
 * server — no local staging, the state that comes back is the truth.
 */
export class ReorganizeUI {
  private modalId: string | null = null;
  private survivor: Survivor | null = null;
  private tapSelectedId: string | null = null;

  public sync(survivor: Survivor): void {
    this.survivor = survivor;

    if (!this.modalId) {
      this.modalId = modalManager.open({
        title: es.reorganize.title,
        subtitle: es.reorganize.hint,
        size: 'md',
        persistent: true,
        bodyClassName: 'modal__body--stack',
        renderBody: () => this.renderBody(),
        renderFooter: () => this.renderFooter(),
        onOpen: (el) => {
          this.attachClickHandler(el);
          this.attachTapListeners(el);
        },
        onClose: () => { this.modalId = null; },
      });
    } else {
      this.rerender();
    }
  }

  /** Closes the modal only. The session is ended by the caller, once. */
  public hide(): void {
    if (this.modalId) modalManager.close(this.modalId);
    this.modalId = null;
    this.survivor = null;
    this.tapSelectedId = null;
  }

  // ─── Rendering ───────────────────────────────────────────────

  private rerender(): void {
    if (!this.modalId) return;
    modalManager.updateSubtitle(
      this.modalId,
      this.tapSelectedId ? es.reorganize.hintSelected : es.reorganize.hint,
    );
    modalManager.updateBody(this.modalId, this.renderBody());
    this.attachTapListeners();
  }

  private renderBody(): string {
    if (!this.survivor) return '';

    const renderSlot = (slot: string, label?: string) => {
      const card = this.survivor!.inventory.find(c => c.slot === slot);
      const isSelected = card && this.tapSelectedId === card.id;
      const cls = [
        'inv-slot',
        card ? 'inv-slot--filled' : '',
        isSelected ? 'tap-selected' : '',
        this.tapSelectedId && !isSelected ? 'tap-target' : '',
      ].filter(Boolean).join(' ');
      const labelHtml = label ? `<span class="inv-slot__label">${label}</span>` : '';
      const tapAttrs = card ? `data-tap-item="${card.id}"` : '';
      const content = card
        ? renderItemCard(card, { tappable: true, showSlot: false })
        : renderEmptySlot();
      return `<div class="${cls}" data-tap-slot="${slot}" ${tapAttrs}>${labelHtml}${content}</div>`;
    };

    return `
      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Backpack', 'sm')} ${es.trade.yourEquipment}</div>
        <div class="slot-row slot-row--hands">
          ${renderSlot('HAND_1', es.slots.HAND_1)}
          ${renderSlot('HAND_2', es.slots.HAND_2)}
        </div>
        <div class="slot-row slot-row--backpack">
          ${renderSlot('BACKPACK_0')}
          ${renderSlot('BACKPACK_1')}
          ${renderSlot('BACKPACK_2')}
        </div>
      </div>

      <div class="inv-panel">
        <div class="inv-panel__header">${icon('Trash2', 'sm')} ${es.trade.discard}</div>
        <div class="discard-zone ${this.tapSelectedId ? 'tap-target' : ''}" data-tap-slot="DISCARD">
          <span class="discard-zone__stamp" aria-hidden="true">${es.trade.discard}</span>
          ${renderEmptySlot()}
        </div>
      </div>`;
  }

  private renderFooter(): string {
    return `
      <div class="trade-footer__actions">
        ${renderButton({ label: es.reorganize.done, icon: 'Check', variant: 'primary', size: 'sm', dataAction: 'end-reorganize' })}
      </div>`;
  }

  // ─── Event Handling ──────────────────────────────────────────

  private attachClickHandler(el: HTMLElement): void {
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (target?.dataset.action !== 'end-reorganize') return;
      const survivor = this.survivor;
      this.hide();
      if (survivor) {
        networkManager.sendAction({
          playerId: survivor.playerId, survivorId: survivor.id, type: ActionType.ORGANIZE_END,
        });
      }
    });
  }

  private attachTapListeners(directEl?: HTMLElement): void {
    const el = directEl ?? (this.modalId ? modalManager.getElement(this.modalId) : null);
    if (!el) return;

    el.querySelectorAll('[data-tap-item], [data-tap-slot]').forEach(tapEl => {
      tapEl.addEventListener('click', (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        if ((e.target as HTMLElement).closest('[data-action]')) return;
        e.stopPropagation();

        const tapItemId = target.dataset.tapItem;
        const tapSlot = target.dataset.tapSlot;

        // Tapping the selected item again deselects it.
        if (tapItemId && this.tapSelectedId === tapItemId) {
          this.tapSelectedId = null;
          this.rerender();
          return;
        }

        // Nothing selected yet: select what was tapped.
        if (tapItemId && !this.tapSelectedId) {
          this.tapSelectedId = tapItemId;
          this.rerender();
          return;
        }

        // Something selected and a slot (or an occupied slot) tapped: move.
        if (this.tapSelectedId && tapSlot) {
          const id = this.tapSelectedId;
          this.tapSelectedId = null;
          this.move(tapSlot, id);
          return;
        }

        if (tapItemId) {
          this.tapSelectedId = tapItemId;
          this.rerender();
        }
      });
    });
  }

  private move(targetSlot: string, cardId: string): void {
    const survivor = this.survivor;
    if (!survivor) return;

    const card = survivor.inventory.find(c => c.id === cardId);
    if (!card) { this.rerender(); return; }

    if (targetSlot === 'DISCARD') {
      this.confirmDiscard(card);
      return;
    }
    if (card.slot === targetSlot) { this.rerender(); return; }

    // The server swaps with whatever occupies the target slot.
    networkManager.sendAction({
      playerId: survivor.playerId, survivorId: survivor.id,
      type: ActionType.ORGANIZE, payload: { cardId, targetSlot },
    });
    this.rerender();
  }

  private confirmDiscard(card: EquipmentCard): void {
    openDiscardConfirm(this.survivor!, card);
    this.rerender();
  }
}

/**
 * Asks before dropping a card. Discarding costs nothing and is allowed at any
 * time, but it is irreversible, so a mis-tap must not lose a weapon.
 */
export function openDiscardConfirm(survivor: Survivor, card: EquipmentCard): void {
  modalManager.open({
    title: es.reorganize.discardTitle,
    size: 'sm',
    renderBody: () => `<p class="text-secondary">${equipmentName(card)} — ${es.reorganize.discardBody}</p>`,
    renderFooter: () => `
      ${renderButton({ label: es.reorganize.keep, variant: 'secondary', dataAction: 'modal-close' })}
      ${renderButton({ label: es.reorganize.discardConfirm, variant: 'destructive', dataAction: 'confirm-discard' })}
    `,
    onOpen: (el) => {
      el.addEventListener('click', (ev) => {
        if (!(ev.target as HTMLElement).closest('[data-action="confirm-discard"]')) return;
        modalManager.close();
        networkManager.sendAction({
          playerId: survivor.playerId, survivorId: survivor.id,
          type: ActionType.DISCARD_CARD, payload: { cardId: card.id },
        });
      });
    },
  });
}
