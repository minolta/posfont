import { resolvedLineStatus } from '../order/order-line-status.util';
import { lineKitchenNote } from '../order/order-line-note.util';
import type { PosOrder } from '../order/order.model';

export interface KitchenPrepRow {
  orderId: number;
  orderNo: string;
  tableCode: string;
  zoneHint: string;
  orderDate: string | null;
  lineId: number | null;
  foodCode: string;
  foodName: string;
  quantity: number;
  note: string | null;
  kitchenId: number | null;
  /** Display label from the line’s food kitchen. */
  kitchenLabel: string;
}

/**
 * WAIT lines queued to go to an assigned table (zone), from open orders (`!paid`, `!cancel`).
 * Optional kitchen filter by food kitchen id (`null` = all).
 * Sorted ascending by **order line id** (kitchen pick-up / expedite order).
 */
export function buildKitchenPrepRows(orders: PosOrder[], kitchenIdFilter: number | null): KitchenPrepRow[] {
  const rows: KitchenPrepRow[] = [];
  for (const o of orders) {
    if (o.id == null || o.cancel || o.paid) {
      continue;
    }
    const table = o.table;
    if (table == null || table.id == null) {
      continue;
    }
    for (const ln of o.lines ?? []) {
      if (resolvedLineStatus(ln, o) !== 'WAIT') {
        continue;
      }
      const kid = ln.food?.kitchen?.id ?? null;
      if (kitchenIdFilter != null && kid !== kitchenIdFilter) {
        continue;
      }
      const k = ln.food?.kitchen;
      let kitchenLabel = '—';
      if (k) {
        const code = k.code?.trim();
        const name = k.name?.trim();
        if (name && code && name !== code) {
          kitchenLabel = `${code} · ${name}`;
        } else {
          kitchenLabel = name || code || '—';
        }
      }
      const t = table;
      rows.push({
        orderId: o.id,
        orderNo: o.orderNo,
        tableCode: t?.code ?? '—',
        zoneHint: t?.zone?.name?.trim()
          ? t.zone.name.trim()
          : t?.zone?.code?.trim()
            ? t.zone.code.trim()
            : '',
        orderDate: o.orderDate ?? null,
        lineId: ln.id,
        foodCode: ln.food?.code ?? '',
        foodName:
          ln.food?.name && ln.food.name.trim() !== ''
            ? ln.food.name.trim()
            : ln.food?.code ?? '—',
        quantity: ln.quantity,
        note: lineKitchenNote(ln),
        kitchenId: kid,
        kitchenLabel,
      });
    }
  }
  rows.sort((a, b) => {
    const la = a.lineId;
    const lb = b.lineId;
    if (la == null && lb == null) {
      return 0;
    }
    if (la == null) {
      return 1;
    }
    if (lb == null) {
      return -1;
    }
    return la - lb;
  });
  return rows;
}
