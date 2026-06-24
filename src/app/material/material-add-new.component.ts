import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { NewMaterialRequest } from './material.model';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './material-add-new.component.html',
  styleUrl: './material-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly materialService = inject(MaterialService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    unit: ['pcs', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(20)]],
    quantity: [0, [Validators.required, Validators.min(0)]],
    currentPrice: [0, [Validators.required, Validators.min(0)]],
    brand: ['', Validators.maxLength(255)],
    buyFrom: ['', Validators.maxLength(255)],
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: NewMaterialRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      unit: (v.unit ?? '').trim(),
      quantity: Math.max(0, Number(v.quantity) || 0),
      currentPrice: Math.max(0, Number(v.currentPrice) || 0),
      brand: (v.brand ?? '').trim() || undefined,
      buyFrom: (v.buyFrom ?? '').trim() || undefined,
    };
    this.submitting.set(true);
    this.materialService
      .createMaterial(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/materials'], {
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
      return err.message || this.i18n.translate('common.requestFailedHttp', { status: err.status });
    }
    return this.i18n.translate('common.couldNotCreate', {
      entity: this.i18n.translate('material.entity'),
    });
  }
}
