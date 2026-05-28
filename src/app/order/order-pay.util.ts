import type { TranslationKey } from '../i18n/translations';
import type {
  OrderLineRequest,
  OrderRequest,
  PatchOrderNoteRequest,
  PayOrderRequest,
  PosOrder,
} from './order.model';

export type PayOrderRequestResult = PayOrderRequest | { error: TranslationKey };

const PAID_PRICE_KEYS = [
  'paidPrice',
  'paid_price',
  'paidprice',
  'amountTendered',
  'amount_tendered',
  'amountReceived',
  'amount_received',
  'payAmount',
  'pay_amount',
] as const;

const CHANGE_KEYS = [
  'change',
  'changeAmount',
  'change_amount',
  'cashChange',
  'cash_change',
  'giveChange',
  'give_change',
  'paidChange',
  'paid_change',
] as const;

function firstFiniteNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const v = record[key];
    if (v === undefined || v === null || v === '') {
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
}

/** Reads amount paid (tendered) from order JSON. */
export function readPosOrderPaidPrice(o: PosOrder): number | null {
  return firstFiniteNumber(o as unknown as Record<string, unknown>, PAID_PRICE_KEYS);
}

/** Reads change from order JSON. */
export function readPosOrderChange(o: PosOrder): number | null {
  return firstFiniteNumber(o as unknown as Record<string, unknown>, CHANGE_KEYS);
}

/** True when settlement was recorded as QR / mobile scan (`paidByQrScan` / `paid_by_qr_scan` on API JSON). */
export function readOrderPaidByQrScan(o: PosOrder): boolean {
  if (o.paidByQrScan === true) {
    return true;
  }
  const r = o as unknown as Record<string, unknown>;
  const v = r['paid_by_qr_scan'];
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** True when settlement was recorded as card/credit (`paidByCredit` / `paid_by_credit`). */
export function readOrderPaidByCredit(o: PosOrder): boolean {
  if (o.paidByCredit === true) {
    return true;
  }
  const r = o as unknown as Record<string, unknown>;
  const v = r['paid_by_credit'];
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** Whole-order note from API (`orderNote` / `order_note` / `note`). Order-specific keys first — if `note` is `""`, `??` must not block `orderNote`. */
export function readPosOrderNote(o: PosOrder): string | null {
  const r = o as unknown as Record<string, unknown>;
  for (const key of ['orderNote', 'order_note', 'note', 'Note'] as const) {
    const v = r[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim().slice(0, 2000);
    }
  }
  return null;
}

/** Trim for PUT/POST; max 2000 to match server. */
export function trimOrderNote(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const t = raw.trim().slice(0, 2000);
  return t.length > 0 ? t : undefined;
}

/** i18n key for how the order was settled (cash, QR, or credit). */
export function orderPaymentMethodKey(o: PosOrder): TranslationKey {
  if (readOrderPaidByQrScan(o)) {
    return 'payment.qrScan';
  }
  if (readOrderPaidByCredit(o)) {
    return 'payment.creditCard';
  }
  return 'payment.cash';
}

function finiteField(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(v * 100) / 100;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
}

/** Include on `OrderRequest` PUT/POST so the API can persist `paidPrice` / `change` on PosOrder. */
export function paymentFieldsForOrderRequest(
  o: PosOrder,
): Partial<Pick<OrderRequest, 'paidPrice' | 'change'>> {
  let paid = readPosOrderPaidPrice(o);
  if (paid === null && typeof o.paidPrice === 'number' && Number.isFinite(o.paidPrice)) {
    paid = Math.round(o.paidPrice * 100) / 100;
  }
  let change = readPosOrderChange(o);
  if (change === null && typeof o.change === 'number' && Number.isFinite(o.change)) {
    change = Math.round(o.change * 100) / 100;
  }
  const out: Partial<Pick<OrderRequest, 'paidPrice' | 'change'>> = {};
  if (paid !== null) {
    out.paidPrice = paid;
  }
  if (change !== null) {
    out.change = change;
  }
  return out;
}

/** Merges stored payment amounts from a loaded order into an `OrderRequest` before save. */
export function mergeOrderRequestPaymentFromPosOrder(
  body: OrderRequest,
  order: PosOrder | null | undefined,
): OrderRequest {
  if (order == null) {
    return body;
  }
  return { ...body, ...paymentFieldsForOrderRequest(order) };
}

/** Single line in PUT/POST JSON — include several keys so Java can bind `note`, `kitchen_note`, or `kitchenNote`. */
export function orderLineRequestToWire(line: OrderLineRequest): Record<string, unknown> {
  const row: Record<string, unknown> = {
    foodId: line.foodId,
    food_id: line.foodId,
    quantity: line.quantity,
  };
  if (line.status != null) {
    row['status'] = line.status;
  }
  const raw = line.note;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      row['note'] = trimmed;
      row['kitchen_note'] = trimmed;
      row['kitchenNote'] = trimmed;
      row['prep_note'] = trimmed;
      row['prepNote'] = trimmed;
    }
  }
  return row;
}

