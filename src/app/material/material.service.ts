import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { Material, MaterialBulkCreateResponse, MaterialRequest, NewMaterialRequest } from './material.model';

@Injectable({ providedIn: 'root' })
export class MaterialService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/materials`;

  searchMaterials(q?: string | null): Observable<Material[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<Material[]>(this.rootUrl, { params });
  }

  getMaterials(): Observable<Material[]> {
    return this.searchMaterials();
  }

  getMaterialById(id: number): Observable<Material | undefined> {
    return this.getMaterials().pipe(map((list) => list.find((m) => m.id === id)));
  }

  createMaterial(request: NewMaterialRequest): Observable<Material> {
    const body: MaterialRequest = {
      code: request.code.trim(),
      name: request.name.trim(),
      unit: request.unit.trim(),
      quantity: request.quantity ?? 0,
      currentPrice: request.currentPrice ?? 0,
      brand: request.brand?.trim() || undefined,
      buyFrom: request.buyFrom?.trim() || undefined,
      version: 0,
    };
    return this.http.post<Material>(this.rootUrl, body);
  }

  updateMaterial(id: number, request: MaterialRequest): Observable<Material> {
    return this.http.put<Material>(`${this.rootUrl}/${id}`, request);
  }

  deleteMaterial(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }

  bulkCreateMaterials(
    rows: Array<{
      code: string;
      name: string;
      unit: string;
      quantity: number;
      currentPrice: number;
      brand?: string | null;
      buyFrom?: string | null;
    }>,
  ): Observable<MaterialBulkCreateResponse> {
    const body = {
      materials: rows.map((r) => ({
        code: r.code.trim(),
        name: r.name.trim(),
        unit: r.unit.trim(),
        quantity: r.quantity,
        currentPrice: r.currentPrice,
        brand: r.brand?.trim() || undefined,
        buyFrom: r.buyFrom?.trim() || undefined,
        version: 0,
      })),
    };
    return this.http.post<MaterialBulkCreateResponse>(`${this.rootUrl}/bulk`, body);
  }
}
