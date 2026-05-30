import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { NewKitchenRequest } from './kitchen.model';
import { KitchenService } from './kitchen.service';

@Component({
  selector: 'app-kitchen-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './kitchen-add-new.component.html',
  styleUrl: './kitchen-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly kitchenService = inject(KitchenService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
    name: [
      '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)],
    ],
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: NewKitchenRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
    };
    this.submitting.set(true);
    this.kitchenService.createKitchen(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/kitchens'], {
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
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotCreate', {
      entity: this.i18n.translate('kitchen.entity'),
    });
  }
}
