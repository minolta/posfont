import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, map, switchMap } from 'rxjs';

import type { FoodCategoryRequest } from '../food/food.model';
import { FoodCategoryService } from './food-category.service';

@Component({
  selector: 'app-food-category-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './food-category-edit.component.html',
  styleUrl: './food-category-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodCategoryEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly foodCategoryService = inject(FoodCategoryService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly categoryId = signal<number | null>(null);

  readonly form = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
    name: ['', [Validators.maxLength(255)]],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set('Invalid category id.');
            this.categoryId.set(null);
            return EMPTY;
          }
          this.categoryId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return this.foodCategoryService.getFoodCategoryById(id).pipe(
            catchError(() => {
              this.loadError.set('Could not load category.');
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((cat) => {
        if (!cat) {
          this.loadError.set('Category not found.');
          return;
        }
        this.loadError.set(null);
        this.form.patchValue({
          code: cat.code,
          name: cat.name ?? '',
          version: cat.version,
        });
      });
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.categoryId();
    if (id == null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: FoodCategoryRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim() || undefined,
      version: Number(v.version),
    };
    this.submitting.set(true);
    this.foodCategoryService
      .updateFoodCategory(id, body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/food-categories'], {
            queryParams: { updated: id },
          });
        },
        error: (err: unknown) => {
          this.saveError.set(this.formatHttpError(err));
        },
      });
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const b = err.error;
      if (typeof b === 'object' && b !== null && 'message' in b) {
        const m = (b as { message?: unknown }).message;
        if (typeof m === 'string') {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.length > 0) {
        return err.error;
      }
      return err.message || `Request failed (${err.status})`;
    }
    return 'Could not save category.';
  }
}
