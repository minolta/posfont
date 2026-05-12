import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  finalize,
  map,
  of,
  switchMap,
  timer,
} from 'rxjs';

import { FoodCategoryService } from '../food-category/food-category.service';
import type { Food, FoodCategory, Kitchen } from './food.model';
import { FoodService } from './food.service';

@Component({
  selector: 'app-food-list',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './food-list.component.html',
  styleUrl: './food-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodListComponent {
  private readonly foodService = inject(FoodService);
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly route = inject(ActivatedRoute);

  /** Food ids whose image URL failed to load (e.g. 404); hide thumb until list refetches. */
  private readonly brokenPictureIds = signal<Set<number>>(new Set());

  /** Food whose picture is shown full-screen; null when lightbox is closed. */
  readonly lightboxFood = signal<Food | null>(null);

  constructor() {
    effect(() => {
      this.foods();
      this.brokenPictureIds.set(new Set());
    });
  }

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  /** Search text sent as `q` to `GET /api/foods` (matches food code or name substring). */
  readonly searchTerm = signal('');
  /** `null` = all categories; chips always show every category from the API, independent of search. */
  readonly selectedCategoryId = signal<number | null>(null);
  /** Bumped after a delete so the list refetches. */
  readonly refreshNonce = signal(0);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly foods = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.foodService.searchFoods(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set('Could not load foods. Check that the API is running.');
                return of([] as Food[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as Food[] },
  );

  /** Full category list for chips (not derived from filtered foods). */
  readonly allCategories = toSignal(
    combineLatest([toObservable(this.refreshNonce)]).pipe(
      switchMap(() =>
        this.foodCategoryService.getFoodCategories().pipe(
          catchError(() => of([] as FoodCategory[])),
          map((list) =>
            [...list].sort((a, b) => {
              const an = ((a.name ?? '').trim() || a.code).toLowerCase();
              const bn = ((b.name ?? '').trim() || b.code).toLowerCase();
              return an.localeCompare(bn);
            }),
          ),
        ),
      ),
    ),
    { initialValue: [] as FoodCategory[] },
  );

  /** Foods from the server search, narrowed by selected category chip (client-side). */
  readonly displayedFoods = computed(() => {
    const rows = this.foods();
    const catId = this.selectedCategoryId();
    if (catId == null) {
      return rows;
    }
    return rows.filter((f) => f.foodCategory?.id === catId);
  });

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  selectCategoryFilter(categoryId: number | null): void {
    this.selectedCategoryId.set(categoryId);
  }

  deleteFood(food: Food): void {
    if (food.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`Delete food "${food.code}"?`)) {
      return;
    }
    this.deletingId.set(food.id);
    this.foodService
      .deleteFood(food.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(this.extractErrorMessage(err));
        },
      });
  }

  private extractErrorMessage(err: unknown): string {
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
    return 'Could not delete food. Check API connectivity and dependencies.';
  }

  /** Kitchen column: `Name (code)` when both exist; otherwise name or code. */
  kitchenCell(k: Kitchen | null | undefined): string {
    if (!k) {
      return '—';
    }
    const name = (k.name ?? '').trim();
    const code = (k.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || '—';
  }

  /** Category column: `Name (code)` when both exist; otherwise name or code. */
  categoryCell(c: FoodCategory | null | undefined): string {
    if (!c) {
      return '—';
    }
    const name = (c.name ?? '').trim();
    const code = (c.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || '—';
  }

  pictureSrc(food: Food): string | null {
    const id = food.id;
    if (id != null && this.brokenPictureIds().has(id)) {
      return null;
    }
    return this.foodService.resolvePictureSrc(food);
  }

  onPictureError(food: Food): void {
    const id = food.id;
    if (id == null) {
      return;
    }
    this.brokenPictureIds.update((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (this.lightboxFood()?.id === id) {
      this.lightboxFood.set(null);
    }
  }

  openLightbox(food: Food): void {
    if (!this.pictureSrc(food)) {
      return;
    }
    this.lightboxFood.set(food);
  }

  closeLightbox(): void {
    this.lightboxFood.set(null);
  }

  onLightboxBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) {
      this.closeLightbox();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.lightboxFood()) {
      this.closeLightbox();
    }
  }
}
