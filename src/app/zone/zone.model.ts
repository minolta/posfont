/** Matches `me.pixka.pos.zone.model.Zone` JSON from `/api/zones`. */
export interface Zone {
  id: number | null;
  code: string;
  /** Display name; omit on legacy API payloads. */
  name?: string;
  /** Relative picture URL, e.g. `/api/zones/1/picture`; omit when no image. */
  pictureUrl?: string | null;
  version: number;
}

/** Matches `me.pixka.pos.zone.api.ZoneRequest`. */
export interface ZoneRequest {
  code: string;
  name: string;
  version: number;
}
