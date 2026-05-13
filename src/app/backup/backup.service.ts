import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

export interface BackupExportResponse {
  fileName: string;
  filePath?: string;
  bytes: number;
  message?: string;
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

  /** `POST /api/backup/export` — writes JSON under server `app.backup-dir`. */
  exportAllRecords(): Observable<BackupExportResponse> {
    return this.http.post<BackupExportResponse>(`${this.rootUrl}/export`, {});
  }

  /** `GET /api/backup/download?fileName=` — attachment JSON from last export (or known name). */
  downloadFile(fileName: string): Observable<Blob> {
    const params = new HttpParams().set('fileName', fileName);
    return this.http.get(`${this.rootUrl}/download`, {
      params,
      responseType: 'blob',
    });
  }

  /**
   * `POST /api/backup/import?confirm=true` — multipart `file`; replaces all POS data with backup JSON.
   */
  importBackupFile(file: File): Observable<BackupImportResponse> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<BackupImportResponse>(`${this.rootUrl}/import`, body, {
      params: new HttpParams().set('confirm', 'true'),
    });
  }
}
