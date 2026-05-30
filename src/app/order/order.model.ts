import type { Food } from '../food/food.model';
import type { PosTable } from '../table/table.model';

/** Matches `me.pixka.pos.order.model.OrderLine` JSON (nested under orders). */
export interface OrderLine {
  id: number | null;
  food: Food | null;
  /** Present when `food` is omitted and the API only sends an id reference. */
  foodId?: number | null;
  food_id?: number | null;
  quantity: number;
  unitPrice: number;
  unit_price?: number | null;
  status: 'WAIT' | 'COMPLETE' | 'CANCEL';
  /** User who added this line (`user_id` in JSON). */
  userId?: number | null;
  user_id?: number | null;
}

/** Resolved food id for a line when nested `food` or flat id fields are present. */
export function lineFoodId(ln: OrderLine): number {
  const fromFood = ln.food?.id;
  if (fromFood != null && Number.isFinite(fromFood) && fromFood > 0) {
    return fromFood;
  }
  const a = ln.foodId;
  if (a != null && Number.isFinite(a) && a > 0) {
    return a;
  }
  const b = ln.food_id;
  if (b != null && Number.isFinite(b) && b > 0) {
    return b;
  }
  return 0;
}

/** Unit price from camelCase or snake_case line JSON. */
export function lineUnitPrice(ln: OrderLine): number {
  const u = ln.unitPrice;
  if (Number.isFinite(u)) {
    return u;
  }
  const v = ln.unit_price;
  if (v != null && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return 0;
}

/** Resolved order creator id from camelCase or snake_case JSON. */
export function orderUserId(o: Pick<PosOrder, 'userId' | 'user_id'>): number | null {
  const a = o.userId;
  if (a != null && Number.isFinite(a) && a > 0) {
    return a;
  }
  const b = o.user_id;
  if (b != null && Number.isFinite(b) && b > 0) {
    return b;
  }
  return null;
}

/** Resolved line creator id from camelCase or snake_case JSON. */
export function lineUserId(ln: Pick<OrderLine, 'userId' | 'user_id'>): number | null {
  const a = ln.userId;
  if (a != null && Number.isFinite(a) && a > 0) {
    return a;
  }
  const b = ln.user_id;
  if (b != null && Number.isFinite(b) && b > 0) {
    return b;
  }
  return null;
}

/** Copy order `userId` onto an update request (camelCase + snake_case). */
export function orderUserFields(
  o: Pick<PosOrder, 'userId' | 'user_id'>,
): Pick<OrderRequest, 'userId' | 'user_id'> {
  const id = orderUserId(o);
  if (id == null) {
    return {};
  }
  return { userId: id, user_id: id };
}

/** Set order creator on create when operator id is known. */
export function orderUserFieldsForActor(
  userId: number | null | undefined,
): Pick<OrderRequest, 'userId' | 'user_id'> {
  if (userId == null || !Number.isFinite(userId) || userId < 1) {
    return {};
  }
  const id = Math.floor(userId);
  return { userId: id, user_id: id };
}

/** PUT/POST line from a loaded {@link OrderLine}, preserving line `userId`. */
export function orderLineToRequest(
  ln: OrderLine,
  status?: 'WAIT' | 'COMPLETE' | 'CANCEL',
): OrderLineRequest {
  const req: OrderLineRequest = {
    foodId: lineFoodId(ln),
    quantity: ln.quantity,
  };
  if (status != null) {
    req.status = status;
  }
  const uid = lineUserId(ln);
  if (uid != null) {
    req.userId = uid;
    req.user_id = uid;
  }
  return req;
}

/** New line on create or add-to-order; assigns operator `userId` when provided. */
export function newOrderLineRequest(
  foodId: number,
  quantity: number,
  status: 'WAIT' | 'COMPLETE' | 'CANCEL' | undefined,
  userId: number | null | undefined,
): OrderLineRequest {
  const req: OrderLineRequest = { foodId, quantity };
  if (status != null) {
    req.status = status;
  }
  if (userId != null && Number.isFinite(userId) && userId > 0) {
    const id = Math.floor(userId);
    req.userId = id;
    req.user_id = id;
  }
  return req;
}

/**
 * Matches `me.pixka.pos.order.model.PosOrder` JSON from `/api/orders`.
 * Line items live on `lines`. Some payloads still carry a top-level {@link PosOrder.food} (legacy).
 */
export interface PosOrder {
  id: number | null;
  orderNo: string;
  /** Snake_case alias some serializers emit. */
  order_no?: string;
  table: PosTable | null;
  orderDate: string | null;
  order_date?: string | null;
  /** Backend field name spelling (`complate_order`); kept for compatibility. */
  complateOrder: boolean;
  complateOrderDate: string | null;
  complate_order?: boolean | null;
  complate_order_date?: string | null;
  /** Correct spelling when the domain model was aligned with English `complete`. */
  completeOrder?: boolean;
  completeOrderDate?: string | null;
  complete_order?: boolean | null;
  complete_order_date?: string | null;
  cancel: boolean;
  paid: boolean;
  /** Kotlin-style name; prefer {@link orderIsPaid} in app code. */
  isPaid?: boolean;
  is_paid?: boolean | number | string | null;
  paidAt: string | null;
  paid_at?: string | null;
  /** Some APIs use a lifecycle string instead of a boolean `paid`. */
  paymentStatus?: string | null;
  payment_state?: string | null;
  /** Amount applied to the bill when paid (if API returns it). */
  paidPrice?: number | null;
  /** Snake_case alias some APIs return. */
  paid_price?: number | null;
  /** Change returned to customer when paid (if API returns it). */
  change?: number | null;
  /** Same as `change` when API uses this property name. */
  orderChange?: number | null;
  /** Snake_case alias some APIs return. */
  order_change?: number | null;
  /** Cash tendered at pay time (if API returns it). */
  totalPaid?: number | null;
  /** Snake_case alias some APIs return. */
  total_paid?: number | null;
  lines: OrderLine[];
  version: number;
  /** Legacy single-food field on older rows; prefer `lines`. */
  food?: Food | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** User who created the order (`user_id` in JSON). */
  userId?: number | null;
  user_id?: number | null;
}

/** Matches `me.pixka.pos.order.api.OrderLineRequest`. */
export interface OrderLineRequest {
  foodId: number;
  quantity: number;
  status?: 'WAIT' | 'COMPLETE' | 'CANCEL';
  userId?: number;
  user_id?: number;
}

/** Matches `me.pixka.pos.order.api.OrderRequest`. */
export interface OrderRequest {
  /** Omit on create so the API assigns a unique `orderNo`. Optional on update if unchanged. */
  orderNo?: string;
  tableId: number;
  orderDate: string;
  complateOrder: boolean;
  complateOrderDate: string | null;
  cancel: boolean;
  /** Send on every PUT from an existing order so settlement is not dropped server-side. */
  paid: boolean;
  /** Some API builds expose this alongside {@link paid}. */
  isPaid?: boolean;
  paidAt: string | null;
  /** When confirming pay with a line update first: amount due and change to persist on the order. */
  paidPrice?: number | null;
  change?: number | null;
  /** Same numeric value as `change` when the API expects this field on update. */
  orderChange?: number | null;
  /** Cash tendered (customer gives); sent on pay prep PUT when API stores it on the order. */
  totalPaid?: number | null;
  /** Snake_case JSON some Kotlin/Spring APIs expect on update. */
  paid_price?: number | null;
  order_change?: number | null;
  total_paid?: number | null;
  /** Some backends bind only snake_case for booleans / timestamps on update. */
  is_paid?: boolean;
  paid_at?: string | null;
  /** Operator who created the order; preserved on update. */
  userId?: number;
  user_id?: number;
  lines: OrderLineRequest[];
  version: number;
}

/**
 * Settlement amounts from the pay dialog. The app merges these (plus `paid` / `paidAt`) into
 * {@link OrderRequest} for `PUT /api/orders/{id}` only — the API does not use a separate pay route here.
 */
export interface OrderPayRequest {
  paidPrice: number;
  totalPaid: number;
  change: number;
  /** Same numeric value as `change` (some backends bind this name instead of `change`). */
  orderChange: number;
}

/** Rounds to 2 decimals; used for money fields on pay. */
export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Builds pay PUT/POST fields from amount due and cash received. */
export function computePaySettlement(due: number, tendered: number): OrderPayRequest {
  const paidPrice = roundMoney2(due);
  const totalPaid = roundMoney2(tendered);
  const change = Math.max(0, roundMoney2(totalPaid - paidPrice));
  return { paidPrice, totalPaid, change, orderChange: change };
}

/** CamelCase + snake_case settlement fields merged into `PUT /api/orders/{id}` when paying. */
export function orderSettlementForPut(s: OrderPayRequest): Pick<
  OrderRequest,
  | 'paidPrice'
  | 'change'
  | 'orderChange'
  | 'totalPaid'
  | 'paid_price'
  | 'order_change'
  | 'total_paid'
> {
  return {
    paidPrice: s.paidPrice,
    paid_price: s.paidPrice,
    change: s.change,
    orderChange: s.orderChange,
    order_change: s.orderChange,
    totalPaid: s.totalPaid,
    total_paid: s.totalPaid,
  };
}

/**
 * Paid flags + timestamp in camelCase and snake_case for `PUT /api/orders/{id}` when settling.
 * Some Kotlin/Jackson APIs bind `is_paid` / `paid_at` and ignore `paid` / `paidAt` unless both are sent.
 */
export function orderPayStateForPut(paidAt: string): Pick<OrderRequest, 'paid' | 'isPaid' | 'paidAt'> & {
  is_paid: boolean;
  paid_at: string;
} {
  return {
    paid: true,
    isPaid: true,
    paidAt,
    is_paid: true,
    paid_at: paidAt,
  };
}

function truthyPaidFlag(v: unknown): boolean {
  if (v === true || v === 1) {
    return true;
  }
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

/** Resolved pay timestamp from camelCase or snake_case JSON. */
export function orderPaidAt(o: PosOrder): string | null {
  const a = o.paidAt;
  if (a != null && String(a).trim() !== '') {
    return a;
  }
  const b = o.paid_at;
  if (b != null && String(b).trim() !== '') {
    return b;
  }
  return null;
}

/**
 * Whether the order should be treated as paid in the UI.
 * List DTOs sometimes keep `paid: false` while `paidAt` / `isPaid` reflect settlement — check those before trusting `paid === false`.
 */
export function orderIsPaid(o: PosOrder): boolean {
  if (truthyPaidFlag(o.paid)) {
    return true;
  }
  if (truthyPaidFlag(o.isPaid) || truthyPaidFlag(o.is_paid)) {
    return true;
  }
  const at = orderPaidAt(o);
  if (at != null && String(at).trim() !== '') {
    return true;
  }
  for (const s of [o.paymentStatus, o.payment_state]) {
    if (typeof s === 'string' && ['PAID', 'SETTLED', 'COMPLETED', 'DONE'].includes(s.trim().toUpperCase())) {
      return true;
    }
  }
  if (o.paid === false || o.isPaid === false) {
    return false;
  }
  return false;
}

/** Whether the order is marked complete/done on any supported field shape. */
export function orderComplated(o: PosOrder): boolean {
  if (o.complateOrder) {
    return true;
  }
  if (o.completeOrder) {
    return true;
  }
  if (truthyPaidFlag(o.complate_order) || truthyPaidFlag(o.complete_order)) {
    return true;
  }
  return false;
}

/** Resolved complete/done timestamp from supported property names. */
export function orderComplatedDate(o: PosOrder): string | null {
  const c = o.complateOrderDate;
  if (c != null && String(c).trim() !== '') {
    return c;
  }
  const d = o.completeOrderDate;
  if (d != null && String(d).trim() !== '') {
    return d;
  }
  const e = o.complate_order_date;
  if (e != null && String(e).trim() !== '') {
    return e;
  }
  const f = o.complete_order_date;
  if (f != null && String(f).trim() !== '') {
    return f;
  }
  return null;
}

/** Order business date from camelCase or snake_case JSON. */
export function orderOrderDate(o: PosOrder): string | null {
  if (o.orderDate != null && String(o.orderDate).trim() !== '') {
    return o.orderDate;
  }
  if (o.order_date != null && String(o.order_date).trim() !== '') {
    return o.order_date;
  }
  return null;
}

/** Order number string from camelCase or snake_case JSON. */
export function orderOrderNo(o: PosOrder): string {
  const n = o.orderNo;
  if (n != null && String(n).trim() !== '') {
    return n;
  }
  const s = o.order_no;
  if (s != null && String(s).trim() !== '') {
    return s;
  }
  return '';
}

/** Copy `paid` / `paidAt` from a loaded order onto an update request (honors aliases). */
export function orderPaidFields(o: PosOrder): Pick<OrderRequest, 'paid' | 'paidAt'> {
  return { paid: orderIsPaid(o), paidAt: orderPaidAt(o) };
}

/**
 * Order row to show right after pay succeeds. Merges the PUT response when present; otherwise
 * applies settlement + paid flags on top of the pre-pay row (list GET is often stale).
 */
export function orderAfterPayPatch(
  before: PosOrder,
  server: PosOrder | undefined | null,
  paidAt: string,
  settlement: OrderPayRequest,
): PosOrder {
  const fromServer = server && server.id != null && before.id != null && server.id === before.id ? server : null;
  const lines =
    fromServer?.lines != null && fromServer.lines.length > 0 ? fromServer.lines : (before.lines ?? []);
  return {
    ...before,
    ...(fromServer ?? {}),
    paid: true,
    isPaid: true,
    paidAt,
    is_paid: true,
    paid_at: paidAt,
    complateOrder: true,
    complateOrderDate: paidAt,
    paidPrice: settlement.paidPrice,
    paid_price: settlement.paidPrice,
    change: settlement.change,
    orderChange: settlement.orderChange,
    order_change: settlement.orderChange,
    totalPaid: settlement.totalPaid,
    total_paid: settlement.totalPaid,
    lines,
    version: fromServer?.version ?? before.version,
  };
}
