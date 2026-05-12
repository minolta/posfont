import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import type { NewFoodCategoryRequest } from '../food/food.model';
import { FoodCategoryService } from './food-category.service';

@Component({
  selector: 'app-food-category-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './food-category-add-new.component.html',
  styleUrl: './food-category-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodCategoryAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
    name: ['', [Validators.maxLength(255)]],
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: NewFoodCategoryRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim() || undefined,
    };
    this.submitting.set(true);
    this.foodCategoryService
      .createFoodCategory(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/food-categories'], {
            queryParams: { created: created.id },
          });
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.formatHttpError(err));
        },
      });
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string') {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.length > 0) {
        return err.error;
      }
      return err.message || `Request failed (${err.status})`;
    }
    return 'Could not create category.';
  }
}
