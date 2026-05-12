import type { Food } from '../food/food.model';
import type { PosTable } from '../table/table.model';
import type { Zone } from '../zone/zone.model';
import type { PosOrder } from './order.model';

function zonePickerLabel(z: Zone | null | undefined): string {
  if (!z) {
    return '';
  }
  const name = (z.name ?? '').trim();
  const code = (z.code ?? '').trim();
  if (name && code) {
    return `${name} (${code})`;
  }
  return name || code || '';
}

/** Table row in order forms: zone name first, then table code (no numeric ids). */
export function tablePickerLabel(t: PosTable): string {
  const code = (t.code ?? '').trim();
  const zn = zonePickerLabel(t.zone);
  if (zn && code) {
    return `${zn} — ${code}`;
  }
  return zn || code || 'Table';
}

/** Food row in order forms: dish name first, then code (no numeric ids). */
export function foodPickerLabel(f: Food): string {
  const name = (f.name ?? '').trim();
  const code = (f.code ?? '').trim();
  if (name && code) {
    return `${name} (${code})`;
  }
  return name || code || 'Food';
}

export function mergeTablesFromApis(tablesApi: PosTable[], orders: PosOrder[]): PosTable[] {
  const byId = new Map<number, PosTable>();
  for (const t of tablesApi) {
    if (t.id != null) {
      byId.set(t.id, t);
    }
  }
  for (const o of orders) {
    const t = o.table;
    if (t?.id != null && !byId.has(t.id)) {
      byId.set(t.id, t);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const za = zonePickerLabel(a.zone).toLowerCase();
    const zb = zonePickerLabel(b.zone).toLowerCase();
    const zcmp = za.localeCompare(zb);
    return zcmp !== 0 ? zcmp : a.code.localeCompare(b.code);
  });
}

export function mergeFoodsFromApis(foodsApi: Food[], orders: PosOrder[]): Food[] {
  const byId = new Map<number, Food>();
  for (const f of foodsApi) {
    if (f.id != null) {
      byId.set(f.id, f);
    }
  }
  for (const o of orders) {
    for (const ln of o.lines ?? []) {
      const f = ln.food;
      if (f?.id != null && !byId.has(f.id)) {
        byId.set(f.id, f);
      }
    }
  }
  return [...byId.values()].sort((a, b) => {
    const an = ((a.name ?? '').trim() || a.code).toLowerCase();
    const bn = ((b.name ?? '').trim() || b.code).toLowerCase();
    const cmp = an.localeCompare(bn);
    return cmp !== 0 ? cmp : a.code.localeCompare(b.code);
  });
}
