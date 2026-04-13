/**
 * NotificationManager — Unified toast/alert system with priority stacking,
 * auto-dismiss timers, progress bars, and mobile-friendly positioning.
 *
 * Usage:
 *   notificationManager.show({
 *     type: 'toast',
 *     variant: 'success',
 *     message: 'Room code copied!',
 *   });
 *
 *   notificationManager.show({
 *     type: 'alert',
 *     variant: 'danger',
 *     title: 'Zombie Spawn',
 *     message: '3 Walkers spawned in Zone A',
 *     priority: 'high',
 *   });
 */

import { icon } from './components/icons';

export type NotificationType = 'toast' | 'alert';
export type NotificationVariant = 'info' | 'success' | 'warning' | 'danger';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface NotificationOptions {
  type?: NotificationType;
  variant?: NotificationVariant;
  title?: string;
  message: string;
  duration?: number;         // ms, 0 = manual dismiss only
  priority?: NotificationPriority;
}

interface NotificationEntry {
  id: string;
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

const VARIANT_ICONS: Record<NotificationVariant, string> = {
  info: 'Info',
  success: 'Check',
  warning: 'AlertTriangle',
  danger: 'Skull',
};

const PRIORITY_DEFAULTS: Record<NotificationPriority, { type: NotificationType; duration: number }> = {
  critical: { type: 'alert', duration: 0 },
  high: { type: 'alert', duration: 5000 },
  normal: { type: 'toast', duration: 3000 },
  low: { type: 'toast', duration: 2000 },
};

const MAX_TOASTS = 3;

let nextId = 0;

class NotificationManagerImpl {
  private toastContainer: HTMLElement | null = null;
  private alertContainer: HTMLElement | null = null;
  private toasts: NotificationEntry[] = [];
  private alerts: NotificationEntry[] = [];

  private ensureContainers(): void {
    if (this.toastContainer) return;

    // Toast container
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'notification-container notification-container--toasts';
    document.body.appendChild(this.toastContainer);

    // Alert container
    this.alertContainer = document.createElement('div');
    this.alertContainer.className = 'notification-container notification-container--alerts';
    document.body.appendChild(this.alertContainer);
  }

  show(options: NotificationOptions): string {
    this.ensureContainers();

    const id = `notification-${++nextId}`;
    const priority = options.priority ?? 'normal';
    const defaults = PRIORITY_DEFAULTS[priority];
    const type = options.type ?? defaults.type;
    const variant = options.variant ?? 'info';
    const duration = options.duration ?? defaults.duration;

    if (type === 'toast') {
      return this.showToast(id, variant, options.title, options.message, duration);
    } else {
      return this.showAlert(id, variant, options.title, options.message, duration, priority);
    }
  }

  dismiss(id: string): void {
    const toastIdx = this.toasts.findIndex((t) => t.id === id);
    if (toastIdx !== -1) {
      this.removeToast(toastIdx);
      return;
    }

    const alertIdx = this.alerts.findIndex((a) => a.id === id);
    if (alertIdx !== -1) {
      this.removeAlert(alertIdx);
    }
  }

  dismissAll(): void {
    while (this.toasts.length > 0) {
      this.removeToast(0, true);
    }
    while (this.alerts.length > 0) {
      this.removeAlert(0, true);
    }
  }

  private showToast(
    id: string,
    variant: NotificationVariant,
    title: string | undefined,
    message: string,
    duration: number,
  ): string {
    // Evict oldest if at max
    while (this.toasts.length >= MAX_TOASTS) {
      this.removeToast(0, true);
    }

    const el = document.createElement('div');
    el.className = `toast toast--${variant}`;
    el.dataset.notificationId = id;

    const iconHtml = `<span class="toast__icon">${icon(VARIANT_ICONS[variant], 'md')}</span>`;
    const titleHtml = title ? `<strong class="toast__title">${title}</strong>` : '';
    const messageHtml = `<span class="toast__message">${message}</span>`;
    const dismissHtml = `<button class="toast__dismiss btn btn--icon btn--sm" aria-label="Dismiss">${icon('X', 'sm')}</button>`;
    const progressHtml = duration > 0
      ? `<div class="toast__progress"><div class="toast__progress-bar" style="animation-duration:${duration}ms"></div></div>`
      : '';

    el.innerHTML = `${iconHtml}<div class="toast__content">${titleHtml}${messageHtml}</div>${dismissHtml}${progressHtml}`;

    // Dismiss on click
    el.querySelector('.toast__dismiss')?.addEventListener('click', () => {
      this.dismiss(id);
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (duration > 0) {
      timer = setTimeout(() => this.dismiss(id), duration);
    }

    const entry: NotificationEntry = { id, element: el, timer };
    this.toasts.push(entry);
    this.toastContainer!.appendChild(el);

    // Trigger enter animation
    requestAnimationFrame(() => {
      el.classList.add('toast--visible');
    });

    return id;
  }

  private showAlert(
    id: string,
    variant: NotificationVariant,
    title: string | undefined,
    message: string,
    duration: number,
    priority: NotificationPriority,
  ): string {
    // Critical replaces existing alerts
    if (priority === 'critical') {
      while (this.alerts.length > 0) {
        this.removeAlert(0, true);
      }
    }

    const el = document.createElement('div');
    el.className = `alert-banner alert-banner--${variant}`;
    el.dataset.notificationId = id;

    const iconHtml = `<span class="alert-banner__icon">${icon(VARIANT_ICONS[variant], 'lg')}</span>`;
    const titleHtml = title ? `<strong class="alert-banner__title">${title}</strong>` : '';
    const messageHtml = `<span class="alert-banner__message">${message}</span>`;
    const dismissHtml = priority !== 'critical'
      ? `<button class="alert-banner__dismiss btn btn--icon btn--sm" aria-label="Dismiss">${icon('X', 'sm')}</button>`
      : '';

    el.innerHTML = `${iconHtml}<div class="alert-banner__content">${titleHtml}${messageHtml}</div>${dismissHtml}`;

    // Dismiss on click
    el.querySelector('.alert-banner__dismiss')?.addEventListener('click', () => {
      this.dismiss(id);
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (duration > 0) {
      timer = setTimeout(() => this.dismiss(id), duration);
    }

    const entry: NotificationEntry = { id, element: el, timer };
    this.alerts.push(entry);
    this.alertContainer!.appendChild(el);

    // Trigger enter animation
    requestAnimationFrame(() => {
      el.classList.add('alert-banner--visible');
    });

    return id;
  }

  private removeToast(index: number, immediate = false): void {
    const entry = this.toasts[index];
    if (!entry) return;

    if (entry.timer) clearTimeout(entry.timer);
    this.toasts.splice(index, 1);

    if (immediate) {
      entry.element.remove();
      return;
    }

    entry.element.classList.remove('toast--visible');
    entry.element.classList.add('toast--exiting');
    setTimeout(() => entry.element.remove(), 200);
  }

  private removeAlert(index: number, immediate = false): void {
    const entry = this.alerts[index];
    if (!entry) return;

    if (entry.timer) clearTimeout(entry.timer);
    this.alerts.splice(index, 1);

    if (immediate) {
      entry.element.remove();
      return;
    }

    entry.element.classList.remove('alert-banner--visible');
    entry.element.classList.add('alert-banner--exiting');
    setTimeout(() => entry.element.remove(), 200);
  }
}

export const notificationManager = new NotificationManagerImpl();
