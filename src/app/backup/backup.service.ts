import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

export interface BackupExportResponse {
  fileName: string;
  filePath?: string;
  bytes: number;
  message?: string;
  ordersExported: number;
  ordersFromDate?: string | null;
  ordersToDate?: string | null;
}

export interface BackupImportResponse {
  message: string;
  zonesRestored: number;
  printersRestored: number;
  foodCategoriesRestored: number;
  kitchensRestored: number;
  tablesRestored: number;
  foodsRestored: number;
  ordersRestored: number;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/backup`;

  /**
   * `POST /api/backup/export` — ZIP with full master data + orders filtered by calendar `order_date` when bounds set.
   * Dates are inclusive local days (`yyyy-MM-dd`).
   */
  exportAllRecords(
    ordersFromDate?: string,
    ordersToDate?: string,
  ): Observable<BackupExportResponse> {
    let params = new HttpParams();
    const from = ordersFromDate?.trim();
    const to = ordersToDate?.trim();
    if (from) {
      params = params.set('ordersFromDate', from);
    }
    if (to) {
      params = params.set('ordersToDate', to);
    }
    return this.http.post<BackupExportResponse>(`${this.rootUrl}/export`, {}, { params });
  }

  /** `GET /api/backup/download?fileName=` — ZIP attachment (`application/zip`; legacy `.json` still OK). */
  downloadFile(fileName: string): Observable<Blob> {
    const params = new HttpParams().set('fileName', fileName);
    return this.http.get(`${this.rootUrl}/download`, {
      params,
      responseType: 'blob',
    });
  }

  /**
   * `POST /api/backup/import?confirm=true` — multipart `file`; `.zip` (export) or raw `.json`.
   */
  importBackupFile(file: File): Observable<BackupImportResponse> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<BackupImportResponse>(`${this.rootUrl}/import`, body, {
      params: new HttpParams().set('confirm', 'true'),
    });
  }
}
