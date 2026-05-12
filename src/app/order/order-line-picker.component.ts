import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import type { Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import { foodPickerLabel } from './order-merge.util';

@Component({
  selector: 'app-order-line-picker',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './order-line-picker.component.html',
  styleUrl: './order-line-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderLinePickerComponent {
  private static readonly PICKED_LINES_KEY = 'order-add-picked-lines-v1';
  private static readonly PICKED_EXISTING_ORDER_LINES_KEY = 'order-list-add-picked-lines-v1';
  private readonly foodService = inject(FoodService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly search = signal('');
  readonly qty = signal('1');
  readonly selectedCategoryKey = signal('ALL');
  readonly tableId = this.route.snapshot.queryParamMap.get('tableId');
  readonly from = this.route.snapshot.queryParamMap.get('from');
  readonly addToOrderId = Number(this.route.snapshot.queryParamMap.get('addToOrderId') ?? '');
  readonly foodPickerLabel = foodPickerLabel;
  readonly notice = signal<string | null>(null);
  readonly pendingCount = signal(0);

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
    const byCategory =
      catKey === 'ALL'
        ? this.foods()
        : this.foods().filter((f) => this.categoryKeyOfFood(f) === catKey);
    if (!q) {
      return byCategory;
    }
    return byCategory.filter((f) => this.searchableText(f).includes(q));
  }

  categoryButtons(): Array<{ key: string; label: string }> {
    const byKey = new Map<string, string>();
    for (const f of this.foods()) {
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
      return 'Click food cards to build pending lines, then confirm to save.';
    }
    if (this.from === 'tables') {
      return 'Click food cards to build pending lines for this table order, then confirm to save.';
    }
    return 'Click a food card to add it as a new order line.';
  }

  pick(food: Food): void {
    if (food.id == null) {
      return;
    }
    const qty = Math.max(1, Math.floor(Number(this.qty())));
    const queue = this.readPickedQueue();
    queue.push({ foodId: food.id, qty });
    sessionStorage.setItem(this.queueStorageKey(), JSON.stringify(queue));
    this.pendingCount.set(queue.length);
    this.notice.set(`Added ${qty} × ${foodPickerLabel(food)} to pending lines.`);
  }

  backToOrder(): void {
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
      queryParams: {
        tableId: this.tableId,
      },
    });
  }

  confirmSave(): void {
    if (this.pendingCount() < 1) {
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
      queryParams: {
        tableId: this.tableId,
      },
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
    return name || code || 'Uncategorized';
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
    if (this.from === 'orders' || this.from === 'tables') {
      return OrderLinePickerComponent.PICKED_EXISTING_ORDER_LINES_KEY;
    }
    return OrderLinePickerComponent.PICKED_LINES_KEY;
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
