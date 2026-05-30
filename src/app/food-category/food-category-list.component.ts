import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, finalize, map, of, switchMap, timer } from 'rxjs';

import type { FoodCategory } from '../food/food.model';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { FoodCategoryService } from './food-category.service';

@Component({
  selector: 'app-food-category-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './food-category-list.component.html',
  styleUrl: './food-category-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodCategoryListComponent {
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LocaleService);

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

  readonly categories = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.foodCategoryService.searchFoodCategories(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set(
                  this.i18n.translate('common.couldNotLoad', {
                    entity: this.i18n.translate('nav.categories'),
                  }),
                );
                return of([] as FoodCategory[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as FoodCategory[] },
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  deleteCategory(c: FoodCategory): void {
    if (c.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (
      !window.confirm(
        `${this.i18n.translate('common.delete')} "${c.code}"?`,
      )
    ) {
      return;
    }
    this.deletingId.set(c.id);
    this.foodCategoryService
      .deleteFoodCategory(c.id)
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
    return this.i18n.translate('common.couldNotDelete', {
      entity: this.i18n.translate('foodCategory.entity'),
    });
  }
}
