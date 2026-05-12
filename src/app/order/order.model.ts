import type { Food } from '../food/food.model';
import type { PosTable } from '../table/table.model';

/** Matches `me.pixka.pos.order.model.OrderLine` JSON (nested under orders). */
export interface OrderLine {
  id: number | null;
  food: Food | null;
  quantity: number;
  unitPrice: number;
  status: 'WAIT' | 'COMPLETE' | 'CANCEL';
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
  lines: OrderLine[];
  version: number;
}

/** Matches `me.pixka.pos.order.api.OrderLineRequest`. */
export interface OrderLineRequest {
  foodId: number;
  quantity: number;
  status?: 'WAIT' | 'COMPLETE' | 'CANCEL';
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
}
