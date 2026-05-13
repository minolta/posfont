import type { OrderLine, OrderRequest, PosOrder } from './order.model';
import { mergeOrderRequestPaymentFromPosOrder } from './order-pay.util';
import { orderLineRequestNotePart } from './order-line-note.util';

/** Normalizes API line status (e.g. uppercase) and order-level flags. */
export function resolvedLineStatus(
  line: OrderLine,
  order: PosOrder,
): 'WAIT' | 'COMPLETE' | 'CANCEL' {
  const raw = line.status as string | null | undefined;
  if (raw) {
    const u = String(raw).toUpperCase();
    if (u === 'WAIT' || u === 'COMPLETE' || u === 'CANCEL') {
      return u;
    }
  }
  if (order.cancel) {
    return 'CANCEL';
  }
  if (order.complateOrder || order.paid) {
    return 'COMPLETE';
  }
  return 'WAIT';
}

export function orderHasWaitingLines(order: PosOrder): boolean {
  return (order.lines ?? []).some((ln) => {
    const s = resolvedLineStatus(ln, order);
    return s !== 'COMPLETE' && s !== 'CANCEL';
  });
}

/** PUT body: every line COMPLETE except lines already canceled. */
export function orderRequestCompleteAllExceptCanceled(order: PosOrder): OrderRequest | null {
  const tableId = order.table?.id;
  if (tableId == null) {
    return null;
  }
  const now = new Date().toISOString().slice(0, 19);
  return mergeOrderRequestPaymentFromPosOrder(
    {
      orderNo: order.orderNo,
      tableId,
      orderDate: order.orderDate ?? now,
      complateOrder: order.complateOrder,
      complateOrderDate: order.complateOrderDate,
      cancel: order.cancel,
      version: order.version,
      lines: (order.lines ?? [])
        .map((ln) => {
          const status: 'CANCEL' | 'COMPLETE' =
            resolvedLineStatus(ln, order) === 'CANCEL' ? 'CANCEL' : 'COMPLETE';
          return {
            foodId: ln.food?.id ?? 0,
            quantity: ln.quantity,
            status,
            ...orderLineRequestNotePart(ln),
          };
        })
        .filter((ln) => ln.foodId > 0),
    },
    order,
  );
}
