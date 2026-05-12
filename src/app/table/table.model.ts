import type { Zone } from '../zone/zone.model';

/** Matches `me.pixka.pos.table.model.PosTable` JSON from `/api/tables`. */
export interface PosTable {
  id: number | null;
  code: string;
  basePrice: number;
  version: number;
  zone: Zone | null;
}

/** Matches `me.pixka.pos.table.api.TableRequest`. */
export interface TableRequest {
  code: string;
  basePrice: number;
  version: number;
  zoneId: number;
}
