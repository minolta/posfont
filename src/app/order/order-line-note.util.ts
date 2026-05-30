import type { OrderLine, OrderLineRequest } from './order.model';

const MAX_NOTE = 500;

/** Text shown in UI / sent on API when persisted on the line. */
export function lineKitchenNote(ln: OrderLine): string | null {
  const direct = typeof ln.note === 'string' ? ln.note.trim() : '';
  if (direct.length > 0) {
    return direct.slice(0, MAX_NOTE);
  }
  const r = ln as unknown as Record<string, unknown>;
  const alt = r['kitchenNote'] ?? r['kitchen_note'] ?? r['lineNote'] ?? r['line_note'];
  if (typeof alt === 'string' && alt.trim().length > 0) {
    return alt.trim().slice(0, MAX_NOTE);
  }
  return null;
}

export function trimNewLineNote(raw: string | null | undefined): string | undefined {
  const t = (raw ?? '').toString().trim().slice(0, MAX_NOTE);
  return t.length > 0 ? t : undefined;
}

/** Include on `OrderLineRequest` when the line has a stored note. */
export function orderLineRequestNotePart(ln: OrderLine): Pick<OrderLineRequest, 'note'> | Record<string, never> {
  const n = lineKitchenNote(ln);
  return n != null && n.length > 0 ? { note: n } : {};
}
