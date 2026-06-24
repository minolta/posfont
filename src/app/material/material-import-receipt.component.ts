import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { parseReceiptTextToMaterialDrafts } from './material-receipt-parse.util';
import { recognizeReceiptImage } from './material-receipt-ocr.service';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-import-receipt',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './material-import-receipt.component.html',
  styleUrl: './material-import-receipt.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialImportReceiptComponent {
  private readonly fb = inject(FormBuilder);
  private readonly materialService = inject(MaterialService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly scanning = signal(false);
  readonly scanProgress = signal(0);
  readonly importing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly resultSummary = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly rawOcrText = signal('');

  readonly buyFrom = signal('');

  readonly draftRows = this.fb.array<FormGroup>([]);

  get rows(): FormArray<FormGroup> {
    return this.draftRows;
  }

  selectedCount(): number {
    return this.rows.controls.filter((g) => !!g.get('selected')?.value).length;
  }

  async onReceiptFileChange(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.errorMessage.set(null);
    this.resultSummary.set(null);
    this.revokePreview();
    this.previewUrl.set(URL.createObjectURL(file));
    this.clearRows();
    this.scanning.set(true);
    this.scanProgress.set(0);
    try {
      const text = await recognizeReceiptImage(file, (pct) => this.scanProgress.set(pct));
      this.rawOcrText.set(text);
      const drafts = parseReceiptTextToMaterialDrafts(text);
      if (drafts.length === 0) {
        this.errorMessage.set(this.i18n.translate('material.receiptNoItems'));
        return;
      }
      for (const d of drafts) {
        this.rows.push(
          this.fb.group({
            selected: [d.selected],
            code: [d.code, [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
            name: [d.name, [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
            unit: [d.unit, [Validators.required, Validators.pattern(/\S/), Validators.maxLength(20)]],
            quantity: [d.quantity, [Validators.required, Validators.min(0.0001)]],
            currentPrice: [d.currentPrice, [Validators.required, Validators.min(0)]],
            brand: ['', Validators.maxLength(255)],
          }),
        );
      }
    } catch {
      this.errorMessage.set(this.i18n.translate('material.receiptScanFailed'));
    } finally {
      this.scanning.set(false);
      this.scanProgress.set(0);
    }
  }

  toggleAllSelected(checked: boolean): void {
    for (const g of this.rows.controls) {
      g.patchValue({ selected: checked });
    }
  }

  importSelected(): void {
    this.errorMessage.set(null);
    this.resultSummary.set(null);
    const buyFrom = this.buyFrom().trim();
    const picked = this.rows.controls
      .filter((g) => !!g.get('selected')?.value)
      .map((g) => {
        const v = g.getRawValue();
        const brand = String(v.brand ?? '').trim();
        return {
          code: String(v.code ?? '').trim(),
          name: String(v.name ?? '').trim(),
          unit: String(v.unit ?? '').trim(),
          quantity: Math.max(0.0001, Number(v.quantity) || 0),
          currentPrice: Math.max(0, Number(v.currentPrice) || 0),
          ...(brand ? { brand } : {}),
          ...(buyFrom ? { buyFrom } : {}),
        };
      })
      .filter((r) => r.code && r.name && r.unit && r.quantity > 0);
    if (picked.length === 0) {
      this.errorMessage.set(this.i18n.translate('material.receiptNothingSelected'));
      return;
    }
    for (const g of this.rows.controls) {
      if (g.get('selected')?.value) {
        g.markAllAsTouched();
      }
    }
    const invalid = this.rows.controls.some(
      (g) => g.get('selected')?.value && g.invalid,
    );
    if (invalid) {
      this.errorMessage.set(this.i18n.translate('material.receiptFixRows'));
      return;
    }
    this.importing.set(true);
    this.materialService
      .bulkCreateMaterials(picked)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (res) => {
          const skipped = res.skipped?.length ?? 0;
          const updated = res.updatedCount ?? 0;
          this.resultSummary.set(
            this.i18n.translate('material.receiptImportDone', {
              created: res.createdCount,
              updated,
              skipped,
            }),
          );
          const ok = res.createdCount + updated;
          if (ok > 0 && skipped === 0) {
            void this.router.navigate(['/materials'], {
              queryParams: { imported: ok },
            });
          }
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.formatHttpError(err));
        },
      });
  }

  private clearRows(): void {
    while (this.rows.length > 0) {
      this.rows.removeAt(0);
    }
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
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
    return this.i18n.translate('material.receiptImportFailed');
  }
}
