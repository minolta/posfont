import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import type { Food } from '../food/food.model';
import { FoodService } from '../food/food.service';
import type { PosTable } from '../table/table.model';
import { TableService } from '../table/table.service';
import {
  defaultDatetimeLocal,
  isoToDatetimeLocal,
  normalizeLocalDateTimeForApi,
} from './order-datetime.util';
import { mergeFoodsFromApis, mergeTablesFromApis, foodPickerLabel, tablePickerLabel } from './order-merge.util';
import type { OrderLine, OrderRequest, PosOrder } from './order.model';
import { mergeOrderRequestPaymentFromPosOrder, readPosOrderChange, readPosOrderPaidPrice } from './order-pay.util';
import { OrderService } from './order.service';

@Component({
  selector: 'app-order-edit',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './order-edit.component.html',
  styleUrl: './order-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly tableService = inject(TableService);
  private readonly foodService = inject(FoodService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly orderId = signal<number | null>(null);
  readonly orderPaid = signal(false);
  readonly paidView = signal<PosOrder | null>(null);
  /** Snapshot from GET; used to re-send `paidPrice` / `change` on PUT when present. */
  private readonly loadedOrder = signal<PosOrder | null>(null);
  readonly tableSearch = signal('');
  readonly foodSearch = signal('');

  readonly tables = signal<PosTable[]>([]);
  readonly foods = signal<Food[]>([]);

  readonly form = this.fb.group({
    orderNo: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    tableId: [''],
    manualTableId: [''],
    orderDate: ['', [Validators.required]],
    complateOrder: [false],
    complateOrderDate: [''],
    cancel: [false],
    version: [0, [Validators.required, Validators.min(0)]],
    lines: this.fb.array([this.newLineGroup()]),
  });

  get lines(): FormArray<FormGroup> {
    return this.form.get('lines') as FormArray<FormGroup>;
  }

  newLineGroup(): FormGroup {
    return this.fb.group({
      foodId: [''],
      manualFoodId: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
    });
  }

  addLine(): void {
    this.lines.push(this.newLineGroup());
  }

  readonly tableOptionLabel = tablePickerLabel;
  readonly foodOptionLabel = foodPickerLabel;

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
  }

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set('Invalid order id.');
            this.orderId.set(null);
            this.orderPaid.set(false);
            this.paidView.set(null);
            this.loadedOrder.set(null);
            return EMPTY;
          }
          this.orderId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          this.orderPaid.set(false);
          this.paidView.set(null);
          return forkJoin({
            order: this.orderService.getOrderById(id).pipe(
              catchError(() => {
                this.loadError.set('Could not load order.');
                return of(undefined as PosOrder | undefined);
              }),
            ),
            tablesApi: this.tableService.getTables().pipe(catchError(() => of([] as PosTable[]))),
            foodsApi: this.foodService.getFoods().pipe(catchError(() => of([] as Food[]))),
            ordersApi: this.orderService.getOrders().pipe(catchError(() => of([]))),
          }).pipe(
            map(({ order, tablesApi, foodsApi, ordersApi }) => ({
              order,
              tables: mergeTablesFromApis(tablesApi, ordersApi),
              foods: mergeFoodsFromApis(foodsApi, ordersApi),
            })),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ order, tables, foods }) => {
        this.tables.set(tables);
        this.foods.set(foods);
        if (!order) {
          if (!this.loadError()) {
            this.loadError.set('Order not found.');
          }
          this.orderPaid.set(false);
          this.paidView.set(null);
          this.loadedOrder.set(null);
          return;
        }
        this.loadError.set(null);
        this.loadedOrder.set(order);
        if (order.paid) {
          this.orderPaid.set(true);
          this.paidView.set(order);
          return;
        }
        this.orderPaid.set(false);
        this.paidView.set(null);
        while (this.lines.length > 0) {
          this.lines.removeAt(0);
        }
        for (const ln of order.lines ?? []) {
          const fid = ln.food?.id;
          this.lines.push(
            this.fb.group({
              foodId: [fid != null ? String(fid) : ''],
              manualFoodId: [fid != null ? String(fid) : ''],
              quantity: [ln.quantity ?? 1, [Validators.required, Validators.min(1)]],
            }),
          );
        }
        if (this.lines.length === 0) {
          this.lines.push(this.newLineGroup());
        }
        const tid = order.table?.id;
        this.form.patchValue({
          orderNo: order.orderNo,
          tableId: tid != null ? String(tid) : '',
          manualTableId: tid != null ? String(tid) : '',
          orderDate: isoToDatetimeLocal(order.orderDate) || defaultDatetimeLocal(),
          complateOrder: order.complateOrder,
          complateOrderDate: order.complateOrderDate
            ? isoToDatetimeLocal(order.complateOrderDate)
            : '',
          cancel: order.cancel,
          version: order.version,
        });
      });
  }

  tableCell(t: PosTable | null | undefined): string {
    if (!t) {
      return '—';
    }
    return tablePickerLabel(t);
  }

  foodLabel(f: Food | null | undefined): string {
    if (!f) {
      return '—';
    }
    return foodPickerLabel(f);
  }

  linesSummary(o: PosOrder): string {
    const lines = o.lines ?? [];
    if (lines.length === 0) {
      return '—';
    }
    return lines
      .map((ln) => {
        const label = this.foodLabel(ln.food);
        return `${ln.quantity}× ${label} @ ${ln.unitPrice}`;
      })
      .join('; ');
  }

  lineStatus(line: OrderLine, order: PosOrder): 'WAIT' | 'COMPLETE' | 'CANCEL' {
    if (line.status) {
      return line.status;
    }
    if (order.cancel) {
      return 'CANCEL';
    }
    if (order.complateOrder || order.paid) {
      return 'COMPLETE';
    }
    return 'WAIT';
  }

  totalPay(o: PosOrder): number {
    return (o.lines ?? []).reduce((sum, ln) => {
      if (this.lineStatus(ln, o) === 'CANCEL') {
        return sum;
      }
      return sum + ln.quantity * ln.unitPrice;
    }, 0);
  }

  paidAmountTendered(o: PosOrder): number | null {
    return readPosOrderPaidPrice(o);
  }

  /** Stored change from API, or paid price minus line total when paid price is known. */
  paidChangeAmount(o: PosOrder): number | null {
    const stored = readPosOrderChange(o);
    if (stored !== null) {
      return stored;
    }
    const t = this.paidAmountTendered(o);
    if (t === null) {
      return null;
    }
    const cents = Math.round(t * 100) - Math.round(this.totalPay(o) * 100);
    if (cents < 0) {
      return null;
    }
    return cents / 100;
  }

  formatDateShort(value: string | null | undefined): string {
    if (!value?.trim()) {
      return '—';
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return value;
    }
    return d.toLocaleString();
  }

  filterTables(ts: PosTable[]): PosTable[] {
    const q = this.tableSearch().trim().toLowerCase();
    const raw = this.form.getRawValue().tableId;
    const selId = Number(raw);
    const base = !q
      ? ts
      : ts.filter((t) => tablePickerLabel(t).toLowerCase().includes(q));
    if (!Number.isFinite(selId) || selId < 1) {
      return base;
    }
    const picked = ts.find((t) => t.id === selId);
    if (!picked || base.some((t) => t.id === selId)) {
      return base;
    }
    return [picked, ...base];
  }

  filterFoodsForLine(fs: Food[], foodIdRaw: string | undefined | null): Food[] {
    const q = this.foodSearch().trim().toLowerCase();
    const selId = Number(foodIdRaw ?? '');
    const base = !q
      ? fs
      : fs.filter((f) => foodPickerLabel(f).toLowerCase().includes(q));
    if (!Number.isFinite(selId) || selId < 1) {
      return base;
    }
    const picked = fs.find((f) => f.id === selId);
    if (!picked || base.some((f) => f.id === selId)) {
      return base;
    }
    return [picked, ...base];
  }

  canSubmitForm(): boolean {
    const f = this.form;
    if (
      f.controls.orderNo.invalid ||
      f.controls.orderDate.invalid ||
      f.controls.version.invalid
    ) {
      return false;
    }
    const ts = this.tables();
    const { tableId, manualTableId } = f.getRawValue();
    const tid =
      ts.length > 0 ? Number(tableId) : Number((manualTableId ?? '').toString().trim());
    if (!Number.isFinite(tid) || tid < 1) {
      return false;
    }
    const fs = this.foods();
    for (const g of this.lines.controls as FormGroup[]) {
      const q = Math.floor(Number(g.get('quantity')?.value));
      const fid =
        fs.length > 0
          ? Number(g.get('foodId')?.value)
          : Number((g.get('manualFoodId')?.value ?? '').toString().trim());
      if (!Number.isFinite(fid) || fid < 1 || !Number.isFinite(q) || q < 1) {
        return false;
      }
    }
    return this.lines.length >= 1;
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.orderId();
    if (id == null || !this.canSubmitForm()) {
      this.form.markAllAsTouched();
      for (const g of this.lines.controls as FormGroup[]) {
        g.markAllAsTouched();
      }
      return;
    }
    const v = this.form.getRawValue();
    const ts = this.tables();
    const fs = this.foods();
    const tableId =
      ts.length > 0 ? Number(v.tableId) : Number((v.manualTableId ?? '').toString().trim());
    const complateRaw = (v.complateOrderDate ?? '').toString().trim();
    const lines = (this.lines.controls as FormGroup[]).map((g) => ({
      foodId:
        fs.length > 0
          ? Number(g.get('foodId')?.value)
          : Number((g.get('manualFoodId')?.value ?? '').toString().trim()),
      quantity: Math.max(1, Math.floor(Number(g.get('quantity')?.value))),
    }));
    const loaded = this.loadedOrder();
    const body = mergeOrderRequestPaymentFromPosOrder(
      {
        orderNo: (v.orderNo ?? '').trim(),
        tableId,
        orderDate: normalizeLocalDateTimeForApi((v.orderDate ?? '').toString()),
        complateOrder: !!v.complateOrder,
        complateOrderDate:
          complateRaw.length > 0 ? normalizeLocalDateTimeForApi(complateRaw) : null,
        cancel: !!v.cancel,
        lines,
        version: Number(v.version),
      },
      loaded,
    );
    this.submitting.set(true);
    this.orderService
      .updateOrder(id, body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/orders'], {
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
    return 'Could not save order.';
  }
}
