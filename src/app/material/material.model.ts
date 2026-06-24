/** Matches `me.pixka.pos.material.model.Material` JSON from `/api/materials`. */
export interface Material {
  id: number | null;
  code: string;
  name: string;
  /** Unit of measure (g, ml, pcs, …). */
  unit: string;
  /** Stock on hand. */
  quantity: number;
  /** Latest unit purchase price. */
  currentPrice: number;
  /** Product brand (optional). */
  brand?: string | null;
  /** Last supplier / shop (optional). */
  buyFrom?: string | null;
  version: number;
}

/** Body for `POST /api/materials` (`MaterialRequest` with `version: 0`). */
export interface NewMaterialRequest {
  code: string;
  name: string;
  unit: string;
  quantity?: number;
  currentPrice?: number;
  brand?: string | null;
  buyFrom?: string | null;
}

/** Body for `PUT /api/materials/{id}`. */
export interface MaterialRequest {
  code: string;
  name: string;
  unit: string;
  quantity?: number;
  currentPrice?: number;
  brand?: string | null;
  buyFrom?: string | null;
  version: number;
}

export interface MaterialBulkCreateResponse {
  createdCount: number;
  updatedCount: number;
  created: Material[];
  updated: Material[];
  skipped: Array<{ code: string; reason: string }>;
}

export function readMaterialQuantity(m: Material): number {
  const r = m as unknown as Record<string, unknown>;
  const v = m.quantity ?? r['qty'];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function readMaterialCurrentPrice(m: Material): number {
  const r = m as unknown as Record<string, unknown>;
  const v = m.currentPrice ?? r['current_price'];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function readMaterialBrand(m: Material): string {
  const r = m as unknown as Record<string, unknown>;
  const v = m.brand ?? r['brand'];
  return typeof v === 'string' ? v.trim() : '';
}

export function readMaterialBuyFrom(m: Material): string {
  const r = m as unknown as Record<string, unknown>;
  const v = m.buyFrom ?? r['buy_from'];
  return typeof v === 'string' ? v.trim() : '';
}

export function materialOptionLabel(m: Material): string {
  const name = (m.name ?? '').trim();
  const code = (m.code ?? '').trim();
  const unit = (m.unit ?? '').trim();
  const unitSuffix = unit ? ` [${unit}]` : '';
  if (name && code) {
    return `${name} (${code})${unitSuffix}`;
  }
  return (name || code || `#${m.id ?? '?'}`) + unitSuffix;
}
