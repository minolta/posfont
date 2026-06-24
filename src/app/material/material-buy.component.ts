import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import { entityIdNumber, sameEntityId } from '../common/entity-id.util';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { Material } from './material.model';
import { materialOptionLabel, readMaterialBrand, readMaterialCurrentPrice, readMaterialQuantity } from './material.model';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-buy',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, DecimalPipe],
  templateUrl: './material-buy.component.html',
  styleUrl: './material-buy.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialBuyComponent {
  private readonly fb = inject(FormBuilder);
  private readonly materialService = inject(MaterialService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly resultSummary = signal<string | null>(null);
  readonly materialSearch = signal('');

  readonly materials = toSignal(
    this.materialService.getMaterials().pipe(catchError(() => of([] as Material[]))),
    { initialValue: [] as Material[] },
  );

  readonly form = this.fb.group({
    buyFrom: ['', Validators.maxLength(255)],
    lines: this.fb.array([this.newLineGroup()]),
  });

  get lines(): FormArray<FormGroup> {
    return this.form.get('lines') as FormArray<FormGroup>;
  }

  readonly materialOptionLabel = materialOptionLabel;
  readonly readMaterialQuantity = readMaterialQuantity;
  readonly readMaterialCurrentPrice = readMaterialCurrentPrice;

  newLineGroup(): FormGroup {
    return this.fb.group({
      materialId: ['', Validators.required],
      brand: ['', Validators.maxLength(255)],
      quantity: [1, [Validators.required, Validators.min(0.0001)]],
      currentPrice: [0, [Validators.required, Validators.min(0)]],
    });
  }

  addLine(): void {
    this.lines.push(this.newLineGroup());
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  filterMaterials(ms: Material[], materialIdRaw: string | undefined | null): Material[] {
    const q = this.materialSearch().trim().toLowerCase();
    const selId = entityIdNumber(materialIdRaw);
    const base = !q
      ? ms
      : ms.filter((m) => materialOptionLabel(m).toLowerCase().includes(q));
    if (selId == null) {
      return base;
    }
    const picked = ms.find((m) => sameEntityId(m.id, selId));
    if (!picked || base.some((m) => sameEntityId(m.id, selId))) {
      return base;
    }
    return [picked, ...base];
  }

  selectedMaterial(materialIdRaw: string | undefined | null): Material | undefined {
    const id = entityIdNumber(materialIdRaw);
    if (id == null) {
      return undefined;
    }
    return this.materials().find((m) => sameEntityId(m.id, id));
  }

  lineTotal(materialIdRaw: string | undefined | null, qtyRaw: unknown, priceRaw: unknown): number {
    const qty = Number(qtyRaw);
    const price = Number(priceRaw);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) {
      return 0;
    }
    return Math.round(qty * price * 100) / 100;
  }

  purchaseTotal(): number {
    let sum = 0;
    for (const g of this.lines.controls) {
      const v = g.getRawValue();
      sum += this.lineTotal(v.materialId, v.quantity, v.currentPrice);
    }
    return Math.round(sum * 100) / 100;
  }

  onMaterialPicked(line: FormGroup): void {
    const id = entityIdNumber(line.get('materialId')?.value);
    if (id == null) {
      return;
    }
    const m = this.materials().find((x) => sameEntityId(x.id, id));
    if (m == null) {
      return;
    }
    const price = readMaterialCurrentPrice(m);
    if (price > 0 && Number(line.get('currentPrice')?.value) === 0) {
      line.patchValue({ currentPrice: price });
    }
    const brand = readMaterialBrand(m);
    if (brand && !String(line.get('brand')?.value ?? '').trim()) {
      line.patchValue({ brand });
    }
  }

  canSubmit(): boolean {
    if (this.materials().length === 0) {
      return false;
    }
    return this.lines.length > 0 && this.lines.controls.every((g) => g.valid);
  }

  submit(): void {
    this.errorMessage.set(null);
    this.resultSummary.set(null);
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      for (const g of this.lines.controls) {
        g.markAllAsTouched();
      }
      if (this.materials().length === 0) {
        this.errorMessage.set(this.i18n.translate('material.buyNoMaterials'));
      }
      return;
    }

    const ms = this.materials();
    const buyFrom = String(this.form.get('buyFrom')?.value ?? '').trim();
    const rows: Array<{
      code: string;
      name: string;
      unit: string;
      quantity: number;
      currentPrice: number;
      brand?: string;
      buyFrom?: string;
    }> = [];
    for (const g of this.lines.controls) {
      const v = g.getRawValue();
      const id = entityIdNumber(v.materialId);
      const m = id != null ? ms.find((x) => sameEntityId(x.id, id)) : undefined;
      if (!m?.code?.trim()) {
        continue;
      }
      const brand = String(v.brand ?? '').trim();
      rows.push({
        code: m.code.trim(),
        name: (m.name ?? m.code).trim(),
        unit: (m.unit ?? 'pcs').trim(),
        quantity: Math.max(0.0001, Number(v.quantity) || 0),
        currentPrice: Math.max(0, Number(v.currentPrice) || 0),
        ...(brand ? { brand } : {}),
        ...(buyFrom ? { buyFrom } : {}),
      });
    }
    if (rows.length === 0) {
      this.errorMessage.set(this.i18n.translate('material.buyPickMaterial'));
      return;
    }

    this.submitting.set(true);
    this.materialService
      .bulkCreateMaterials(rows)
      .pipe(finalize(() => this.submitting.set(false)))
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
    return this.i18n.translate('material.buyFailed');
  }
}
