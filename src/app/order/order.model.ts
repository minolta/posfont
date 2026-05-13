import type { Food } from '../food/food.model';
import type { PosTable } from '../table/table.model';

/** Matches `me.pixka.pos.order.model.OrderLine` JSON (nested under orders). */
export interface OrderLine {
  id: number | null;
  food: Food | null;
  quantity: number;
  unitPrice: number;
  status: 'WAIT' | 'COMPLETE' | 'CANCEL';
  /** Kitchen / prep instruction for this line (`note` or `kitchen_note` on some APIs). */
  note?: string | null;
}

/**
 * Matches `me.pixka.pos.order.model.PosOrder` JSON from `/api/orders`.
 * Line items live on `lines`; `food` was removed from the order aggregate.
 */
export interface PosOrder {
  id: number | null;
  orderNo: string;
  table: PosTable | null;
  orderDate: string | null;
  /** Backend field name spelling (`complate_order`). */
  complateOrder: boolean;
  complateOrderDate: string | null;
  cancel: boolean;
  paid: boolean;
  paidAt: string | null;
  /** Cash amount the customer paid (tendered); persisted on pay (`paidPrice` / `paid_price` on API). */
  paidPrice?: number | null;
  /** Change returned to the customer; persisted on pay. */
  change?: number | null;
  lines: OrderLine[];
  version: number;
}

/** JSON body for `POST /api/orders/{id}/pay` — maps to PosOrder `paidPrice` and `change`. */
export interface PayOrderRequest {
  paidPrice: number;
  change: number;
}

/** Matches `me.pixka.pos.order.api.OrderLineRequest`. Add the same on the Java DTO or Jackson will ignore / reject unknown keys. */
export interface OrderLineRequest {
  foodId: number;
  quantity: number;
  status?: 'WAIT' | 'COMPLETE' | 'CANCEL';
  /** Kitchen / prep text; sent as `note`, `kitchen_note`, `kitchenNote`, etc. in JSON (see `orderLineRequestToWire`). */
  note?: string | null;
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
  lines: OrderLineRequest[];
  version: number;
  /** Present after payment; include on PUT so the server does not clear persisted values. */
  paidPrice?: number | null;
  change?: number | null;
}
