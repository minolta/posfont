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
import { catchError, finalize, map, merge, of, switchMap, tap, timer } from 'rxjs';

import { OrderService } from '../order/order.service';
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
  imports: [RouterLink, DatePipe],
  templateUrl: './kitchen-prep.component.html',
  styleUrl: './kitchen-prep.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenPrepComponent {
  private readonly orderService = inject(OrderService);
  private readonly kitchenService = inject(KitchenService);

  /** Shown in page hint; matches `AUTO_REFRESH_MS`. */
  readonly autoRefreshSeconds = Math.round(AUTO_REFRESH_MS / 1000);

  readonly selectedKitchenId = signal<string>(readStoredKitchenSelection());

  readonly refreshNonce = signal(0);

  readonly loadingOrders = signal(false);
  readonly loadError = signal<string | null>(null);

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
    return code || name || (k.id != null ? `#${k.id}` : 'Kitchen');
  }

  trackRow(_: number, row: KitchenPrepRow): string {
    return `${row.orderId}:${row.lineId ?? 'x'}:${row.foodCode}`;
  }

  private fmtLoadErr(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return err.message || `Could not load orders (${err.status})`;
    }
    return 'Could not load orders.';
  }
}
