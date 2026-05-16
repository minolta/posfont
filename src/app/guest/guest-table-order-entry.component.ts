import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { distinctUntilChanged, finalize, switchMap, throwError } from 'rxjs';

import type { PosTable } from '../table/table.model';
import { TableService } from '../table/table.service';
import { CustomerDisplaySessionService } from '../order/customer-display-session.service';
import { foodPickerLabel, tablePickerLabel } from '../order/order-merge.util';
import {
  orderHasWaitingLines,
  orderRequestCompleteAllExceptCanceled,
  resolvedLineStatus,
} from '../order/order-line-status.util';
import type { PayOrderRequest, PosOrder } from '../order/order.model';
import {
  buildPayOrderRequest,
  mergePayOrderAmounts,
  readPosOrderNote,
} from '../order/order-pay.util';
import { OrderService } from '../order/order.service';
import { PromptPayQrDisplayComponent } from '../payment/promptpay-qr-display.component';

/** First unpaid order for table (aligned with Tables list convention). */
function pickOpenOrderForTable(orders: PosOrder[], tableId: number): PosOrder | undefined {
  for (const o of orders) {
    if (o.id == null) {
      continue;
    }
    if (o.table?.id !== tableId || o.paid || o.cancel) {
      continue;
    }
    return o;
  }
  return undefined;
}

