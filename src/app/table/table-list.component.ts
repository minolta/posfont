import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  finalize,
  map,
  of,
  switchMap,
  timer,
} from 'rxjs';

import type { Zone } from '../zone/zone.model';
import {
  orderRequestCompleteAllExceptCanceled,
  resolvedLineStatus,
} from '../order/order-line-status.util';
import { buildPayOrderRequest, mergePayOrderAmounts } from '../order/order-pay.util';
import type { OrderLine, PosOrder } from '../order/order.model';
import { OrderService } from '../order/order.service';
import type { PosTable } from './table.model';
import { TableService } from './table.service';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './table-list.component.html',
  styleUrl: './table-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableListComponent {
  private readonly tableService = inject(TableService);
  private readonly orderService = inject(OrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  readonly searchTerm = signal('');
  readonly refreshNonce = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly payingOrderId = signal<number | null>(null);
  readonly payError = signal<string | null>(null);
  readonly payDialogOrderId = signal<number | null>(null);
  readonly payInputAmount = signal<string>('');
  readonly orderRefreshNonce = signal(0);

  readonly openOrdersByTable = toSignal(
    toObservable(this.orderRefreshNonce).pipe(
      switchMap(() => this.orderService.getOrders()),
      map((orders) => {
        const byTable = new Map<number, PosOrder>();
        for (const o of orders) {
          const tableId = o.table?.id;
          if (tableId != null && o.id != null && !o.paid && !o.cancel && !byTable.has(tableId)) {
            byTable.set(tableId, o);
          }
        }
        return byTable;
      }),
      catchError(() => of(new Map<number, PosOrder>())),
    ),
    { initialValue: new Map<number, PosOrder>() },
  );

  readonly tables = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.tableService.searchTables(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set('Could not load tables. Check that the API is running.');
                return of([] as PosTable[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as PosTable[] },
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  deleteTable(t: PosTable): void {
    if (t.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`Delete table "${t.code}"?`)) {
      return;
    }
    this.deletingId.set(t.id);
    this.tableService
      .deleteTable(t.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(this.extractErrorMessage(err));
        },
      });
  }

  openNewOrder(t: PosTable): void {
    const tableId = t.id;
    if (tableId == null) {
      return;
    }
    if (this.hasBlockedOpenOrder(tableId)) {
      this.openPayDialogForTable(tableId);
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: { tableId },
    });
  }

  openPayDialogForTable(tableId: number): void {
    const order = this.openOrderByTable(tableId);
    if (!order || order.id == null) {
      this.payError.set('No unpaid open order found for this table.');
      return;
    }
    this.payError.set(null);
    this.payInputAmount.set(this.payableTotal(order).toFixed(2));
    this.payDialogOrderId.set(order.id);
  }

  closePayDialog(): void {
    this.payDialogOrderId.set(null);
    this.payInputAmount.set('');
  }

  payDialogOrder(): PosOrder | undefined {
    const orderId = this.payDialogOrderId();
    if (orderId == null) {
      return undefined;
    }
    for (const o of this.openOrdersByTable().values()) {
      if (o.id === orderId) {
        return o;
      }
    }
    return undefined;
  }

  confirmPayFromDialog(): void {
    const order = this.payDialogOrder();
    if (!order || order.id == null) {
      this.closePayDialog();
      return;
    }
    const amount = Number(this.payInputAmount());
    const payBody = buildPayOrderRequest(amount, this.payableTotal(order));
    if ('error' in payBody) {
      this.payError.set(payBody.error);
      return;
    }
    if (order.table?.id == null) {
      this.payError.set('Order has no table reference and cannot be paid.');
      return;
    }
    const id = order.id;
    const baseBody = orderRequestCompleteAllExceptCanceled(order);
    if (baseBody == null) {
      this.payError.set('Order has no table reference and cannot be updated.');
      return;
    }
    const prepBody = mergePayOrderAmounts(baseBody, payBody);
    this.payingOrderId.set(id);
    this.payError.set(null);
    const pay$ = this.orderService
      .updateOrder(id, prepBody)
      .pipe(switchMap(() => this.orderService.payOrder(id, payBody)));
    pay$
      .pipe(finalize(() => this.payingOrderId.set(null)))
      .subscribe({
        next: () => {
          this.closePayDialog();
          this.orderRefreshNonce.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.payError.set(
            this.httpErrorDetail(err) ||
              'Could not record payment (line update failed, already paid, or the API is unreachable).',
          );
        },
      });
  }

  setPayInputAmount(value: string): void {
    this.payInputAmount.set(value);
  }

  payableTotal(order: PosOrder): number {
    return (order.lines ?? []).reduce((sum, line) => {
      if (this.lineStatus(line, order) === 'CANCEL') {
        return sum;
      }
      return sum + line.quantity * line.unitPrice;
    }, 0);
  }

  /** Cash change when the entered amount is greater than the payable total (cent-safe). */
  payDialogChange(order: PosOrder): number {
    const tendered = Number(this.payInputAmount());
    const due = this.payableTotal(order);
    if (!Number.isFinite(tendered) || !Number.isFinite(due)) {
      return 0;
    }
    const cents = Math.round(tendered * 100) - Math.round(due * 100);
    if (cents <= 0) {
      return 0;
    }
    return cents / 100;
  }

  lineStatus(line: OrderLine, order: PosOrder): 'WAIT' | 'COMPLETE' | 'CANCEL' {
    return resolvedLineStatus(line, order);
  }

  hasBlockedOpenOrder(tableId: number | null | undefined): boolean {
    return tableId != null && this.openOrdersByTable().has(tableId);
  }

  openOrderByTable(tableId: number | null | undefined): PosOrder | null {
    if (tableId == null) {
      return null;
    }
    return this.openOrdersByTable().get(tableId) ?? null;
  }

  openAddLineForTable(tableId: number): void {
    const order = this.openOrderByTable(tableId);
    if (!order || order.id == null) {
      this.payError.set('No unpaid open order found for this table.');
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: {
        tableId,
        addToOrderId: order.id,
        from: 'tables',
      },
    });
  }

  payableTotalByTable(tableId: number | null | undefined): number {
    const order = this.openOrderByTable(tableId);
    if (!order) {
      return 0;
    }
    return this.payableTotal(order);
  }

  private extractErrorMessage(err: unknown): string {
    return this.httpErrorDetail(err) || 'Could not delete table. Check API connectivity and dependencies.';
  }

  private httpErrorDetail(err: unknown): string {
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
    }
    return '';
  }

  zoneCell(z: Zone | null | undefined): string {
    if (!z) {
      return '—';
    }
    const name = (z.name ?? '').trim();
    const code = (z.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || '—';
  }
}
