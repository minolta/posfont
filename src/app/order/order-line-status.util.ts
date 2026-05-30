import {
  orderComplated,
  orderComplatedDate,
  orderIsPaid,
  orderLineToRequest,
  orderOrderDate,
  orderOrderNo,
  orderPaidFields,
  orderUserFields,
  type OrderLine,
  type OrderRequest,
  type PosOrder,
} from './order.model';

/** Normalizes API line status (e.g. uppercase) and order-level flags. */
export function resolvedLineStatus(
  line: OrderLine,
  order: PosOrder,
): 'WAIT' | 'COMPLETE' | 'CANCEL' {
  const raw = line.status as string | null | undefined;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    const u = String(raw).toUpperCase().trim();
    if (
      u === 'WAIT' ||
      u === 'WAITING' ||
      u === 'PENDING' ||
      u === 'OPEN' ||
      u === 'QUEUED' ||
      u === 'NEW' ||
      u === 'IN_PROGRESS' ||
      u === 'PREPARING' ||
      u === 'PREPARED'
    ) {
      return 'WAIT';
    }
    if (
      u === 'COMPLETE' ||
      u === 'DONE' ||
      u === 'SERVED' ||
      u === 'READY' ||
      u === 'FINISHED' ||
      u === 'FULFILLED'
    ) {
      return 'COMPLETE';
    }
    if (u === 'CANCEL' || u === 'CANCELLED' || u === 'VOID') {
      return 'CANCEL';
    }
  }
  if (order.cancel) {
    return 'CANCEL';
  }
  if (orderComplated(order) || orderIsPaid(order)) {
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
  return {
    orderNo: orderOrderNo(order),
    tableId,
    orderDate: orderOrderDate(order) ?? now,
    complateOrder: orderComplated(order),
    complateOrderDate: orderComplatedDate(order),
    cancel: order.cancel,
    ...orderPaidFields(order),
    ...orderUserFields(order),
    version: order.version,
    lines: (order.lines ?? [])
      .map((ln) => {
        const status: 'CANCEL' | 'COMPLETE' =
          resolvedLineStatus(ln, order) === 'CANCEL' ? 'CANCEL' : 'COMPLETE';
        return orderLineToRequest(ln, status);
      })
      .filter((ln) => ln.foodId > 0),
  };
}

/** PUT body: current lines and flags unchanged (for pay prep when there are no waiting lines). */
export function orderRequestPreservingLines(order: PosOrder): OrderRequest | null {
  const tableId = order.table?.id;
  if (tableId == null) {
    return null;
  }
  const now = new Date().toISOString().slice(0, 19);
  return {
    orderNo: orderOrderNo(order),
    tableId,
    orderDate: orderOrderDate(order) ?? now,
    complateOrder: orderComplated(order),
    complateOrderDate: orderComplatedDate(order),
    cancel: order.cancel,
    ...orderPaidFields(order),
    ...orderUserFields(order),
    version: order.version,
    lines: (order.lines ?? [])
      .map((ln) => orderLineToRequest(ln, resolvedLineStatus(ln, order)))
      .filter((ln) => ln.foodId > 0),
  };
}
