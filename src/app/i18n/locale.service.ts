import { Injectable, signal } from '@angular/core';

import { orderPaymentMethodKey } from '../order/order-pay.util';
import type { PosOrder } from '../order/order.model';
import { isLocaleId, LOCALE_STORAGE_KEY, type LocaleId } from './locale-id';
import { translations, type TranslationKey } from './translations';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locale = signal<LocaleId>(this.loadStoredLocale());

  translate(key: TranslationKey, params?: Record<string, string | number>): string {
    const lang = this.locale();
    let text = translations[lang][key] ?? translations.en[key] ?? String(key);
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  /** Localized payment method label for a paid order. */
  orderPaymentMethodLabel(o: PosOrder): string {
    return this.translate(orderPaymentMethodKey(o));
  }

  setLocale(next: LocaleId): void {
    if (this.locale() === next) {
      return;
    }
    this.locale.set(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
    document.documentElement.lang = next === 'th' ? 'th' : 'en';
  }

  private loadStoredLocale(): LocaleId {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && isLocaleId(stored)) {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return 'en';
  }
}
