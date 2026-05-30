import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { pingOrderCustomerDisplayRefresh } from './order-customer-display-sync';

/** `localStorage` key for the order id shown on `/orders/display` (cross-tab). */
export const CUSTOMER_DISPLAY_ORDER_STORAGE_KEY = 'posCustomerDisplayOrderId';

/** Reuse one browser tab when staff opens the customer screen. */
export const CUSTOMER_DISPLAY_WINDOW_NAME = 'posCustomerDisplay';

@Injectable({ providedIn: 'root' })
export class CustomerDisplaySessionService {
  /** Order id currently targeted for the shared customer-facing display. */
  readonly orderId = signal<number | null>(null);

  constructor() {
    const dr = inject(DestroyRef);
    this.pullFromStorage();
    const onStorage = (e: StorageEvent): void => {
      if (e.key === CUSTOMER_DISPLAY_ORDER_STORAGE_KEY || e.key === null) {
        this.pullFromStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    dr.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /** Read order id from storage (also used when the customer taps “Refresh”). */
  pullFromStorage(): void {
    try {
      const raw = localStorage.getItem(CUSTOMER_DISPLAY_ORDER_STORAGE_KEY);
      if (raw == null || raw === '') {
        this.orderId.set(null);
        return;
      }
      const n = Number(raw);
      this.orderId.set(Number.isFinite(n) && n > 0 ? n : null);
    } catch {
      this.orderId.set(null);
    }
  }

  /**
   * Staff: set which order the customer display should show. Persists cross-tab and pings
   * an open display to refetch immediately.
   */
  focusOrder(orderId: number): void {
    if (!Number.isFinite(orderId) || orderId < 1) {
      return;
    }
    try {
      localStorage.setItem(CUSTOMER_DISPLAY_ORDER_STORAGE_KEY, String(orderId));
    } catch {
      /* private mode — still update in-memory + ping so this tab’s display can react */
    }
    this.orderId.set(orderId);
    pingOrderCustomerDisplayRefresh(orderId);
  }

  /** Clear the shared display target (optional). */
  clearFocusedOrder(): void {
    try {
      localStorage.removeItem(CUSTOMER_DISPLAY_ORDER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.orderId.set(null);
  }
}
