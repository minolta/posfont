import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';
import type { FoodCategory, FoodCategoryRequest, NewFoodCategoryRequest } from '../food/food.model';

@Injectable({ providedIn: 'root' })
export class FoodCategoryService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/food-categories`;

  /** `GET /api/food-categories` — optional `q` filters by code or name (substring, case-insensitive). */
  searchFoodCategories(q?: string | null): Observable<FoodCategory[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<FoodCategory[]>(this.rootUrl, { params });
  }

  getFoodCategories(): Observable<FoodCategory[]> {
    return this.searchFoodCategories();
  }

  getFoodCategoryById(id: number): Observable<FoodCategory | undefined> {
    return this.getFoodCategories().pipe(map((list) => list.find((c) => c.id === id)));
  }

  /** `POST /api/food-categories` — create (`FoodCategoryRequest` with `version: 0`). */
  createFoodCategory(request: NewFoodCategoryRequest): Observable<FoodCategory> {
    const body: FoodCategoryRequest = {
      code: request.code.trim(),
      name: request.name?.trim() || undefined,
      version: 0,
    };
    return this.http.post<FoodCategory>(this.rootUrl, body);
  }

  updateFoodCategory(id: number, request: FoodCategoryRequest): Observable<FoodCategory> {
    return this.http.put<FoodCategory>(`${this.rootUrl}/${id}`, request);
  }

  deleteFoodCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }
}
