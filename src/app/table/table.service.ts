import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { PosTable, TableRequest } from './table.model';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/tables`;

  /** `GET /api/tables` — optional `q` filters by code substring. */
  searchTables(q?: string | null): Observable<PosTable[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<PosTable[]>(this.rootUrl, { params });
  }

  getTables(): Observable<PosTable[]> {
    return this.searchTables();
  }

  getTableById(id: number): Observable<PosTable | undefined> {
    return this.getTables().pipe(map((tables) => tables.find((t) => t.id === id)));
  }

  createTable(request: TableRequest): Observable<PosTable> {
    return this.http.post<PosTable>(this.rootUrl, request);
  }

  updateTable(id: number, request: TableRequest): Observable<PosTable> {
    return this.http.put<PosTable>(`${this.rootUrl}/${id}`, request);
  }

  deleteTable(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }
}
