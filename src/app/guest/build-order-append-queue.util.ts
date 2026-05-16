import type { OrderRequest, PosOrder } from '../order/order.model';
import { orderLineRequestNotePart } from '../order/order-line-note.util';
import { resolvedLineStatus } from '../order/order-line-status.util';
import { mergeOrderRequestPaymentFromPosOrder } from '../order/order-pay.util';

/** Same merge as adding queued lines through the order list; used by guest/mobile flow. */
export function buildOrderRequestAppendQueuedLines(
  o: PosOrder,
  queue: Array<{ foodId: number; qty: number }>,
): OrderRequest | null {
  const tableId = o.table?.id;
  if (o.id == null || tableId == null || o.paid) {
    return null;
  }
  const merged = new Map<number, number>();
  for (const item of queue) {
    const curr = merged.get(item.foodId) ?? 0;
    merged.set(item.foodId, curr + Math.max(1, Math.floor(item.qty)));
  }
  return mergeOrderRequestPaymentFromPosOrder(
    {
      orderNo: o.orderNo,
      tableId,
      orderDate: o.orderDate ?? new Date().toISOString().slice(0, 19),
      complateOrder: o.complateOrder,
      complateOrderDate: o.complateOrderDate,
      cancel: o.cancel,
      version: o.version,
      lines: [
        ...(o.lines ?? []).map((ln) => ({
          foodId: ln.food?.id ?? 0,
          quantity: ln.quantity,
          status: resolvedLineStatus(ln, o),
          ...orderLineRequestNotePart(ln),
        })),
        ...[...merged.entries()].map(([foodId, quantity]) => ({
          foodId,
          quantity,
          status: 'WAIT' as const,
        })),
      ].filter((ln) => ln.foodId > 0),
    },
    o,
  );
}