function qpTableId(pm: ParamMap): number {
  const n = Number(pm.get('tableId') ?? '');
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

function qpTableCode(pm: ParamMap): string {
  return (pm.get('tableCode') ?? '').trim();
}

function sameGuestTableQuery(a: ParamMap, b: ParamMap): boolean {
  return qpTableId(a) === qpTableId(b) && qpTableCode(a) === qpTableCode(b);
}

@Component({
  selector: 'app-guest-table-order-entry',
  standalone: true,
  imports: [DecimalPipe, FormsModule, PromptPayQrDisplayComponent],
  templateUrl: './guest-table-order-entry.component.html',
  styleUrl: './guest-table-order-entry.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestTableOrderEntryComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly tableService = inject(TableService);
  private readonly customerDisplaySession = inject(CustomerDisplaySessionService);

  readonly error = signal<string | null>(null);
  readonly resolving = signal(true);
  readonly refreshingOrders = signal(false);

  readonly openOrder = signal<PosOrder | null>(null);

  readonly showPayment = signal(false);
  readonly payingId = signal<number | null>(null);
  readonly payError = signal<string | null>(null);
  readonly payInputAmount = signal<string>('');
  readonly payNoteDraft = signal('');
  readonly payNoteError = signal<string | null>(null);

  /** Shows table list until the guest selects a row (requires valid `tableId` in URL). */
  readonly guestPickerMode = signal(false);
  readonly guestTablesLoading = signal(false);
  readonly guestTablesError = signal<string | null>(null);
  readonly guestTablesList = signal<PosTable[]>([]);
  readonly guestTableSearch = signal('');

  /** Active URL context after a selection (never set while {@link guestPickerMode} is on). */
  private readonly routeTableContext = signal<{ id: number; code: string } | null>(null);

  protected readonly filteredGuestTables = computed(() => {
    const q = this.guestTableSearch().trim().toLowerCase();
    const usable = this.guestTablesList().filter(
      (t): t is PosTable & { id: number } => t.id != null && Number.isFinite(t.id) && t.id >= 1,
    );
    const sorted = [...usable].sort((a, b) =>
      tablePickerLabel(a).localeCompare(tablePickerLabel(b)),
    );
    if (!q) {
      return sorted;
    }
    return sorted.filter((t) =>
      `${tablePickerLabel(t)} ${(t.code ?? '').toLowerCase()}`.toLowerCase().includes(q),
    );
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        distinctUntilChanged(sameGuestTableQuery),
      )
      .subscribe((pm) => this.applyGuestRouteParams(pm));
  }

  protected readonly tablePickerLabelFn = tablePickerLabel;

  protected selectGuestTable(t: PosTable): void {
    const id = t.id;
    if (id == null || id < 1) {
      return;
    }
    const code = (t.code ?? '').trim();
    void this.router.navigate(['/guest/order'], {
      queryParams: {
        tableId: String(id),
        ...(code ? { tableCode: code } : {}),
      },
      replaceUrl: true,
    });
  }

  /** Clear query params so the guest picks again (bookmark / typo / wrong QR). */
  protected clearTableAndPickAgain(): void {
    if (this.payingId() !== null || this.showPayment()) {
      return;
    }
    void this.router.navigate(['/guest/order'], {
      queryParams: {},
      replaceUrl: true,
    });
  }

  protected refreshOpenOrder(): void {
    const ctx = this.routeTableContext();
    if (!ctx?.id || ctx.id < 1) {
      return;
    }
    if (this.payingId() !== null || this.showPayment()) {
      return;
    }
    this.refreshingOrders.set(true);
    this.error.set(null);
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        this.refreshingOrders.set(false);
        const open = pickOpenOrderForTable(orders, ctx.id);
        if (!open?.id) {
          this.openOrder.set(null);
          this.goToLinePickerNewOnly();
          return;
        }
        void this.pullOrderDetail(open.id);
      },
      error: () => {
        this.refreshingOrders.set(false);
        this.error.set('Could not refresh your order.');
      },
    });
  }

  protected goAddDishes(): void {
    this.goToLinePickerWithOptionalOpen();
  }

  protected openSettlePayment(): void {
    const o = this.openOrder();
    const ctx = this.routeTableContext();
    if (o?.id == null || o.table?.id == null || ctx == null) {
      return;
    }
    this.payError.set(null);
    this.payNoteError.set(null);
    this.payInputAmount.set(this.payableTotal(o).toFixed(2));
    this.payNoteDraft.set(readPosOrderNote(o) ?? '');

    this.orderService.getOrderRowById(o.id).subscribe({
      next: (fresh) => {
        if (fresh.paid || fresh.cancel || fresh.table?.id !== ctx.id) {
          this.openOrder.set(null);
          this.goToLinePickerNewOnly();
          return;
        }
        this.openOrder.set(fresh);
        this.payNoteDraft.set(readPosOrderNote(fresh) ?? '');
        this.payInputAmount.set(this.payableTotal(fresh).toFixed(2));
        this.showPayment.set(true);
      },
      error: () => {
        this.payError.set('Could not load the latest bill. Try Refresh.');
      },
    });
  }

  protected closePayment(): void {
    if (this.payingId() !== null) {
      return;
    }
    this.showPayment.set(false);
    this.payError.set(null);
    this.payNoteError.set(null);
    this.payInputAmount.set('');
    this.payNoteDraft.set('');
  }

  protected setPayAmount(value: string): void {
    this.payInputAmount.set(value);
  }

  protected payDialogDisplayedOrder(): PosOrder | undefined {
    return this.openOrder() ?? undefined;
  }

  protected confirmCashPay(): void {
    const order = this.payDialogDisplayedOrder();
    if (!order?.id) {
      this.closePayment();
      return;
    }
    const amount = Number(this.payInputAmount());
    const rawPay = buildPayOrderRequest(amount, this.payableTotal(order));
    if ('error' in rawPay) {
      this.payError.set(rawPay.error);
      return;
    }
    this.submitPayment(order, rawPay);
  }

  protected confirmQrPay(): void {
    const order = this.payDialogDisplayedOrder();
    if (!order?.id) {
      this.closePayment();
      return;
    }
    if (this.payQrSettlementDisabled(order)) {
      this.payError.set('Paid by QR needs the entered amount to equal the total (no change).');
      return;
    }
    const due = this.payableTotal(order);
    const rawPay = buildPayOrderRequest(due, due);
    if ('error' in rawPay) {
      this.payError.set(rawPay.error);
      return;
    }
    this.submitPayment(order, { ...rawPay, paidByQrScan: true });
  }

  protected confirmCreditPay(): void {
    const order = this.payDialogDisplayedOrder();
    if (!order?.id) {
      this.closePayment();
      return;
    }
    if (this.payQrSettlementDisabled(order)) {
      this.payError.set('Paid by credit needs the entered amount to equal the total (no change).');
      return;
    }
    const due = this.payableTotal(order);
    const rawPay = buildPayOrderRequest(due, due);
    if ('error' in rawPay) {
      this.payError.set(rawPay.error);
      return;
    }
    this.submitPayment(order, { ...rawPay, paidByCredit: true });
  }

  protected payQrSettlementDisabled(order: PosOrder): boolean {
    const id = order.id ?? 0;
    if (this.payingId() === id || id <= 0) {
      return true;
    }
    const raw = this.payInputAmount().trim();
    if (raw === '') {
      return true;
    }
    const amt = Number(raw);
    if (!Number.isFinite(amt) || amt < 0) {
      return true;
    }
    const due = this.payableTotal(order);
    if (!Number.isFinite(due)) {
      return true;
    }
    const tenderCents = Math.round(amt * 100);
    const dueCents = Math.round(due * 100);
    return tenderCents !== dueCents;
  }

  protected payDialogChange(order: PosOrder): number {
    const tendered = Number(this.payInputAmount());
    const due = this.payableTotal(order);
    if (!Number.isFinite(tendered) || !Number.isFinite(due)) {
      return 0;
    }
    const cents = Math.round(tendered * 100) - Math.round(due * 100);
    if (cents <= 0) {
      return 0;
    }
    return cents / 100;
  }

  protected lineFoodLabel(line: PosOrder['lines'][number]): string {
    const f = line.food;
    if (!f) {
      return 'Unknown item';
    }
    return foodPickerLabel(f);
  }

  protected lineStatusGuestLabel(order: PosOrder): string {
    return orderHasWaitingLines(order)
      ? 'Some dishes are still in the kitchen.'
      : 'Kitchen is up to date with your order.';
  }

  protected lineRowStatusLabel(line: PosOrder['lines'][number], order: PosOrder): string {
    const s = resolvedLineStatus(line, order);
    switch (s) {
      case 'FINISH_COOKING':
        return 'Ready';
      case 'COMPLETE':
        return 'Done';
      case 'CANCEL':
        return 'Canceled';
      default:
        return 'Preparing';
    }
  }

  protected payableTotal(o: PosOrder): number {
    return (o.lines ?? []).reduce((sum, ln) => {
      if (resolvedLineStatus(ln, o) === 'CANCEL') {
        return sum;
      }
      return sum + ln.quantity * ln.unitPrice;
    }, 0);
  }

  /** Table code derived from route (used in dashboard banner). */
  protected guestDisplayTableCode(): string {
    const ctx = this.routeTableContext();
    return ctx?.code?.trim() ?? '';
  }

  private applyGuestRouteParams(pm: ParamMap): void {
    const tid = qpTableId(pm);
    const tcode = qpTableCode(pm);

    this.closePaymentQuiet();
    this.openOrder.set(null);
    this.error.set(null);
    this.showPayment.set(false);
    this.payError.set(null);
    this.payNoteError.set(null);
    this.payInputAmount.set('');
    this.payNoteDraft.set('');

    if (tid < 1) {
      this.routeTableContext.set(null);
      this.guestPickerMode.set(true);
      this.resolving.set(false);
      this.maybeLoadGuestTablesForPicker();
      return;
    }

    this.guestPickerMode.set(false);
    this.routeTableContext.set({ id: tid, code: tcode });
    this.resolving.set(true);
    this.loadGuestEntry();
  }

  private closePaymentQuiet(): void {
    this.showPayment.set(false);
    this.payError.set(null);
    this.payNoteError.set(null);
    this.payInputAmount.set('');
    this.payNoteDraft.set('');
  }

  private maybeLoadGuestTablesForPicker(): void {
    if (this.guestTablesList().length > 0 || this.guestTablesLoading()) {
      return;
    }
    this.guestTablesError.set(null);
    this.guestTablesLoading.set(true);
    this.tableService.getTables().subscribe({
      next: (rows) => {
        this.guestTablesLoading.set(false);
        this.guestTablesList.set(rows);
      },
      error: () => {
        this.guestTablesLoading.set(false);
        this.guestTablesError.set('Could not load tables. Check your connection.');
      },
    });
  }

  private loadGuestEntry(): void {
    const ctx = this.routeTableContext();
    if (!ctx?.id || ctx.id < 1) {
      this.resolving.set(false);
      return;
    }
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        const open = pickOpenOrderForTable(orders, ctx.id);
        if (!open?.id) {
          this.goToLinePickerNewOnly();
          return;
        }
        void this.pullOrderDetail(open.id);
      },
      error: () => {
        this.resolving.set(false);
        this.error.set('Could not reach the POS. Try again.');
      },
    });
  }

  private goToLinePickerNewOnly(): void {
    const ctx = this.routeTableContext();
    if (!ctx?.id || ctx.id < 1) {
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: {
        tableId: String(ctx.id),
        tableCode: ctx.code.trim() ? ctx.code.trim() : null,
        from: 'guest',
      },
      replaceUrl: true,
    });
  }

  private goToLinePickerWithOptionalOpen(): void {
    const ctx = this.routeTableContext();
    if (!ctx?.id || ctx.id < 1) {
      return;
    }
    const o = this.openOrder();
    const qp: Record<string, string | null | undefined> = {
      tableId: String(ctx.id),
      tableCode: ctx.code.trim() ? ctx.code.trim() : null,
      from: 'guest',
    };
    if (o?.id != null) {
      qp['addToOrderId'] = String(o.id);
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: qp,
      replaceUrl: true,
    });
  }

  private pullOrderDetail(id: number): void {
    const ctx = this.routeTableContext();
    this.orderService.getOrderById(id).subscribe({
      next: (full) => {
        this.resolving.set(false);
        if (
          ctx == null ||
          !full?.id ||
          full.table?.id !== ctx.id ||
          full.paid ||
          full.cancel
        ) {
          this.openOrder.set(null);
          this.goToLinePickerNewOnly();
          return;
        }
        this.openOrder.set(full);
      },
      error: () => {
        this.resolving.set(false);
        this.error.set('Could not load your order.');
      },
    });
  }

  private submitPayment(order: PosOrder, payBody: PayOrderRequest): void {
    const ctx = this.routeTableContext();
    if (order.id == null || order.table?.id == null || ctx == null) {
      this.payError.set('This bill cannot be paid from this phone.');
      return;
    }
    const id = order.id;
    const draft = this.payNoteDraft().trim().slice(0, 2000);

    this.payingId.set(id);
    this.payError.set(null);
    this.payNoteError.set(null);

    this.orderService
      .getOrderRowById(id)
      .pipe(
        switchMap((fresh) => {
          const baseBody = orderRequestCompleteAllExceptCanceled(fresh);
          if (baseBody == null) {
            return throwError(() => new Error('Order has no table reference and cannot be updated.'));
          }
          const prepBody = mergePayOrderAmounts({ ...baseBody, note: draft }, payBody);
          return this.orderService.updateOrder(id, prepBody).pipe(
            switchMap(() => this.orderService.payOrder(id, payBody)),
          );
        }),
        finalize(() => this.payingId.set(null)),
      )
      .subscribe({
        next: () => {
          this.customerDisplaySession.focusOrder(id);
          this.closePayment();
          this.openOrder.set(null);
          void this.router.navigate(['/guest/order/confirmed'], {
            queryParams: {
              mode: 'paid',
              tableId: String(ctx.id),
              tableCode: ctx.code.trim() ? ctx.code.trim() : undefined,
            },
            replaceUrl: true,
          });
        },
        error: (err: unknown) => {
          const message = this.extractErrorMessage(
            err,
            'Payment did not complete. Ask staff if you were charged.',
          );
          this.payError.set(message);
          this.payNoteError.set(message);
        },
      });
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim().length > 0) {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.trim().length > 0) {
        return err.error;
      }
      if (err.status >= 400) {
        return `Request failed (HTTP ${err.status})`;
      }
    }
    if (err instanceof Error && err.message.trim().length > 0) {
      return err.message;
    }
    return fallback;
  }
}
