import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, map, switchMap } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { KitchenRequest } from './kitchen.model';
import { KitchenService } from './kitchen.service';

@Component({
  selector: 'app-kitchen-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './kitchen-edit.component.html',
  styleUrl: './kitchen-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly kitchenService = inject(KitchenService);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly kitchenId = signal<number | null>(null);

  readonly form = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
    name: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set(
              this.i18n.translate('common.invalidId', {
                entity: this.i18n.translate('kitchen.entity'),
              }),
            );
            this.kitchenId.set(null);
            return EMPTY;
          }
          this.kitchenId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return this.kitchenService.getKitchenById(id).pipe(
            catchError(() => {
              this.loadError.set(
                this.i18n.translate('common.couldNotLoad', {
                  entity: this.i18n.translate('kitchen.entity'),
                }),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((kitchen) => {
        if (!kitchen) {
          this.loadError.set(
            this.i18n.translate('common.notFound', {
              entity: this.i18n.translate('kitchen.entity'),
            }),
          );
          return;
        }
        this.loadError.set(null);
        this.form.patchValue({
          code: kitchen.code,
          name: kitchen.name,
          version: kitchen.version,
        });
      });
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.kitchenId();
    if (id == null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: KitchenRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      version: Number(v.version),
    };
    this.submitting.set(true);
    this.kitchenService
      .updateKitchen(id, body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/kitchens'], {
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
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotSave', {
      entity: this.i18n.translate('kitchen.entity'),
    });
  }
}
