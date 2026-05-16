import { DecimalPipe, DOCUMENT, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  finalize,
  map,
  of,
  switchMap,
  throwError,
  timer,
} from 'rxjs';

import type { Zone } from '../zone/zone.model';
import { PromptPayQrDisplayComponent } from '../payment/promptpay-qr-display.component';
import { UrlQrService } from '../payment/url-qr.service';
import {
  orderRequestCompleteAllExceptCanceled,
  resolvedLineStatus,
} from '../order/order-line-status.util';
import { buildPayOrderRequest, mergePayOrderAmounts, readPosOrderNote } from '../order/order-pay.util';
import {
  CustomerDisplaySessionService,
  CUSTOMER_DISPLAY_WINDOW_NAME,
} from '../order/customer-display-session.service';
import { pingOrderCustomerDisplayRefresh } from '../order/order-customer-display-sync';
import type { OrderLine, OrderLineStatus, PayOrderRequest, PosOrder } from '../order/order.model';
import { OrderService } from '../order/order.service';
import type { PosTable } from './table.model';
import { TableService } from './table.service';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PromptPayQrDisplayComponent],
  templateUrl: './table-list.component.html',
  styleUrl: './table-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableListComponent {
  private readonly tableService = inject(TableService);
  private readonly orderService = inject(OrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly urlQrService = inject(UrlQrService);
  private readonly customerDisplaySession = inject(CustomerDisplaySessionService);
  private readonly injector = inject(Injector);
  private readonly payAmountInputRef = viewChild<ElementRef<HTMLInputElement>>('payAmountInput');

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  /** Shown after creating an order from New order (`/tables?newOrder=…`). */
  readonly newOrderId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('newOrder'))),
    { initialValue: null as string | null },
  );

  readonly searchTerm = signal('');
  readonly refreshNonce = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly payingOrderId = signal<number | null>(null);
  readonly payError = signal<string | null>(null);
  readonly payDialogOrderId = signal<number | null>(null);
  /** Fresh `GET /orders/{id}` while Settle payment is open — includes whole-order `note` when list does not. */
  readonly payDialogOrderDetail = signal<PosOrder | null>(null);
  readonly payDialogNoteDraft = signal('');
  readonly payDialogNoteError = signal<string | null>(null);
  readonly payInputAmount = signal<string>('');
  readonly orderRefreshNonce = signal(0);

  /** Table id when “Order QR” dialog is open; `null` when closed. */
  readonly orderEntryQrTableId = signal<number | null>(null);
  /** Table code (and zone) shown above the QR image. */
  readonly orderEntryQrTableLabel = signal('');
  readonly orderEntryQrUrl = signal('');
  readonly orderEntryQrDataUrl = signal<string | null>(null);
  readonly orderEntryQrError = signal<string | null>(null);

  readonly openOrdersByTable = toSignal(
    toObservable(this.orderRefreshNonce).pipe(
      switchMap(() => this.orderService.getOrders()),
      map((orders) => {
        const byTable = new Map<number, PosOrder>();
        for (const o of orders) {
          const tableId = o.table?.id;
          if (tableId != null && o.id != null && !o.paid && !o.cancel && !byTable.has(tableId)) {
            byTable.set(tableId, o);
          }
        }
        return byTable;
      }),
      catchError(() => of(new Map<number, PosOrder>())),
    ),
    { initialValue: new Map<number, PosOrder>() },
  );

  readonly tables = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.tableService.searchTables(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set('Could not load tables. Check that the API is running.');
                return of([] as PosTable[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as PosTable[] },
  );

  constructor() {
    effect(() => {
      if (this.payDialogOrderId() == null) {
        return;
      }
      afterNextRender(
        () => {
          const el = this.payAmountInputRef()?.nativeElement;
          el?.focus();
          el?.select();
        },
        { injector: this.injector },
      );
    });
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  deleteTable(t: PosTable): void {
    if (t.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`Delete table "${t.code}"?`)) {
      return;
    }
    this.deletingId.set(t.id);
    this.tableService
      .deleteTable(t.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(
            this.extractErrorMessage(
              err,
              'Could not delete table. Check API connectivity and dependencies.',
            ),
          );
        },
      });
  }

  openNewOrder(t: PosTable): void {
    const tableId = t.id;
    if (tableId == null) {
      return;
    }
    if (this.hasBlockedOpenOrder(tableId)) {
      this.openPayDialogForTable(tableId);
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: {
        tableId,
        ...((t.code ?? '').trim() ? { tableCode: (t.code ?? '').trim() } : {}),
      },
    });
  }

  /**
   * Opens a dialog with a QR code that encodes the same URL as “New order” for this table
   * (`/orders/new/line-picker?tableId=…`), for scanning on a phone.
   */
  async openOrderEntryQrDialog(t: PosTable): Promise<void> {
    const tableId = t.id;
    if (tableId == null) {
      return;
    }
    this.orderEntryQrError.set(null);
    this.orderEntryQrDataUrl.set(null);
    this.orderEntryQrTableId.set(tableId);
    this.orderEntryQrTableLabel.set(this.tableOrderQrCaption(t));
    const href = this.newOrderUrlForTable(tableId, t.code);
    this.orderEntryQrUrl.set(href);
    const dataUrl = await this.urlQrService.toDataUrl(href);
    if (dataUrl == null) {
      this.orderEntryQrError.set('Could not create QR code.');
    } else {
      this.orderEntryQrDataUrl.set(dataUrl);
    }
  }

  closeOrderEntryQrDialog(): void {
    this.orderEntryQrTableId.set(null);
    this.orderEntryQrTableLabel.set('');
    this.orderEntryQrUrl.set('');
    this.orderEntryQrDataUrl.set(null);
    this.orderEntryQrError.set(null);
  }

  copyOrderEntryLink(): void {
    const url = this.orderEntryQrUrl().trim();
    if (url.length === 0) {
      return;
    }
    void navigator.clipboard.writeText(url);
  }

  /** Guest/menu URL (`/guest/order`). Guests pick table on device; QR no longer pins `tableId`. */
  newOrderUrlForTable(_tableId: number, _codeRaw?: string): string {
    const tree = this.router.createUrlTree(['/guest/order']);
    const serialized = this.router.serializeUrl(tree);
    const path = this.location.prepareExternalUrl(serialized);
    return new URL(path, this.document.baseURI).href;
  }

  openPayDialogForTable(tableId: number): void {
    const order = this.openOrderByTable(tableId);
    if (!order || order.id == null) {
      this.payError.set('No unpaid open order found for this table.');
      return;
    }
    this.payError.set(null);
    this.payInputAmount.set(this.payableTotal(order).toFixed(2));
    this.payDialogOrderDetail.set(null);
    this.payDialogNoteDraft.set(readPosOrderNote(order) ?? '');
    this.payDialogNoteError.set(null);
    this.payDialogOrderId.set(order.id);
    this.refreshPayDialogOrderFromApi(order.id);
    this.customerDisplaySession.focusOrder(order.id);
  }

  private refreshPayDialogOrderFromApi(orderId: number): void {
    this.orderService.getOrderById(orderId).subscribe({
      next: (full) => {
        if (this.payDialogOrderId() === orderId && full) {
          this.payDialogOrderDetail.set(full);
          this.payDialogNoteDraft.set(readPosOrderNote(full) ?? '');
        }
      },
      error: () => {
        /* map entry still drives the dialog */
      },
    });
  }

  /** Customer-facing summary + PromptPay QR in a new tab (for a tablet facing the guest). */
  openCustomerDisplayPage(orderId: number | null | undefined): void {
    if (orderId == null) {
      return;
    }
    this.customerDisplaySession.focusOrder(orderId);
    const url = this.router.serializeUrl(this.router.createUrlTree(['/orders', 'display']));
    window.open(url, CUSTOMER_DISPLAY_WINDOW_NAME);
  }

  closePayDialog(): void {
    this.payDialogOrderId.set(null);
    this.payDialogOrderDetail.set(null);
    this.payDialogNoteDraft.set('');
    this.payDialogNoteError.set(null);
    this.payInputAmount.set('');
  }

  payDialogOrder(): PosOrder | undefined {
    const orderId = this.payDialogOrderId();
    if (orderId == null) {
      return undefined;
    }
    const detail = this.payDialogOrderDetail();
    if (detail != null && detail.id === orderId) {
      return detail;
    }
    for (const o of this.openOrdersByTable().values()) {
      if (o.id === orderId) {
        return o;
      }
    }
    return undefined;
  }

  confirmPayFromDialog(): void {
    const order = this.payDialogOrder();
    if (!order || order.id == null) {
      this.closePayDialog();
      return;
    }
    const amount = Number(this.payInputAmount());
    const rawPay = buildPayOrderRequest(amount, this.payableTotal(order));
    if ('error' in rawPay) {
      this.payError.set(rawPay.error);
      return;
    }
    this.submitPaymentFromDialog(order, rawPay);
  }

  confirmPayQrFromDialog(): void {
    const order = this.payDialogOrder();
    if (!order || order.id == null) {
      this.closePayDialog();
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
    this.submitPaymentFromDialog(order, { ...rawPay, paidByQrScan: true });
  }

  confirmPayCreditFromDialog(): void {
    const order = this.payDialogOrder();
    if (!order || order.id == null) {
      this.closePayDialog();
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
    this.submitPaymentFromDialog(order, { ...rawPay, paidByCredit: true });
  }

  /** Paid by QR only when the entered amount equals the total (no under/over pay). */
  payQrSettlementDisabled(order: PosOrder): boolean {
    const id = order.id ?? 0;
    if (this.payingOrderId() === id || id <= 0) {
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
    if (tenderCents < dueCents || tenderCents > dueCents) {
      return true;
    }
    return false;
  }

  private submitPaymentFromDialog(order: PosOrder, payBody: PayOrderRequest): void {
    if (order.id == null || order.table?.id == null) {
      this.payError.set('Order has no table reference and cannot be paid.');
      return;
    }
    const id = order.id;
    /** Whole-order note from the dialog — saved on the same PUT as payment (no separate PATCH). */
    const draft = this.payDialogNoteDraft().trim().slice(0, 2000);

    this.payingOrderId.set(id);
    this.payError.set(null);
    this.payDialogNoteError.set(null);

    this.orderService
      .getOrderRowById(id)
      .pipe(
        switchMap((fresh) => {
          const baseBody = orderRequestCompleteAllExceptCanceled(fresh);
          if (baseBody == null) {
            return throwError(
              () => new Error('Order has no table reference and cannot be updated.'),
            );
          }
          const prepBody = mergePayOrderAmounts({ ...baseBody, note: draft }, payBody);
          return this.orderService.updateOrder(id, prepBody).pipe(
            switchMap(() => this.orderService.payOrder(id, payBody)),
          );
        }),
        finalize(() => this.payingOrderId.set(null)),
      )
      .subscribe({
        next: () => {
          this.customerDisplaySession.focusOrder(id);
          this.closePayDialog();
          this.orderRefreshNonce.update((n) => n + 1);
        },
        error: (err: unknown) => {
          const message = this.extractErrorMessage(
            err,
            'Could not record payment (check amount, note, or API).',
          );
          this.payError.set(message);
          this.payDialogNoteError.set(message);
        },
      });
  }

  setPayInputAmount(value: string): void {
    this.payInputAmount.set(value);
  }

  payableTotal(order: PosOrder): number {
    return (order.lines ?? []).reduce((sum, line) => {
      if (this.lineStatus(line, order) === 'CANCEL') {
        return sum;
      }
      return sum + line.quantity * line.unitPrice;
    }, 0);
  }

  /** Cash change when the entered amount is greater than the payable total (cent-safe). */
  payDialogChange(order: PosOrder): number {
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

  lineStatus(line: OrderLine, order: PosOrder): OrderLineStatus {
    return resolvedLineStatus(line, order);
  }

  hasBlockedOpenOrder(tableId: number | null | undefined): boolean {
    return tableId != null && this.openOrdersByTable().has(tableId);
  }

  openOrderByTable(tableId: number | null | undefined): PosOrder | null {
    if (tableId == null) {
      return null;
    }
    return this.openOrdersByTable().get(tableId) ?? null;
  }

  openAddLineForTable(tableId: number): void {
    const order = this.openOrderByTable(tableId);
    if (!order || order.id == null) {
      this.payError.set('No unpaid open order found for this table.');
      return;
    }
    void this.router.navigate(['/orders/new/line-picker'], {
      queryParams: {
        tableId,
        addToOrderId: order.id,
        from: 'tables',
      },
    });
  }

  payableTotalByTable(tableId: number | null | undefined): number {
    const order = this.openOrderByTable(tableId);
    if (!order) {
      return 0;
    }
    return this.payableTotal(order);
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    const d = this.httpErrorDetail(err);
    if (d) {
      return d;
    }
    if (err instanceof Error && err.message.trim().length > 0) {
      return err.message;
    }
    return fallback;
  }

  private httpErrorDetail(err: unknown): string {
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
    return '';
  }

  /** Short label for the Order QR dialog (table code + zone when present). */
  tableOrderQrCaption(t: PosTable): string {
    const code = (t.code ?? '').trim() || (t.id != null ? `Table #${t.id}` : 'Table');
    const z = this.zoneCell(t.zone);
    if (z && z !== '—') {
      return `${code} · ${z}`;
    }
    return code;
  }

  zoneCell(z: Zone | null | undefined): string {
    if (!z) {
      return '—';
    }
    const name = (z.name ?? '').trim();
    const code = (z.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || '—';
  }
}
