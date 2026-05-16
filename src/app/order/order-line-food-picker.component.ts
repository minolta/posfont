import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { foodBlocksOrderLines, type Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import { foodPickerLabel } from './order-merge.util';

@Component({
  selector: 'app-order-line-food-picker',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './order-line-food-picker.component.html',
  styleUrl: './order-line-food-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderLineFoodPickerComponent {
  private readonly foodService = inject(FoodService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly search = signal('');
  readonly qty = signal('1');
  readonly tableId = this.route.snapshot.queryParamMap.get('tableId');
  readonly foodPickerLabel = foodPickerLabel;

  readonly foods = toSignal(
    this.foodService.getFoods().pipe(
      map((foods) => [...foods].sort((a, b) => foodPickerLabel(a).localeCompare(foodPickerLabel(b)))),
      catchError(() => of([] as Food[])),
    ),
    { initialValue: [] as Food[] },
  );

  filteredFoods(): Food[] {
    const q = this.search().trim().toLowerCase();
    const allowed = this.foods().filter((f) => !foodBlocksOrderLines(f));
    if (!q) {
      return allowed;
    }
    return allowed.filter((f) => foodPickerLabel(f).toLowerCase().includes(q));
  }

  pick(food: Food): void {
    if (food.id == null || foodBlocksOrderLines(food)) {
      return;
    }
    const qty = Math.max(1, Math.floor(Number(this.qty())));
    void this.router.navigate(['/orders/new'], {
      queryParams: {
        tableId: this.tableId,
        pickFoodId: food.id,
        pickQty: qty,
      },
    });
  }

  pictureSrc(food: Food): string | null {
    return this.foodService.resolvePictureSrc(food);
  }
}
