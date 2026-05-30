import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, finalize, map, merge, of, switchMap, take, tap, timer } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { OrderService } from '../order/order.service';
import { resolvedLineStatus } from '../order/order-line-status.util';
import { orderLineRequestNotePart } from '../order/order-line-note.util';
import { mergeOrderRequestPaymentFromPosOrder } from '../order/order-pay.util';
import type { PosOrder } from '../order/order.model';
import type { Kitchen } from './kitchen.model';
import { KitchenService } from './kitchen.service';
import type { KitchenPrepRow } from './kitchen-prep.util';
import { buildKitchenPrepRows } from './kitchen-prep.util';

/** Background poll interval (manual Refresh still runs immediately). */
const AUTO_REFRESH_MS = 15_000;

const STORAGE_KEY = 'posfont.kitchenPrep.selectedKitchenId';

function readStoredKitchenSelection(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

@Component({
  selector: 'app-kitchen-prep',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe],
  templateUrl: './kitchen-prep.component.html',
  styleUrl: './kitchen-prep.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenPrepComponent {
  private readonly orderService = inject(OrderService);
  private readonly kitchenService = inject(KitchenService);
  private readonly i18n = inject(LocaleService);

  /** Shown in page hint; matches `AUTO_REFRESH_MS`. */
  readonly autoRefreshSeconds = Math.round(AUTO_REFRESH_MS / 1000);

  readonly selectedKitchenId = signal<string>(readStoredKitchenSelection());

  readonly refreshNonce = signal(0);

  readonly loadingOrders = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly prepUpdateError = signal<string | null>(null);
  readonly prepUpdatingKey = signal<string | null>(null);

  readonly orders = toSignal(
    merge(
      toObservable(this.refreshNonce).pipe(map(() => false)),
      timer(AUTO_REFRESH_MS, AUTO_REFRESH_MS).pipe(map(() => true)),
    ).pipe(
      switchMap((silent) => {
        if (!silent) {
          this.loadingOrders.set(true);
          this.loadError.set(null);
        }
        return this.orderService.getOrders().pipe(
          tap(() => this.loadError.set(null)),
          catchError((err: unknown) => {
            this.loadError.set(this.fmtLoadErr(err));
            return of([] as PosOrder[]);
          }),
          finalize(() => {
            if (!silent) {
              this.loadingOrders.set(false);
            }
          }),
        );
      }),
    ),
    { initialValue: [] as PosOrder[] },
  );

  readonly loadingKitchens = signal(false);

  readonly kitchens = toSignal(
    timer(0).pipe(
      switchMap(() => {
        this.loadingKitchens.set(true);
        return this.kitchenService.getKitchens().pipe(
          catchError(() => of([] as Kitchen[])),
          finalize(() => this.loadingKitchens.set(false)),
        );
      }),
    ),
    { initialValue: [] as Kitchen[] },
  );

  readonly kitchenFilterId = computed<number | null>(() => {
    const s = this.selectedKitchenId().trim();
    if (s === '') {
      return null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });

  readonly prepRows = computed(() =>
    buildKitchenPrepRows(this.orders() ?? [], this.kitchenFilterId()),
  );

  refresh(): void {
    this.refreshNonce.update((n) => n + 1);
  }

  prepRowUpdateKey(orderId: number, lineIndex: number): string {
    return `${orderId}:${lineIndex}`;
  }

  isRowFinishUpdating(orderId: number, lineIndex: number): boolean {
    return this.prepUpdatingKey() === this.prepRowUpdateKey(orderId, lineIndex);
  }

  finishCooking(row: KitchenPrepRow): void {
    const o = (this.orders() ?? []).find((x) => x.id === row.orderId);
    const tableId = o?.table?.id;
    if (o == null || o.id == null || tableId == null || o.paid) {
      return;
    }
    const lines = o.lines ?? [];
    const idx = row.lineIndex;
    if (idx < 0 || idx >= lines.length) {
      return;
    }
    if (resolvedLineStatus(lines[idx]!, o) !== 'WAIT') {
      return;
    }
    this.prepUpdateError.set(null);
    const now = new Date().toISOString().slice(0, 19);
    const body = mergeOrderRequestPaymentFromPosOrder(
      {
        orderNo: o.orderNo,
        tableId,
        orderDate: o.orderDate ?? now,
        complateOrder: o.complateOrder,
        complateOrderDate: o.complateOrderDate,
        cancel: o.cancel,
        version: o.version,
        lines: lines
          .map((ln, i) => ({
            foodId: ln.food?.id ?? 0,
            quantity: ln.quantity,
            status: i === idx ? ('FINISH_COOKING' as const) : resolvedLineStatus(ln, o),
            ...orderLineRequestNotePart(ln),
          }))
          .filter((ln) => ln.foodId > 0),
      },
      o,
    );
    const key = this.prepRowUpdateKey(o.id, idx);
    this.prepUpdatingKey.set(key);
    this.orderService
      .updateOrder(o.id, body)
      .pipe(
        take(1),
        finalize(() => this.prepUpdatingKey.set(null)),
      )
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.prepUpdateError.set(this.fmtPrepUpdateErr(err));
        },
      });
  }

  onKitchenSelect(value: string): void {
    const v = value.trim();
    this.selectedKitchenId.set(v);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, v);
    }
  }

  kitchenOptionLabel(k: Kitchen): string {
    const code = k.code?.trim();
    const name = k.name?.trim();
    if (name && name !== code) {
      return `${code} · ${name}`;
    }
    return code || name || (k.id != null ? `#${k.id}` : this.i18n.translate('common.kitchen'));
  }

  trackRow(_: number, row: KitchenPrepRow): string {
    return `${row.orderId}:${row.lineIndex}:${row.lineId ?? 'x'}:${row.foodCode}`;
  }

  private fmtLoadErr(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotLoad', {
      entity: this.i18n.translate('order.entity'),
    });
  }

  private fmtPrepUpdateErr(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim().length > 0) {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.trim().length > 0) {
        return err.error;
      }
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('order.cannotUpdate');
  }
}
