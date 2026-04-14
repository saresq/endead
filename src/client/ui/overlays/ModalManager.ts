/**
 * ModalManager — Shared modal shell with backdrop, focus trap, scroll lock,
 * and responsive bottom-sheet behavior on mobile.
 *
 * Usage:
 *   const id = modalManager.open({
 *     title: 'Backpack',
 *     size: 'md',
 *     renderBody: () => '<div>...</div>',
 *     renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
 *   });
 *
 *   modalManager.close(id);   // close specific
 *   modalManager.close();     // close topmost
 */

import { icon } from '../components/icons';

export interface ModalOptions {
  size?: 'sm' | 'md' | 'lg';
  title?: string;
  subtitle?: string;          // Muted text below the title
  persistent?: boolean;       // Can't dismiss via backdrop/escape
  onClose?: () => void;
  onOpen?: (el: HTMLElement) => void;  // Called after modal is in the DOM
  renderBody: () => string;
  renderFooter?: () => string;
  className?: string;         // Extra class on the modal card
  bodyClassName?: string;     // Extra class on the modal body
}

interface ModalEntry {
  id: string;
  options: ModalOptions;
  backdrop: HTMLElement;
  card: HTMLElement;
  triggerElement: Element | null;  // Where focus returns on close
  keydownHandler: (e: KeyboardEvent) => void;
}

let nextId = 0;

class ModalManagerImpl {
  private stack: ModalEntry[] = [];

  open(options: ModalOptions): string {
    const id = `modal-${++nextId}`;
    const triggerElement = document.activeElement;

    // Build DOM
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.modalId = id;

    const card = document.createElement('div');
    const sizeClass = `modal--${options.size ?? 'md'}`;
    const extraClass = options.className ? ` ${options.className}` : '';
    const persistentClass = options.persistent ? ' modal--persistent' : '';
    card.className = `modal ${sizeClass}${persistentClass}${extraClass}`;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (options.title) card.setAttribute('aria-label', options.title);
    card.dataset.modalId = id;

    // Drag handle for mobile bottom-sheet
    const dragHandle = '<div class="modal__drag-handle"><span></span></div>';

    // Header
    const closeBtn = options.persistent
      ? ''
      : `<button class="btn btn--icon btn--sm modal__close" data-action="modal-close" title="Close" aria-label="Close">${icon('X', 'sm')}</button>`;
    const subtitleHtml = options.subtitle
      ? `<div class="modal__subtitle">${options.subtitle}</div>`
      : '';
    const header = options.title
      ? `<div class="modal__header"><div class="modal__header-text"><h2 class="modal__title">${options.title}</h2>${subtitleHtml}</div>${closeBtn}</div>`
      : (options.persistent ? '' : `<div class="modal__header modal__header--minimal">${closeBtn}</div>`);

    // Body
    const bodyClass = options.bodyClassName ? ` ${options.bodyClassName}` : '';
    const body = `<div class="modal__body${bodyClass}">${options.renderBody()}</div>`;

    // Footer
    const footer = options.renderFooter
      ? `<div class="modal__footer">${options.renderFooter()}</div>`
      : '';

    card.innerHTML = `${dragHandle}${header}${body}${footer}`;
    backdrop.appendChild(card);

    // Keydown handler (escape + focus trap)
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !options.persistent) {
        e.preventDefault();
        this.close(id);
        return;
      }
      if (e.key === 'Tab') {
        this.trapFocus(card, e);
      }
    };

    const entry: ModalEntry = {
      id,
      options,
      backdrop,
      card,
      triggerElement,
      keydownHandler,
    };

    this.stack.push(entry);

    // Backdrop click to dismiss
    if (!options.persistent) {
      backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop) {
          this.close(id);
        }
      });
    }

    // Delegated close button
    card.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action="modal-close"]');
      if (target && !options.persistent) {
        this.close(id);
      }
    });

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Add to DOM
    document.body.appendChild(backdrop);

    // Add keydown listener
    document.addEventListener('keydown', keydownHandler);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
      backdrop.classList.add('modal-backdrop--visible');
      card.classList.add('modal--visible');
    });

    // Focus first focusable element
    requestAnimationFrame(() => {
      const focusable = card.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    });

    // Callback
    options.onOpen?.(card);

    return id;
  }

  close(id?: string): void {
    const index = id
      ? this.stack.findIndex((e) => e.id === id)
      : this.stack.length - 1;

    if (index === -1) return;

    const entry = this.stack[index];
    this.stack.splice(index, 1);

    // Remove keydown listener
    document.removeEventListener('keydown', entry.keydownHandler);

    // Exit animation
    entry.card.classList.remove('modal--visible');
    entry.backdrop.classList.remove('modal-backdrop--visible');

    // Remove after animation
    const cleanup = () => {
      entry.backdrop.remove();

      // Restore body scroll if no modals left
      if (this.stack.length === 0) {
        document.body.style.overflow = '';
      }

      // Return focus
      if (entry.triggerElement instanceof HTMLElement) {
        entry.triggerElement.focus();
      }

      entry.options.onClose?.();
    };

    // Wait for CSS transition to finish before removing DOM
    const onTransitionEnd = () => {
      entry.backdrop.removeEventListener('transitionend', onTransitionEnd);
      cleanup();
    };
    entry.backdrop.addEventListener('transitionend', onTransitionEnd);

    // Safety fallback in case transitionend never fires (e.g. no transition defined)
    setTimeout(() => {
      entry.backdrop.removeEventListener('transitionend', onTransitionEnd);
      if (entry.backdrop.parentNode) cleanup();
    }, 1000);
  }

  closeAll(): void {
    while (this.stack.length > 0) {
      this.close();
    }
  }

  isOpen(id?: string): boolean {
    if (id) return this.stack.some((e) => e.id === id);
    return this.stack.length > 0;
  }

  /**
   * Update the subtitle text of an open modal.
   */
  updateSubtitle(id: string, text: string): void {
    const entry = this.stack.find((e) => e.id === id);
    if (!entry) return;
    let subtitle = entry.card.querySelector('.modal__subtitle');
    if (!subtitle) {
      const headerText = entry.card.querySelector('.modal__header-text');
      if (!headerText) return;
      subtitle = document.createElement('div');
      subtitle.className = 'modal__subtitle';
      headerText.appendChild(subtitle);
    }
    subtitle.textContent = text;
  }

  /**
   * Update the body content of an open modal.
   */
  updateBody(id: string, html: string): void {
    const entry = this.stack.find((e) => e.id === id);
    if (!entry) return;
    const body = entry.card.querySelector('.modal__body');
    if (body) body.innerHTML = html;
  }

  /**
   * Update the footer content of an open modal.
   */
  updateFooter(id: string, html: string): void {
    const entry = this.stack.find((e) => e.id === id);
    if (!entry) return;
    let footer = entry.card.querySelector('.modal__footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'modal__footer';
      entry.card.appendChild(footer);
    }
    footer.innerHTML = html;
  }

  /**
   * Get the DOM element of an open modal card.
   */
  getElement(id: string): HTMLElement | null {
    const entry = this.stack.find((e) => e.id === id);
    return entry?.card ?? null;
  }

  private trapFocus(container: HTMLElement, e: KeyboardEvent): void {
    const focusables = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

export const modalManager = new ModalManagerImpl();
