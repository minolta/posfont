import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { entityIdNumber, sameEntityId } from '../common/entity-id.util';
import { foodBlocksOrderLines, type Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import type { PosTable } from '../table/table.model';
import { TableService } from '../table/table.service';
import { defaultDatetimeLocal, normalizeLocalDateTimeForApi } from './order-datetime.util';
import { foodPickerLabel, tablePickerLabel } from './order-merge.util';
import { trimNewLineNote } from './order-line-note.util';
import type { OrderRequest } from './order.model';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { OrderService } from './order.service';

@Component({
  selector: 'app-order-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './order-add-new.component.html',
  styleUrl: './order-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderAddNewComponent {
  private static readonly DRAFT_KEY = 'order-add-new-draft-v1';
  private static readonly PICKED_LINES_KEY = 'order-add-picked-lines-v1';
  private readonly fb = inject(FormBuilder);
  private readonly orderService = inject(OrderService);
  private readonly tableService = inject(TableService);
  private readonly foodService = inject(FoodService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly tableSearch = signal('');
  readonly foodSearch = signal('');

  readonly tables = toSignal(
    this.tableService.getTables().pipe(catchError(() => of([] as PosTable[]))),
    { initialValue: [] as PosTable[] },
  );

  readonly foods = toSignal(
    this.foodService.getFoods().pipe(catchError(() => of([] as Food[]))),
    { initialValue: [] as Food[] },
  );

  readonly form = this.fb.group({
    tableId: [''],
    manualTableId: [''],
    orderDate: [defaultDatetimeLocal(), [Validators.required]],
    complateOrder: [false],
    complateOrderDate: [''],
    cancel: [false],
    version: [0, [Validators.required, Validators.min(0)]],
    orderNote: ['', [Validators.maxLength(2000)]],
    lines: this.fb.array([this.newLineGroup()]),
  });

  constructor() {
    this.restoreDraft();
    effect(() => {
      this.pruneStaleSelections(this.tables(), this.foods());
    });
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((qpm) => {
        const qTableId = Number(qpm.get('tableId') ?? '');
        if (Number.isFinite(qTableId) && qTableId > 0) {
          const asText = String(qTableId);
          this.form.patchValue({
            tableId: asText,
            manualTableId: asText,
          });
        }
        const pickFoodId = Number(qpm.get('pickFoodId') ?? '');
        const pickQty = Number(qpm.get('pickQty') ?? '1');
        if (Number.isFinite(pickFoodId) && pickFoodId > 0) {
          this.insertPickedFoodLine(
            pickFoodId,
            Number.isFinite(pickQty) && pickQty > 0 ? Math.floor(pickQty) : 1,
          );
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { pickFoodId: null, pickQty: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
        this.consumePickedQueue();
      });
  }

  get lines(): FormArray<FormGroup> {
    return this.form.get('lines') as FormArray<FormGroup>;
  }

  newLineGroup(): FormGroup {
    return this.fb.group({
      foodId: [''],
      manualFoodId: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      note: ['', [Validators.maxLength(500)]],
    });
  }

  addLine(): void {
    this.lines.push(this.newLineGroup());
  }

  linePickerQueryParams(): Record<string, string | null> {
    const raw = this.form.getRawValue();
    const tableId = this.resolveTableId(raw.tableId, raw.manualTableId, this.tables());
    const idOk = tableId != null;
    const picked = idOk ? this.tables().find((t) => sameEntityId(t.id, tableId)) : undefined;
    const code = (picked?.code ?? '').trim();
    return {
      tableId: idOk ? String(tableId) : null,
      tableCode: idOk && code ? code : null,
    };
  }

  openLinePicker(): void {
    this.saveDraft();
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: this.linePickerQueryParams(),
    });
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  readonly tableOptionLabel = tablePickerLabel;
  readonly foodOptionLabel = foodPickerLabel;

  filterTables(ts: PosTable[]): PosTable[] {
    const q = this.tableSearch().trim().toLowerCase();
    const raw = this.form.getRawValue().tableId;
    const selId = entityIdNumber(raw);
    const base = !q
      ? ts
      : ts.filter((t) => tablePickerLabel(t).toLowerCase().includes(q));
    if (selId == null) {
      return base;
    }
    const picked = ts.find((t) => sameEntityId(t.id, selId));
    if (!picked || base.some((t) => sameEntityId(t.id, selId))) {
      return base;
    }
    return [picked, ...base];
  }

  filterFoodsForLine(fs: Food[], foodIdRaw: string | undefined | null): Food[] {
    const q = this.foodSearch().trim().toLowerCase();
    const selId = entityIdNumber(foodIdRaw);
    const base = !q
      ? fs.filter((f) => !foodBlocksOrderLines(f))
      : fs.filter(
          (f) =>
            !foodBlocksOrderLines(f) && foodPickerLabel(f).toLowerCase().includes(q),
        );
    if (selId == null) {
      return base;
    }
    const picked = fs.find((f) => sameEntityId(f.id, selId));
    if (!picked || base.some((f) => sameEntityId(f.id, selId))) {
      return base;
    }
    return [picked, ...base];
  }

  canSubmit(): boolean {
    const f = this.form;
    if (f.controls.orderDate.invalid || f.controls.version.invalid) {
      return false;
    }
    const ts = this.tables();
    const { tableId, manualTableId } = f.getRawValue();
    const tid = this.resolveTableId(tableId, manualTableId, ts);
    if (tid == null) {
      return false;
    }
    const fs = this.foods();
    for (const g of this.lines.controls as FormGroup[]) {
      const q = Math.floor(Number(g.get('quantity')?.value));
      const fid = this.resolveLineFoodId(g, fs);
      if (fid == null || !Number.isFinite(q) || q < 1) {
        return false;
      }
      const foodMeta = fs.length > 0 ? fs.find((fx) => sameEntityId(fx.id, fid)) : undefined;
      if (foodMeta && foodBlocksOrderLines(foodMeta)) {
        return false;
      }
    }
    return this.lines.length >= 1;
  }

  submit(): void {
    this.errorMessage.set(null);
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      for (const g of this.lines.controls as FormGroup[]) {
        g.markAllAsTouched();
      }
      return;
    }
    const v = this.form.getRawValue();
    const ts = this.tables();
    const fs = this.foods();
    const tableId = this.resolveTableId(v.tableId, v.manualTableId, ts);
    if (tableId == null) {
      this.errorMessage.set(this.i18n.translate('order.invalidTableOrFood'));
      return;
    }
    const complateRaw = (v.complateOrderDate ?? '').toString().trim();
    const lines = (this.lines.controls as FormGroup[]).map((g) => {
      const foodId = this.resolveLineFoodId(g, fs);
      if (foodId == null) {
        return null;
      }
      const quantity = Math.max(1, Math.floor(Number(g.get('quantity')?.value)));
      const note = trimNewLineNote(g.get('note')?.value);
      return {
        foodId,
        quantity,
        ...(note !== undefined ? { note } : {}),
      };
    });
    if (lines.some((ln) => ln == null)) {
      this.errorMessage.set(this.i18n.translate('order.invalidTableOrFood'));
      return;
    }
    const orderNote = (v.orderNote ?? '').toString().trim().slice(0, 2000);
    const body: OrderRequest = {
      tableId,
      orderDate: normalizeLocalDateTimeForApi((v.orderDate ?? '').toString()),
      complateOrder: !!v.complateOrder,
      complateOrderDate:
        complateRaw.length > 0 ? normalizeLocalDateTimeForApi(complateRaw) : null,
      cancel: !!v.cancel,
      lines: lines as OrderRequest['lines'],
      version: Number(v.version),
      ...(orderNote.length > 0 ? { note: orderNote } : {}),
    };
    this.submitting.set(true);
    this.orderService
      .getOrders()
      .pipe(
        switchMap((orders) => {
          const hasOpenUnpaidOnSameTable = orders.some(
            (o) => sameEntityId(o.table?.id, tableId) && !o.paid && !o.cancel,
          );
          if (hasOpenUnpaidOnSameTable) {
            this.errorMessage.set(this.i18n.translate('order.tableHasOpenOrder'));
            return of(null);
          }
          return this.orderService.createOrder(body);
        }),
      )
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          if (!created) {
            return;
          }
          sessionStorage.removeItem(OrderAddNewComponent.DRAFT_KEY);
          void this.router.navigate(['/tables'], {
            queryParams: { newOrder: created.id },
          });
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.formatHttpError(err));
        },
      });
  }

  private insertPickedFoodLine(foodId: number, qty: number): void {
    const controls = this.lines.controls as FormGroup[];
    const existingIdx = controls.findIndex((g) => {
      const v = g.getRawValue();
      const foodIdText = String(v.foodId ?? '').trim();
      const manualIdText = String(v.manualFoodId ?? '').trim();
      const fid = entityIdNumber(foodIdText || manualIdText);
      return fid != null && fid === foodId;
    });
    if (existingIdx >= 0) {
      const existing = this.lines.at(existingIdx) as FormGroup;
      const curr = Math.max(1, Math.floor(Number(existing.get('quantity')?.value)));
      existing.patchValue({ quantity: curr + qty });
      return;
    }

    const emptyIdx = controls.findIndex((g) => {
      const v = g.getRawValue();
      return !String(v.foodId ?? '').trim() && !String(v.manualFoodId ?? '').trim();
    });
    const index = emptyIdx >= 0 ? emptyIdx : controls.length;
    if (emptyIdx < 0) {
      this.addLine();
    }
    const target = (this.lines.at(index) as FormGroup) ?? this.lines.at(this.lines.length - 1);
    target.patchValue({
      foodId: String(foodId),
      manualFoodId: String(foodId),
      quantity: qty,
    });
  }

  private saveDraft(): void {
    const raw = this.form.getRawValue();
    const lines = (this.lines.controls as FormGroup[]).map((g) => {
      const v = g.getRawValue();
      return {
        foodId: String(v.foodId ?? ''),
        manualFoodId: String(v.manualFoodId ?? ''),
        quantity: Math.max(1, Math.floor(Number(v.quantity ?? 1))),
        note: String(v.note ?? ''),
      };
    });
    const draft = {
      tableId: String(raw.tableId ?? ''),
      manualTableId: String(raw.manualTableId ?? ''),
      orderDate: String(raw.orderDate ?? ''),
      complateOrder: !!raw.complateOrder,
      complateOrderDate: String(raw.complateOrderDate ?? ''),
      cancel: !!raw.cancel,
      version: Number(raw.version ?? 0),
      orderNote: String(raw.orderNote ?? ''),
      lines,
    };
    sessionStorage.setItem(OrderAddNewComponent.DRAFT_KEY, JSON.stringify(draft));
  }

  private consumePickedQueue(): void {
    const text = sessionStorage.getItem(OrderAddNewComponent.PICKED_LINES_KEY);
    if (!text) {
      return;
    }
    try {
      const arr = JSON.parse(text) as Array<{ foodId?: number; qty?: number }>;
      for (const item of arr) {
        const foodId = Number(item.foodId ?? 0);
        const qty = Math.max(1, Math.floor(Number(item.qty ?? 1)));
        if (Number.isFinite(foodId) && foodId > 0) {
          this.insertPickedFoodLine(foodId, qty);
        }
      }
    } finally {
      sessionStorage.removeItem(OrderAddNewComponent.PICKED_LINES_KEY);
    }
  }

  private restoreDraft(): void {
    const text = sessionStorage.getItem(OrderAddNewComponent.DRAFT_KEY);
    if (!text) {
      return;
    }
    try {
      const d = JSON.parse(text) as {
        tableId?: string;
        manualTableId?: string;
        orderDate?: string;
        complateOrder?: boolean;
        complateOrderDate?: string;
        cancel?: boolean;
        version?: number;
        orderNote?: string;
        lines?: Array<{ foodId?: string; manualFoodId?: string; quantity?: number; note?: string }>;
      };
      this.form.patchValue({
        tableId: d.tableId ?? '',
        manualTableId: d.manualTableId ?? '',
        orderDate: d.orderDate ?? defaultDatetimeLocal(),
        complateOrder: !!d.complateOrder,
        complateOrderDate: d.complateOrderDate ?? '',
        cancel: !!d.cancel,
        version: Number(d.version ?? 0),
        orderNote: d.orderNote ?? '',
      });
      while (this.lines.length > 0) {
        this.lines.removeAt(0);
      }
      const draftLines = d.lines ?? [];
      if (draftLines.length === 0) {
        this.lines.push(this.newLineGroup());
      } else {
        for (const ln of draftLines) {
          this.lines.push(
            this.fb.group({
              foodId: [String(ln.foodId ?? '')],
              manualFoodId: [String(ln.manualFoodId ?? '')],
              quantity: [Math.max(1, Math.floor(Number(ln.quantity ?? 1))), [Validators.required, Validators.min(1)]],
              note: [String(ln.note ?? ''), [Validators.maxLength(500)]],
            }),
          );
        }
      }
    } catch {
      sessionStorage.removeItem(OrderAddNewComponent.DRAFT_KEY);
    }
  }

  private resolveTableId(
    tableIdRaw: unknown,
    manualTableIdRaw: unknown,
    ts: PosTable[],
  ): number | null {
    if (ts.length > 0) {
      const id = entityIdNumber(tableIdRaw) ?? entityIdNumber(manualTableIdRaw);
      if (id == null || !ts.some((t) => sameEntityId(t.id, id))) {
        return null;
      }
      return id;
    }
    return entityIdNumber(manualTableIdRaw);
  }

  private resolveLineFoodId(g: FormGroup, fs: Food[]): number | null {
    const v = g.getRawValue();
    if (fs.length > 0) {
      const id = entityIdNumber(v.foodId) ?? entityIdNumber(v.manualFoodId);
      if (id == null || !fs.some((f) => sameEntityId(f.id, id))) {
        return null;
      }
      return id;
    }
    return entityIdNumber(v.manualFoodId);
  }

  private pruneStaleSelections(ts: PosTable[], fs: Food[]): void {
    const raw = this.form.getRawValue();
    const patch: {
      tableId?: string;
      manualTableId?: string;
    } = {};
    if (ts.length > 0) {
      const tableId = this.resolveTableId(raw.tableId, raw.manualTableId, ts);
      if (tableId == null && (entityIdNumber(raw.tableId) != null || entityIdNumber(raw.manualTableId) != null)) {
        patch.tableId = '';
        patch.manualTableId = '';
      }
    }
    if (Object.keys(patch).length > 0) {
      this.form.patchValue(patch, { emitEvent: false });
    }
    if (fs.length > 0) {
      for (const g of this.lines.controls as FormGroup[]) {
        const v = g.getRawValue();
        const foodId = this.resolveLineFoodId(g, fs);
        if (
          foodId == null &&
          (entityIdNumber(v.foodId) != null || entityIdNumber(v.manualFoodId) != null)
        ) {
          g.patchValue({ foodId: '', manualFoodId: '' }, { emitEvent: false });
        }
      }
    }
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      let msg = '';
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string') {
          msg = m;
        }
      } else if (typeof err.error === 'string' && err.error.length > 0) {
        msg = err.error;
      }
      const lower = msg.toLowerCase();
      if (
        lower.includes('still referenced elsewhere') ||
        lower.includes('missing or was deleted') ||
        (lower.includes('table id') && lower.includes('not found')) ||
        (lower.includes('food id') && lower.includes('not found'))
      ) {
        return this.i18n.translate('order.invalidTableOrFood');
      }
      if (msg) {
        return msg;
      }
      return err.message || this.i18n.translate('common.requestFailedHttp', { status: err.status });
    }
    return this.i18n.translate('order.couldNotCreate');
  }
}
