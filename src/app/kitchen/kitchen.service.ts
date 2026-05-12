import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { Kitchen, KitchenRequest, NewKitchenRequest } from './kitchen.model';

@Injectable({ providedIn: 'root' })
export class KitchenService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/kitchens`;

  searchKitchens(q?: string | null): Observable<Kitchen[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<Kitchen[]>(this.rootUrl, { params });
  }

  getKitchens(): Observable<Kitchen[]> {
    return this.searchKitchens();
  }

  getKitchenById(id: number): Observable<Kitchen | undefined> {
    return this.getKitchens().pipe(map((list) => list.find((k) => k.id === id)));
  }

  /**
   * `POST /api/kitchens` — collection create (`KitchenRequest`: `code`, `name`, `version`;
   * new rows use `version: 0`).
   */
  createKitchen(request: NewKitchenRequest): Observable<Kitchen> {
    const body: KitchenRequest = {
      code: request.code.trim(),
      name: request.name.trim(),
      version: 0,
    };
    return this.http.post<Kitchen>(this.rootUrl, body);
  }

  updateKitchen(id: number, request: KitchenRequest): Observable<Kitchen> {
    return this.http.put<Kitchen>(`${this.rootUrl}/${id}`, request);
  }

  deleteKitchen(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }
}
