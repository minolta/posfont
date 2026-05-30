import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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

import { PosCurrentUserService } from '../auth/pos-current-user.service';
import type { Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import type { PosTable } from '../table/table.model';
import { foodPickerLabel, tablePickerLabel } from './order-merge.util';
import {
  orderHasWaitingLines,
  orderRequestCompleteAllExceptCanceled,
  resolvedLineStatus,
} from './order-line-status.util';
import {
  computePaySettlement,
  lineUnitPrice,
  newOrderLineRequest,
  orderAfterPayPatch,
  orderComplated,
  orderComplatedDate,
  orderIsPaid,
  orderLineToRequest,
  orderOrderDate,
  orderOrderNo,
  orderPaidFields,
  orderPayStateForPut,
  orderSettlementForPut,
  orderUserFields,
  type OrderLine,
  type OrderRequest,
  type PosOrder,
} from './order.model';
import { OrderService } from './order.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent {
  private static readonly PICKED_EXISTING_ORDER_LINES_KEY = 'order-list-add-picked-lines-v1';
  private readonly orderService = inject(OrderService);
  private readonly foodService = inject(FoodService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly currentUser = inject(PosCurrentUserService);

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
  /** Merged on top of GET `/api/orders` until the list reflects pay (GET is often stale). */
  private readonly orderRowPatchById = signal(new Map<number, PosOrder>());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly payingId = signal<number | null>(null);
  readonly payError = signal<string | null>(null);
  readonly payDialogOrderId = signal<number | null>(null);
  readonly payInputAmount = signal<string>('');
  readonly addingLineId = signal<number | null>(null);
  readonly addLineError = signal<string | null>(null);
  readonly statusUpdatingKey = signal<string | null>(null);
  readonly completeAllOrderId = signal<number | null>(null);
  readonly statusError = signal<string | null>(null);
  readonly addFoodByOrderId = signal<Record<number, string>>({});
  readonly addQtyByOrderId = signal<Record<number, string>>({});
  readonly addFoodSearchByOrderId = signal<Record<number, string>>({});
  readonly expandedOrderId = signal<number | null>(null);

  readonly foods = toSignal(
    this.foodService.getFoods().pipe(
      map((foods) =>
        [...foods].sort((a, b) => foodPickerLabel(a).localeCompare(foodPickerLabel(b))),
      ),
      catchError(() => of([] as Food[])),
    ),
    { initialValue: [] as Food[] },
  );

  constructor() {
    effect(() => {
      const rawList = this.orders();
      if (rawList.length === 0) {
        return;
      }
      this.orderRowPatchById.update((m) => {
        if (m.size === 0) {
          return m;
        }
        const next = new Map(m);
        for (const o of rawList) {
          if (o.id != null && orderIsPaid(o)) {
            next.delete(o.id);
          }
        }
        return next.size !== m.size ? next : m;
      });
    });

    combineLatest([this.route.queryParamMap, toObservable(this.orders)]).subscribe(([qpm, orders]) => {
      const openPayId = Number(qpm.get('openPayId') ?? '');
      if (Number.isFinite(openPayId) && openPayId > 0) {
        const orderForPay = orders.find((o) => o.id === openPayId);
        if (!orderForPay) {
          return;
        }
        if (!orderIsPaid(orderForPay)) {
          this.openPayDialog(orderForPay);
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { openPayId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        return;
      }

      const orderId = Number(qpm.get('addToOrderId') ?? '');
      const applyPickedQueue = qpm.get('applyPickedQueue') === '1';
      const pickFoodId = Number(qpm.get('pickFoodId') ?? '');
      const pickQty = Number(qpm.get('pickQty') ?? '1');
      if (Number.isFinite(orderId) && orderId > 0 && applyPickedQueue) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) {
          return;
        }
        const queue = this.readPickedQueueForExistingOrder();
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { addToOrderId: null, applyPickedQueue: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        if (queue.length > 0) {
          this.addQueuedLinesToOrder(order, queue);
        }
        return;
      }
      if (!Number.isFinite(orderId) || orderId < 1 || !Number.isFinite(pickFoodId) || pickFoodId < 1) {
        return;
      }
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        return;
      }
      const qty = Number.isFinite(pickQty) && pickQty > 0 ? Math.floor(pickQty) : 1;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { addToOrderId: null, pickFoodId: null, pickQty: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      this.addLineToOrder(order, pickFoodId, qty);
    });
  }

  readonly orders = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.orderService.searchOrders(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set('Could not load orders. Check that the API is running.');
                return of([] as PosOrder[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as PosOrder[] },
  );

  /** List rows with short-lived pay patches applied (see {@link orderRowPatchById}). */
  readonly ordersView = computed(() => {
    const list = this.orders();
    const patches = this.orderRowPatchById();
    if (patches.size === 0) {
      return list;
    }
    return list.map((o) => {
      if (o.id == null) {
        return o;
      }
      const p = patches.get(o.id);
      return p ?? o;
    });
  });

  readonly payDialogOrder = computed(() => {
    const id = this.payDialogOrderId();
    if (id == null) {
      return undefined;
    }
    return this.ordersView().find((o) => o.id === id);
  });

  /** Updates when `payInputAmount` or the open pay order changes (OnPush-safe live “change” preview). */
  readonly payDialogChangePreview = computed(() => {
    const id = this.payDialogOrderId();
    if (id == null) {
      return 0;
    }
    const order = this.ordersView().find((o) => o.id === id);
    if (order == null) {
      return 0;
    }
    const raw = this.payInputAmount().trim();
    if (raw === '') {
      return 0;
    }
    const tendered = Number(raw);
    if (!Number.isFinite(tendered)) {
      return 0;
    }
    return computePaySettlement(this.payableTotal(order), tendered).change;
  });

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  deleteOrder(o: PosOrder): void {
    if (o.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`Delete order "${orderOrderNo(o)}"?`)) {
      return;
    }
    this.deletingId.set(o.id);
    this.orderService
      .deleteOrder(o.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(this.extractErrorMessage(err));
        },
      });
  }

  openPayDialog(o: PosOrder): void {
    if (o.id == null || orderIsPaid(o)) {
      return;
    }
    this.payError.set(null);
    this.payInputAmount.set(this.payableTotal(o).toFixed(2));
    this.payDialogOrderId.set(o.id);
  }

  closePayDialog(): void {
    this.payDialogOrderId.set(null);
    this.payInputAmount.set('');
  }

  confirmPayFromDialog(): void {
    const order = this.payDialogOrder();
    if (!order || order.id == null) {
      this.closePayDialog();
      return;
    }
    const amount = Number(this.payInputAmount());
    if (!Number.isFinite(amount) || amount < 0) {
      this.payError.set('Please enter a valid cash amount from the customer.');
      return;
    }
    if (order.table?.id == null) {
      this.payError.set('Order has no table reference and cannot be paid.');
      return;
    }
    const id = order.id;
    /** Always send every non-canceled line as COMPLETE on pay — many APIs keep `paid` false if any line is still WAIT. */
    const lineUpdateBody = orderRequestCompleteAllExceptCanceled(order);
    if (lineUpdateBody == null) {
      this.payError.set('Could not build line update for payment.');
      return;
    }
    const settlement = computePaySettlement(this.payableTotal(order), amount);
    const paidAt = new Date().toISOString().slice(0, 19);
    const updatePayload: OrderRequest = {
      ...lineUpdateBody,
      ...orderSettlementForPut(settlement),
      ...orderPayStateForPut(paidAt),
      complateOrder: true,
      complateOrderDate: paidAt,
    };
    this.payingId.set(id);
    this.payError.set(null);
    const pay$ = this.orderService.updateOrder(id, updatePayload);
    pay$
      .pipe(finalize(() => this.payingId.set(null)))
      .subscribe({
        next: (updated) => {
          const patch = orderAfterPayPatch(order, updated, paidAt, settlement);
          if (order.id != null) {
            this.orderRowPatchById.update((m) => new Map(m).set(order.id!, patch));
          }
          this.closePayDialog();
          this.refreshNonce.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.payError.set(
            this.httpErrorDetail(err) ||
              'Could not record payment (order update failed, already paid, or the API is unreachable).',
          );
        },
      });
  }

  setPayInputAmount(value: string): void {
    this.payInputAmount.set(value);
  }

  addLineFood(orderId: number): string {
    return this.addFoodByOrderId()[orderId] ?? '';
  }

  setAddLineFood(orderId: number, value: string): void {
    this.addFoodByOrderId.update((prev) => ({ ...prev, [orderId]: value }));
  }

  addLineFoodSearch(orderId: number): string {
    return this.addFoodSearchByOrderId()[orderId] ?? '';
  }

  setAddLineFoodSearch(orderId: number, value: string): void {
    this.addFoodSearchByOrderId.update((prev) => ({ ...prev, [orderId]: value }));
  }

  filteredFoodsForAddLine(orderId: number): Food[] {
    const q = this.addLineFoodSearch(orderId).trim().toLowerCase();
    const all = this.foods();
    if (!q) {
      return all;
    }
    return all.filter((f) => this.foodLabel(f).toLowerCase().includes(q));
  }

  selectedFoodForAddLine(orderId: number): Food | undefined {
    const foodId = Number(this.addLineFood(orderId));
    if (!Number.isFinite(foodId) || foodId < 1) {
      return undefined;
    }
    return this.foods().find((f) => f.id === foodId);
  }

  addLineQty(orderId: number): string {
    return this.addQtyByOrderId()[orderId] ?? '1';
  }

  setAddLineQty(orderId: number, value: string): void {
    this.addQtyByOrderId.update((prev) => ({ ...prev, [orderId]: value }));
  }

  addLineFromList(o: PosOrder): void {
    if (o.id == null || orderIsPaid(o)) {
      return;
    }
    const orderId = o.id;
    this.addLineError.set(null);
    const pickedFoodId = Number(this.addLineFood(orderId));
    const qty = Math.floor(Number(this.addLineQty(orderId)));
    if (!Number.isFinite(pickedFoodId) || pickedFoodId < 1) {
      this.addLineError.set('Select a food before adding a line.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      this.addLineError.set('Quantity must be at least 1.');
      return;
    }
    this.addLineToOrder(o, pickedFoodId, qty);
  }

  openLinePickerForOrder(o: PosOrder): void {
    if (o.id == null) {
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: {
        tableId: o.table?.id ?? null,
        addToOrderId: o.id,
        from: 'orders',
      },
    });
  }

  lineStatus(line: OrderLine, order: PosOrder): 'WAIT' | 'COMPLETE' | 'CANCEL' {
    return resolvedLineStatus(line, order);
  }

  lineStatusIcon(status: 'WAIT' | 'COMPLETE' | 'CANCEL'): string {
    if (status === 'COMPLETE') {
      return '✓';
    }
    if (status === 'CANCEL') {
      return '✕';
    }
    return '⏳';
  }

  private lineUpdateKey(orderId: number, lineIndex: number): string {
    return `${orderId}:${lineIndex}`;
  }

  isLineStatusUpdating(orderId: number, lineIndex: number): boolean {
    return this.statusUpdatingKey() === this.lineUpdateKey(orderId, lineIndex);
  }

  hasWaitingLines(o: PosOrder): boolean {
    return orderHasWaitingLines(o);
  }

  isCompleteAllUpdating(orderId: number | null | undefined): boolean {
    return orderId != null && this.completeAllOrderId() === orderId;
  }

  completeAllLineStatuses(o: PosOrder): void {
    if (o.id == null || orderIsPaid(o)) {
      return;
    }
    if (!this.hasWaitingLines(o)) {
      return;
    }
    this.statusError.set(null);
    const body = orderRequestCompleteAllExceptCanceled(o);
    if (body == null) {
      this.statusError.set('Order has no table reference and cannot be updated.');
      return;
    }
    this.completeAllOrderId.set(o.id);
    this.orderService
      .updateOrder(o.id, body)
      .pipe(finalize(() => this.completeAllOrderId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.statusError.set(this.extractErrorMessage(err));
        },
      });
  }

  changeLineStatus(
    o: PosOrder,
    lineIndex: number,
    target: 'COMPLETE' | 'CANCEL',
  ): void {
    if (o.id == null || orderIsPaid(o)) {
      return;
    }
    const tableId = o.table?.id;
    if (tableId == null) {
      this.statusError.set('Order has no table reference and cannot be updated.');
      return;
    }
    this.statusError.set(null);
    const now = new Date().toISOString().slice(0, 19);
    const body: OrderRequest = {
      orderNo: orderOrderNo(o),
      tableId,
      orderDate: orderOrderDate(o) ?? now,
      complateOrder: target === 'COMPLETE',
      complateOrderDate: target === 'COMPLETE' ? now : null,
      cancel: target === 'CANCEL',
      ...orderPaidFields(o),
      ...orderUserFields(o),
      version: o.version,
      lines: (o.lines ?? [])
        .map((ln, idx) =>
          orderLineToRequest(ln, idx === lineIndex ? target : this.lineStatus(ln, o)),
        )
        .filter((ln) => ln.foodId > 0),
    };
    const lineKey = this.lineUpdateKey(o.id, lineIndex);
    this.statusUpdatingKey.set(lineKey);
    this.orderService
      .updateOrder(o.id, body)
      .pipe(finalize(() => this.statusUpdatingKey.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.statusError.set(this.extractErrorMessage(err));
        },
      });
  }

  tableCell(t: PosTable | null | undefined): string {
    if (!t) {
      return '—';
    }
    return tablePickerLabel(t);
  }

  foodLabel(f: Food | null | undefined): string {
    if (!f) {
      return '—';
    }
    return foodPickerLabel(f);
  }

  linesSummary(o: PosOrder): string {
    const lines = o.lines ?? [];
    if (lines.length === 0) {
      return '—';
    }
    return lines
      .map((ln) => {
        const label = this.foodLabel(ln.food);
        return `${ln.quantity}× ${label}`;
      })
      .join('; ');
  }

  orderTotal(o: PosOrder): number {
    return (o.lines ?? []).reduce((sum, ln) => sum + ln.quantity * lineUnitPrice(ln), 0);
  }

  payableTotal(o: PosOrder): number {
    return (o.lines ?? []).reduce((sum, ln) => {
      if (this.lineStatus(ln, o) === 'CANCEL') {
        return sum;
      }
      return sum + ln.quantity * lineUnitPrice(ln);
    }, 0);
  }

  toggleOrderLines(orderId: number | null | undefined): void {
    if (orderId == null) {
      return;
    }
    this.expandedOrderId.update((curr) => (curr === orderId ? null : orderId));
  }

  orderLineStatus(o: PosOrder): 'WAIT' | 'COMPLETE' | 'CANCEL' {
    if (o.cancel) {
      return 'CANCEL';
    }
    if (orderComplated(o) || orderIsPaid(o)) {
      return 'COMPLETE';
    }
    return 'WAIT';
  }

  isOrderPaid(o: PosOrder): boolean {
    return orderIsPaid(o);
  }

  displayOrderNo(o: PosOrder): string {
    return orderOrderNo(o) || '—';
  }

  listOrderDateIso(o: PosOrder): string | null {
    const d = orderOrderDate(o);
    return d != null && String(d).trim() !== '' ? d : null;
  }

  isOrderComplated(o: PosOrder): boolean {
    return orderComplated(o);
  }

  lineUnitPriceFor(ln: OrderLine): number {
    return lineUnitPrice(ln);
  }

  private extractErrorMessage(err: unknown): string {
    return (
      this.httpErrorDetail(err) ||
      'Could not delete order. Check API connectivity and dependencies.'
    );
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

  private addLineToOrder(o: PosOrder, foodId: number, qty: number): void {
    const orderId = o.id;
    const tableId = o.table?.id;
    if (orderId == null || tableId == null) {
      this.addLineError.set('Order has no table reference and cannot be updated.');
      return;
    }
    const actorUserId = this.currentUser.requireUserId();
    if (actorUserId == null) {
      this.addLineError.set('Set your User ID in the header before adding order lines.');
      return;
    }
    const body: OrderRequest = {
      orderNo: orderOrderNo(o),
      tableId,
      orderDate: orderOrderDate(o) ?? new Date().toISOString().slice(0, 19),
      complateOrder: orderComplated(o),
      complateOrderDate: orderComplatedDate(o),
      cancel: o.cancel,
      ...orderPaidFields(o),
      ...orderUserFields(o),
      version: o.version,
      lines: [
        ...(o.lines ?? []).map((ln) => orderLineToRequest(ln, this.lineStatus(ln, o))),
        newOrderLineRequest(foodId, qty, 'WAIT', actorUserId),
      ].filter((ln) => ln.foodId > 0),
    };
    this.addingLineId.set(orderId);
    this.orderService
      .updateOrder(orderId, body)
      .pipe(finalize(() => this.addingLineId.set(null)))
      .subscribe({
        next: () => {
          this.refreshNonce.update((n) => n + 1);
          this.addFoodByOrderId.update((prev) => ({ ...prev, [orderId]: '' }));
          this.addQtyByOrderId.update((prev) => ({ ...prev, [orderId]: '1' }));
          this.addFoodSearchByOrderId.update((prev) => ({ ...prev, [orderId]: '' }));
        },
        error: (err: unknown) => {
          this.addLineError.set(this.extractErrorMessage(err));
        },
      });
  }

  private addQueuedLinesToOrder(
    o: PosOrder,
    queue: Array<{ foodId: number; qty: number }>,
  ): void {
    const orderId = o.id;
    const tableId = o.table?.id;
    if (orderId == null || tableId == null || orderIsPaid(o)) {
      this.addLineError.set('Order cannot be updated.');
      return;
    }
    const actorUserId = this.currentUser.requireUserId();
    if (actorUserId == null) {
      this.addLineError.set('Set your User ID in the header before adding order lines.');
      return;
    }
    const merged = new Map<number, number>();
    for (const item of queue) {
      const curr = merged.get(item.foodId) ?? 0;
      merged.set(item.foodId, curr + Math.max(1, Math.floor(item.qty)));
    }
    const body: OrderRequest = {
      orderNo: orderOrderNo(o),
      tableId,
      orderDate: orderOrderDate(o) ?? new Date().toISOString().slice(0, 19),
      complateOrder: orderComplated(o),
      complateOrderDate: orderComplatedDate(o),
      cancel: o.cancel,
      ...orderPaidFields(o),
      ...orderUserFields(o),
      version: o.version,
      lines: [
        ...(o.lines ?? []).map((ln) => orderLineToRequest(ln, this.lineStatus(ln, o))),
        ...[...merged.entries()].map(([foodId, quantity]) =>
          newOrderLineRequest(foodId, quantity, 'WAIT', actorUserId),
        ),
      ].filter((ln) => ln.foodId > 0),
    };
    this.addingLineId.set(orderId);
    this.orderService
      .updateOrder(orderId, body)
      .pipe(finalize(() => this.addingLineId.set(null)))
      .subscribe({
        next: () => {
          sessionStorage.removeItem(OrderListComponent.PICKED_EXISTING_ORDER_LINES_KEY);
          this.refreshNonce.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.addLineError.set(this.extractErrorMessage(err));
        },
      });
  }

  private readPickedQueueForExistingOrder(): Array<{ foodId: number; qty: number }> {
    const text = sessionStorage.getItem(OrderListComponent.PICKED_EXISTING_ORDER_LINES_KEY);
    if (!text) {
      return [];
    }
    try {
      const parsed = JSON.parse(text) as Array<{ foodId?: number; qty?: number }>;
      return parsed
        .map((x) => ({
          foodId: Number(x.foodId ?? 0),
          qty: Math.max(1, Math.floor(Number(x.qty ?? 1))),
        }))
        .filter((x) => Number.isFinite(x.foodId) && x.foodId > 0);
    } catch {
      sessionStorage.removeItem(OrderListComponent.PICKED_EXISTING_ORDER_LINES_KEY);
      return [];
    }
  }
}
