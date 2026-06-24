import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, finalize, map, switchMap } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { MaterialRequest } from './material.model';
import { readMaterialBrand, readMaterialBuyFrom, readMaterialCurrentPrice, readMaterialQuantity } from './material.model';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './material-edit.component.html',
  styleUrl: './material-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly materialService = inject(MaterialService);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly materialId = signal<number | null>(null);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    unit: ['pcs', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(20)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    currentPrice: [0, [Validators.required, Validators.min(0)]],
    brand: ['', Validators.maxLength(255)],
    buyFrom: ['', Validators.maxLength(255)],
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
                entity: this.i18n.translate('material.entity'),
              }),
            );
            this.materialId.set(null);
            return EMPTY;
          }
          this.materialId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return this.materialService.getMaterialById(id).pipe(
            catchError(() => {
              this.loadError.set(
                this.i18n.translate('common.couldNotLoad', {
                  entity: this.i18n.translate('material.entity'),
                }),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((mat) => {
        if (!mat) {
          this.loadError.set(
            this.i18n.translate('common.notFound', {
              entity: this.i18n.translate('material.entity'),
            }),
          );
          return;
        }
        this.loadError.set(null);
        this.form.patchValue({
          code: mat.code,
          name: mat.name,
          unit: mat.unit,
          quantity: readMaterialQuantity(mat),
          currentPrice: readMaterialCurrentPrice(mat),
          brand: readMaterialBrand(mat),
          buyFrom: readMaterialBuyFrom(mat),
          version: mat.version,
        });
      });
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.materialId();
    if (id == null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: MaterialRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      unit: (v.unit ?? '').trim(),
      quantity: Math.max(0, Number(v.quantity) || 0),
      currentPrice: Math.max(0, Number(v.currentPrice) || 0),
      brand: (v.brand ?? '').trim() || null,
      buyFrom: (v.buyFrom ?? '').trim() || null,
      version: Number(v.version),
    };
    this.submitting.set(true);
    this.materialService
      .updateMaterial(id, body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/materials'], {
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
      return err.message || this.i18n.translate('common.requestFailedHttp', { status: err.status });
    }
    return this.i18n.translate('common.couldNotSave', {
      entity: this.i18n.translate('material.entity'),
    });
  }
}