/** Plain object for PUT/POST JSON: avoids dropped `undefined` and adds snake_case names some Java APIs expect. */
export function orderRequestToWireBody(body: OrderRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tableId: body.tableId,
    table_id: body.tableId,
    orderDate: body.orderDate,
    complateOrder: body.complateOrder,
    complateOrderDate: body.complateOrderDate,
    cancel: body.cancel,
    lines: body.lines.map(orderLineRequestToWire),
    version: body.version,
  };
  if (body.orderNo !== undefined && body.orderNo !== '') {
    out['orderNo'] = body.orderNo;
  }
  const pp = finiteField(body.paidPrice);
  const ch = finiteField(body.change);
  if (pp !== null) {
    out['paidPrice'] = pp;
    out['paid_price'] = pp;
  }
  if (ch !== null) {
    out['change'] = ch;
    out['change_amount'] = ch;
  }
  if (body.note !== undefined) {
    const t = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    out['note'] = t;
    out['order_note'] = t;
  }
  return out;
}

/**
 * JSON for `PATCH /api/orders/{id}/note` — Spring DTO `PatchOrderNoteRequest` (`note`, `version` only).
 */
export function patchOrderNoteToWire(body: PatchOrderNoteRequest): Record<string, unknown> {
  const t = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  return { note: t, version: body.version };
}

/** JSON body for POST …/pay — same casing as order update. */
export function payRequestToWireBody(p: PayOrderRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    paidPrice: p.paidPrice,
    paid_price: p.paidPrice,
    change: p.change,
    change_amount: p.change,
  };
  if (p.paidByQrScan === true) {
    out['paidByQrScan'] = true;
    out['paid_by_qr_scan'] = true;
  }
  if (p.paidByCredit === true) {
    out['paidByCredit'] = true;
    out['paid_by_credit'] = true;
  }
  const qr = typeof p.qrScanPayload === 'string' ? p.qrScanPayload.trim() : '';
  if (qr.length > 0) {
    const clipped = qr.length > 1024 ? qr.slice(0, 1024) : qr;
    out['qrScanPayload'] = clipped;
    out['qr_scan_payload'] = clipped;
  }
  return out;
}

/** If the cashier pasted scanned QR text, attach it so the API records `paid_by_qr_scan`. */
export function applyQrScanToPayBody(pay: PayOrderRequest, qrRaw: string | null | undefined): PayOrderRequest {
  const trimmed = qrRaw?.trim() ?? '';
  if (trimmed === '') {
    return pay;
  }
  const qrScanPayload = trimmed.length > 1024 ? trimmed.slice(0, 1024) : trimmed;
  return { ...pay, paidByQrScan: true, qrScanPayload };
}

/** Sets `paidPrice` and `change` from the pay dialog (final values sent on PUT before `POST /pay`). */
export function mergePayOrderAmounts(body: OrderRequest, pay: PayOrderRequest): OrderRequest {
  return {
    ...body,
    paidPrice: pay.paidPrice,
    change: pay.change,
  };
}

/** Cent-safe tender/change for `POST /api/orders/{id}/pay`. */
export function buildPayOrderRequest(amountRaw: number, payableTotal: number): PayOrderRequestResult {
  if (!Number.isFinite(amountRaw) || amountRaw < 0) {
    return { error: 'payment.validAmount' };
  }
  const tenderCents = Math.round(amountRaw * 100);
  const dueCents = Math.round(payableTotal * 100);
  if (tenderCents < dueCents) {
    return { error: 'payment.amountTooLow' };
  }
  return {
    paidPrice: tenderCents / 100,
    change: (tenderCents - dueCents) / 100,
  };
}
