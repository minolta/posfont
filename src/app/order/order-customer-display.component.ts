import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  catchError,
  distinctUntilChanged,
  interval,
  merge,
  of,
  switchMap,
} from 'rxjs';

import { LangSwitchComponent } from '../i18n/lang-switch.component';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { PromptPayQrDisplayComponent } from '../payment/promptpay-qr-display.component';
import { CustomerDisplaySessionService } from './customer-display-session.service';
import { ORDER_CUSTOMER_DISPLAY_PING_PREFIX } from './order-customer-display-sync';
import { resolvedLineStatus } from './order-line-status.util';
import type { OrderLine, OrderLineStatus, PosOrder } from './order.model';
import { readPosOrderNote } from './order-pay.util';
import { OrderService } from './order.service';

/** Customer-facing order total + PromptPay QR; polls the API so it updates after staff edits or payment. */
@Component({
  selector: 'app-order-customer-display',
  standalone: true,
  imports: [DecimalPipe, PromptPayQrDisplayComponent, TranslatePipe, LangSwitchComponent],
  templateUrl: './order-customer-display.component.html',
  styleUrl: './order-customer-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderCustomerDisplayComponent {
  readonly displaySession = inject(CustomerDisplaySessionService);
  private readonly orderService = inject(OrderService);
  private readonly i18n = inject(LocaleService);

  readonly order = signal<PosOrder | undefined>(undefined);
  readonly loadError = signal<string | null>(null);
  readonly initialLoading = signal(true);

  constructor() {
    const dr = inject(DestroyRef);
    const onStorage = (e: StorageEvent): void => {
      if (e.key == null || !e.key.startsWith(ORDER_CUSTOMER_DISPLAY_PING_PREFIX)) {
        return;
      }
      const idFromKey = e.key.slice(ORDER_CUSTOMER_DISPLAY_PING_PREFIX.length);
      const cur = this.displaySession.orderId();
      if (cur != null && String(cur) === idFromKey) {
        this.refreshNow();
      }
    };
    window.addEventListener('storage', onStorage);
    dr.onDestroy(() => window.removeEventListener('storage', onStorage));

    toObservable(this.displaySession.orderId)
      .pipe(
        distinctUntilChanged(),
        switchMap((id) => {
          if (id === null) {
            this.initialLoading.set(false);
            this.order.set(undefined);
            this.loadError.set(null);
            return EMPTY;
          }
          this.initialLoading.set(true);
          this.loadError.set(null);
          this.order.set(undefined);
          return merge(of(0), interval(2200)).pipe(
            switchMap(() =>
              this.orderService.getOrderById(id).pipe(catchError(() => of(undefined))),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((o) => {
        if (o !== undefined) {
          this.order.set(o);
          this.loadError.set(null);
        } else if (this.order() === undefined) {
          this.loadError.set(this.i18n.translate('display.couldNotLoadOrder'));
        }
        this.initialLoading.set(false);
      });
  }

  lineStatus(line: OrderLine, order: PosOrder | undefined): OrderLineStatus {
    if (order == null) {
      return line.status;
    }
    return resolvedLineStatus(line, order);
  }

  activeLines(order: PosOrder): OrderLine[] {
    return (order.lines ?? []).filter((ln) => this.lineStatus(ln, order) !== 'CANCEL');
  }

  payableTotal(order: PosOrder | undefined): number {
    if (order == null) {
      return 0;
    }
    return this.activeLines(order).reduce((sum, ln) => sum + ln.quantity * ln.unitPrice, 0);
  }

  lineLabel(line: OrderLine): string {
    const f = line.food;
    if (f == null) {
      return this.i18n.translate('common.emptyDash');
    }
    const name = f.name?.trim();
    const code = f.code?.trim();
    if (name) {
      return name;
    }
    return code || this.i18n.translate('common.emptyDash');
  }

  paidMethod(o: PosOrder): string {
    return this.i18n.orderPaymentMethodLabel(o);
  }

  orderNote(o: PosOrder): string | null {
    return readPosOrderNote(o);
  }

  refreshNow(): void {
    this.displaySession.pullFromStorage();
    const id = this.displaySession.orderId();
    if (id === null) {
      return;
    }
    this.orderService
      .getOrderById(id)
      .pipe(catchError(() => of(undefined)))
      .subscribe((o) => {
        if (o !== undefined) {
          this.order.set(o);
          this.loadError.set(null);
        }
      });
  }
}
