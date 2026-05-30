import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, map, of, switchMap } from 'rxjs';

import { foodBlocksOrderLines, type Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import { buildOrderRequestAppendQueuedLines } from '../guest/build-order-append-queue.util';
import { defaultDatetimeLocal, normalizeLocalDateTimeForApi } from './order-datetime.util';
import { pingOrderCustomerDisplayRefresh } from './order-customer-display-sync';
import { foodPickerLabel } from './order-merge.util';
import type { OrderRequest } from './order.model';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { OrderService } from './order.service';

@Component({
  selector: 'app-order-line-picker',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './order-line-picker.component.html',
  styleUrl: './order-line-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderLinePickerComponent {
  private static readonly PICKED_LINES_KEY = 'order-add-picked-lines-v1';
  private static readonly PICKED_EXISTING_ORDER_LINES_KEY = 'order-list-add-picked-lines-v1';
  private readonly foodService = inject(FoodService);
  private readonly orderService = inject(OrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly search = signal('');
  readonly qty = signal('1');
  readonly selectedCategoryKey = signal('ALL');
  readonly tableId = this.route.snapshot.queryParamMap.get('tableId');
  readonly from = this.route.snapshot.queryParamMap.get('from');
  readonly tableCodeParam =
    this.route.snapshot.queryParamMap.get('tableCode')?.trim() ?? '';
  readonly addToOrderId = Number(this.route.snapshot.queryParamMap.get('addToOrderId') ?? '');
  readonly foodPickerLabel = foodPickerLabel;
  readonly notice = signal<string | null>(null);
  readonly pendingCount = signal(0);
  /** Guest/table QR flow submits without going through Orders list / new-order form. */
  readonly guestSubmitting = signal(false);
  readonly guestError = signal<string | null>(null);

  constructor() {
    this.pendingCount.set(this.readPickedQueue().length);
  }

  readonly foods = toSignal(
    this.foodService.getFoods().pipe(
      map((foods) => [...foods].sort((a, b) => foodPickerLabel(a).localeCompare(foodPickerLabel(b)))),
      catchError(() => of([] as Food[])),
    ),
    { initialValue: [] as Food[] },
  );

  filteredFoods(): Food[] {
    const q = this.search().trim().toLowerCase();
    const catKey = this.selectedCategoryKey();
    let byCategory =
      catKey === 'ALL'
        ? this.foods().filter((f) => !foodBlocksOrderLines(f))
        : this.foods().filter(
            (f) =>
              !foodBlocksOrderLines(f) && this.categoryKeyOfFood(f) === catKey,
          );
    if (!q) {
      return byCategory;
    }
    return byCategory.filter((f) => this.searchableText(f).includes(q));
  }

  categoryButtons(): Array<{ key: string; label: string }> {
    const byKey = new Map<string, string>();
    for (const f of this.foods()) {
      if (foodBlocksOrderLines(f)) {
        continue;
      }
      const key = this.categoryKeyOfFood(f);
      if (key === 'NONE') {
        continue;
      }
      if (!byKey.has(key)) {
        byKey.set(key, this.categoryLabelOfFood(f));
      }
    }
    return [...byKey.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  selectCategory(key: string): void {
    this.selectedCategoryKey.set(key);
  }

  isExistingOrderFlow(): boolean {
    return this.from === 'orders' || this.from === 'tables';
  }

  pickerHint(): string {
    if (this.from === 'orders') {
      return this.i18n.translate('order.linePicker.hintOrders');
    }
    if (this.from === 'tables') {
      return this.i18n.translate('order.linePicker.hintTables');
    }
    return this.i18n.translate('order.linePicker.hintGuest');
  }

  pick(food: Food): void {
    if (food.id == null || foodBlocksOrderLines(food)) {
      return;
    }
    const qty = Math.max(1, Math.floor(Number(this.qty())));
    const queue = this.readPickedQueue();
    queue.push({ foodId: food.id, qty });
    sessionStorage.setItem(this.queueStorageKey(), JSON.stringify(queue));
    this.pendingCount.set(queue.length);
    this.notice.set(
      this.i18n.translate('order.linePicker.addedPending', {
        qty,
        food: foodPickerLabel(food),
      }),
    );
  }

  backToOrder(): void {
    if (this.from === 'guest') {
      sessionStorage.removeItem(this.queueStorageKey());
      void this.router.navigate(['/guest/order'], { queryParams: {} });
      return;
    }
    if (this.from === 'orders') {
      sessionStorage.removeItem(this.queueStorageKey());
      void this.router.navigate(['/orders']);
      return;
    }
    if (this.from === 'tables') {
      sessionStorage.removeItem(this.queueStorageKey());
      this.pendingCount.set(0);
      void this.router.navigate(['/tables']);
      return;
    }
    void this.router.navigate(['/orders/new'], {
      queryParams: this.newOrderContinueParams(),
    });
  }

  confirmSave(): void {
    if (this.pendingCount() < 1 || this.guestSubmitting()) {
      return;
    }
    if (this.from === 'guest') {
      this.guestError.set(null);
      if (Number.isFinite(this.addToOrderId) && this.addToOrderId > 0) {
        this.submitGuestAddToExisting();
      } else {
        this.submitGuestCreateNew();
      }
      return;
    }
    if (this.from === 'orders' || this.from === 'tables') {
      if (!Number.isFinite(this.addToOrderId) || this.addToOrderId < 1) {
        return;
      }
      void this.router.navigate(['/orders'], {
        queryParams: {
          addToOrderId: this.addToOrderId,
          applyPickedQueue: '1',
        },
      });
      return;
    }
    void this.router.navigate(['/orders/new'], {
      queryParams: this.newOrderContinueParams(),
    });
  }

  pendingItems(): Array<{ foodId: number; qty: number; label: string }> {
    const byFood = new Map<number, number>();
    for (const item of this.readPickedQueue()) {
      byFood.set(item.foodId, (byFood.get(item.foodId) ?? 0) + item.qty);
    }
    return [...byFood.entries()].map(([foodId, qty]) => {
      const food = this.foods().find((f) => f.id === foodId);
      return {
        foodId,
        qty,
        label: food ? this.foodPickerLabel(food) : `Food #${foodId}`,
      };
    });
  }

  increasePendingQty(foodId: number): void {
    this.updatePendingQty(foodId, 1);
  }

  decreasePendingQty(foodId: number): void {
    this.updatePendingQty(foodId, -1);
  }

  pictureSrc(food: Food): string | null {
    return this.foodService.resolvePictureSrc(food);
  }

  /** Preserve `tableId` and `tableCode` when continuing to order details (e.g. from table QR). */
  private newOrderContinueParams(): Record<string, string> {
    const q: Record<string, string> = {};
    const tid = this.tableId?.trim();
    if (tid) {
      q['tableId'] = tid;
    }
    if (this.tableCodeParam) {
      q['tableCode'] = this.tableCodeParam;
    }
    return q;
  }

  private searchableText(food: Food): string {
    const label = foodPickerLabel(food);
    const catName = (food.foodCategory?.name ?? '').trim();
    const catCode = (food.foodCategory?.code ?? '').trim();
    return `${label} ${catName} ${catCode}`.toLowerCase();
  }

  private categoryKeyOfFood(food: Food): string {
    const id = food.foodCategory?.id;
    if (id != null) {
      return `ID:${id}`;
    }
    const code = (food.foodCategory?.code ?? '').trim();
    if (code) {
      return `CODE:${code}`;
    }
    const name = (food.foodCategory?.name ?? '').trim();
    if (name) {
      return `NAME:${name}`;
    }
    return 'NONE';
  }

  private categoryLabelOfFood(food: Food): string {
    const name = (food.foodCategory?.name ?? '').trim();
    const code = (food.foodCategory?.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || this.i18n.translate('order.linePicker.uncategorized');
  }

  private readPickedQueue(): Array<{ foodId: number; qty: number }> {
    const key = this.queueStorageKey();
    const text = sessionStorage.getItem(key);
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
      sessionStorage.removeItem(key);
      return [];
    }
  }

  private queueStorageKey(): string {
    if (
      this.from === 'guest' ||
      this.from === 'orders' ||
      this.from === 'tables'
    ) {
      if (Number.isFinite(this.addToOrderId) && this.addToOrderId > 0) {
        return OrderLinePickerComponent.PICKED_EXISTING_ORDER_LINES_KEY;
      }
    }
    return OrderLinePickerComponent.PICKED_LINES_KEY;
  }

  confirmButtonLabel(): string {
    return this.from === 'guest' ? 'Send order' : 'Confirm';
  }

  private navigateGuestConfirmed(mode: 'new' | 'add'): void {
    void this.router.navigate(['/guest/order/confirmed'], {
      queryParams: {
        mode,
        tableId: this.tableId?.trim() ?? undefined,
        tableCode: this.tableCodeParam || undefined,
      },
      replaceUrl: true,
    });
  }

  private submitGuestCreateNew(): void {
    const tableIdNum = Number(this.tableId ?? '');
    if (!Number.isFinite(tableIdNum) || tableIdNum < 1) {
      this.guestError.set(this.i18n.translate('order.linePicker.missingTable'));
      return;
    }
    const queue = this.readPickedQueue();
    if (queue.length < 1) {
      return;
    }
    this.guestSubmitting.set(true);
    this.orderService
      .getOrders()
      .pipe(
        switchMap((orders) => {
          const clash = orders.some(
            (o) => o.table?.id === tableIdNum && !o.paid && !o.cancel,
          );
          if (clash) {
            this.guestError.set(this.i18n.translate('order.linePicker.orderClash'));
            return of(null);
          }
          const lines = queue.map((q) => ({
            foodId: q.foodId,
            quantity: Math.max(1, Math.floor(q.qty)),
          }));
          const body: OrderRequest = {
            tableId: tableIdNum,
            orderDate: normalizeLocalDateTimeForApi(defaultDatetimeLocal()),
            complateOrder: false,
            complateOrderDate: null,
            cancel: false,
            lines,
            version: 0,
          };
          return this.orderService.createOrder(body);
        }),
        finalize(() => this.guestSubmitting.set(false)),
        catchError((err: unknown) => {
          this.guestError.set(this.guestSubmitErrorDetail(err));
          return of(null);
        }),
      )
      .subscribe((created) => {
        if (created?.id == null) {
          return;
        }
        sessionStorage.removeItem(OrderLinePickerComponent.PICKED_LINES_KEY);
        this.pendingCount.set(0);
        pingOrderCustomerDisplayRefresh(created.id);
        this.navigateGuestConfirmed('new');
      });
  }

  private submitGuestAddToExisting(): void {
    const id = this.addToOrderId;
    if (!Number.isFinite(id) || id < 1) {
      return;
    }
    const queue = this.readPickedQueue();
    if (queue.length < 1) {
      return;
    }
    this.guestSubmitting.set(true);
    this.orderService
      .getOrderRowById(id)
      .pipe(
        switchMap((o) => {
          if (!o?.id || o.paid || o.cancel) {
            const err = !o?.id
              ? this.i18n.translate('order.linePicker.couldNotLoadTableOrder')
              : this.i18n.translate('order.linePicker.billClosed');
            throw new Error(err);
          }
          const body = buildOrderRequestAppendQueuedLines(o, queue);
          if (body == null) {
            throw new Error(this.i18n.translate('order.cannotUpdate'));
          }
          return this.orderService.updateOrder(o.id, body);
        }),
        finalize(() => this.guestSubmitting.set(false)),
        catchError((err: unknown) => {
          this.guestError.set(this.guestSubmitErrorDetail(err));
          return of(null);
        }),
      )
      .subscribe((updated) => {
        if (updated?.id == null) {
          return;
        }
        sessionStorage.removeItem(OrderLinePickerComponent.PICKED_EXISTING_ORDER_LINES_KEY);
        this.pendingCount.set(0);
        pingOrderCustomerDisplayRefresh(updated.id);
        this.navigateGuestConfirmed('add');
      });
  }

  private guestSubmitErrorDetail(err: unknown): string {
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
      if (err.status >= 400) {
        return this.i18n.translate('common.requestFailedHttp', { status: err.status });
      }
    }
    if (err instanceof Error && err.message.trim().length > 0) {
      return err.message.trim();
    }
    return this.i18n.translate('order.linePicker.couldNotSend');
  }

  private updatePendingQty(foodId: number, delta: number): void {
    const byFood = new Map<number, number>();
    for (const item of this.readPickedQueue()) {
      byFood.set(item.foodId, (byFood.get(item.foodId) ?? 0) + item.qty);
    }
    const current = byFood.get(foodId) ?? 0;
    const next = current + delta;
    if (next <= 0) {
      byFood.delete(foodId);
    } else {
      byFood.set(foodId, next);
    }
    const nextQueue = [...byFood.entries()].map(([fid, qty]) => ({ foodId: fid, qty }));
    sessionStorage.setItem(this.queueStorageKey(), JSON.stringify(nextQueue));
    this.pendingCount.set(nextQueue.reduce((sum, x) => sum + x.qty, 0));
  }
}
