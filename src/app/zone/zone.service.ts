import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { POS_API_BASE_URL, ZONE_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { Zone, ZoneRequest } from './zone.model';

@Injectable({ providedIn: 'root' })
export class ZoneService {
  private readonly http = inject(HttpClient);
  private readonly apiBase =
    inject(ZONE_API_BASE_URL, { optional: true }) ?? inject(POS_API_BASE_URL);
  private readonly rootUrl = `${this.apiBase}/api/zones`;

  /** `GET /api/zones` — optional `q` filters by code or name substring (backend `ZoneService.search`). */
  searchZones(q?: string | null): Observable<Zone[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<Zone[]>(this.rootUrl, { params });
  }

  getZones(): Observable<Zone[]> {
    return this.searchZones();
  }

  getZoneById(id: number): Observable<Zone | undefined> {
    return this.getZones().pipe(map((zones) => zones.find((z) => z.id === id)));
  }

  createZone(request: ZoneRequest): Observable<Zone> {
    return this.http.post<Zone>(this.rootUrl, request);
  }

  updateZone(id: number, request: ZoneRequest): Observable<Zone> {
    return this.http.put<Zone>(`${this.rootUrl}/${id}`, request);
  }

  deleteZone(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }

  /** Absolute URL for `<img [src]>` (cache-busted with `version`). */
  resolvePictureSrc(zone: Zone): string | null {
    if (zone.id == null || !zone.pictureUrl?.trim()) {
      return null;
    }
    const rel = zone.pictureUrl.startsWith('/') ? zone.pictureUrl : `/${zone.pictureUrl}`;
    return `${this.apiBase}${rel}?v=${zone.version}`;
  }

  /** `POST /api/zones/{id}/picture` — multipart field `file`. */
  uploadZonePicture(id: number, file: File): Observable<Zone> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<Zone>(`${this.rootUrl}/${id}/picture`, body);
  }
}
