import type { OrderRequest, PayOrderRequest, PosOrder } from './order.model';

export type PayOrderRequestResult = PayOrderRequest | { error: string };

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

/** Plain object for PUT/POST JSON: avoids dropped `undefined` and adds snake_case names some Java APIs expect. */
export function orderRequestToWireBody(body: OrderRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tableId: body.tableId,
    orderDate: body.orderDate,
    complateOrder: body.complateOrder,
    complateOrderDate: body.complateOrderDate,
    cancel: body.cancel,
    lines: body.lines,
    version: body.version,
  };
  if (body.orderNo !== undefined && body.orderNo !== '') {
    out.orderNo = body.orderNo;
  }
  const pp = finiteField(body.paidPrice);
  const ch = finiteField(body.change);
  if (pp !== null) {
    out.paidPrice = pp;
    out.paid_price = pp;
  }
  if (ch !== null) {
    out.change = ch;
    out.change_amount = ch;
  }
  return out;
}

/** JSON body for POST …/pay — same casing as order update. */
export function payRequestToWireBody(p: PayOrderRequest): Record<string, unknown> {
  return {
    paidPrice: p.paidPrice,
    paid_price: p.paidPrice,
    change: p.change,
    change_amount: p.change,
  };
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
    return { error: 'Please enter a valid amount to pay.' };
  }
  const tenderCents = Math.round(amountRaw * 100);
  const dueCents = Math.round(payableTotal * 100);
  if (tenderCents < dueCents) {
    return { error: 'Amount received must be at least the total to pay.' };
  }
  return {
    paidPrice: tenderCents / 100,
    change: (tenderCents - dueCents) / 100,
  };
}
