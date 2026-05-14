import type { Food } from '../food/food.model';
import type { PosTable } from '../table/table.model';

/** Line lifecycle on the POS API (`WAIT` → cook, `FINISH_COOKING` → cooked, ready for table/runner). */
export type OrderLineStatus = 'WAIT' | 'FINISH_COOKING' | 'COMPLETE' | 'CANCEL';

/** Matches `me.pixka.pos.order.model.OrderLine` JSON (nested under orders). */
export interface OrderLine {
  id: number | null;
  food: Food | null;
  quantity: number;
  unitPrice: number;
  status: OrderLineStatus;
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
  /** True when settled via scanned payment QR (`paid_by_qr_scan`). */
  paidByQrScan?: boolean | null;
  /** Optional scanned payment reference (`qr_scan_payload`), e.g. PromptPay slip. */
  qrScanPayload?: string | null;
  lines: OrderLine[];
  version: number;
}

/** JSON body for `POST /api/orders/{id}/pay` — maps to PosOrder `paidPrice` and `change`. */
export interface PayOrderRequest {
  paidPrice: number;
  change: number;
  /** When true (or when `qrScanPayload` is non-empty), API records QR-settled payment. */
  paidByQrScan?: boolean;
  /** Raw string from the scanned QR; optional but recommended for audit. */
  qrScanPayload?: string | null;
}

/** Matches `me.pixka.pos.order.api.OrderLineRequest`. Add statuses on the Java DTO (e.g. `FINISH_COOKING`) so Jackson persists them; unknown keys may be ignored. */
export interface OrderLineRequest {
  foodId: number;
  quantity: number;
  status?: OrderLineStatus;
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
