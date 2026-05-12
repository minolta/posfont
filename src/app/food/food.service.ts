import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { Food, FoodCategory, FoodRequest, Kitchen } from './food.model';

@Injectable({ providedIn: 'root' })
export class FoodService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(POS_API_BASE_URL);
  private readonly rootUrl = `${this.apiBase}/api/foods`;

  /**
   * `GET /api/foods` — all foods when `q` omitted/blank; otherwise code or name substring search
   * (same behavior as the backend `FoodService.search` in `api/pos`).
   */
  searchFoods(q?: string | null): Observable<Food[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<Food[]>(this.rootUrl, { params });
  }

  /** All foods (`GET /api/foods` with no `q`). */
  getFoods(): Observable<Food[]> {
    return this.searchFoods();
  }

  /** Resolve one food by id after loading the current list (no `GET /{id}` on the API). */
  getFoodById(id: number): Observable<Food | undefined> {
    return this.getFoods().pipe(map((foods) => foods.find((f) => f.id === id)));
  }

  /**
   * Distinct kitchens and categories seen on current foods (supplement to `GET /api/kitchens` and
   * `GET /api/food-categories` on the add-food form).
   */
  getKitchenCategoryLookups(): Observable<{
    kitchens: Kitchen[];
    categories: FoodCategory[];
  }> {
    return this.getFoods().pipe(
      map((foods) => {
        const byKitchen = new Map<number, Kitchen>();
        const byCategory = new Map<number, FoodCategory>();
        for (const f of foods) {
          const kid = f.kitchen?.id;
          if (kid != null) {
            byKitchen.set(kid, f.kitchen as Kitchen);
          }
          const cid = f.foodCategory?.id;
          if (cid != null) {
            byCategory.set(cid, f.foodCategory as FoodCategory);
          }
        }
        return {
          kitchens: [...byKitchen.values()].sort((a, b) =>
            a.code.localeCompare(b.code),
          ),
          categories: [...byCategory.values()].sort((a, b) =>
            a.code.localeCompare(b.code),
          ),
        };
      }),
      catchError(() => of({ kitchens: [], categories: [] })),
    );
  }

  /** Client-side filter by food category `code` (case-insensitive). */
  getFoodsByCategoryCode(categoryCode: string): Observable<Food[]> {
    const c = categoryCode.trim().toLowerCase();
    return this.getFoods().pipe(
      map((foods) =>
        foods.filter((f) => (f.foodCategory?.code ?? '').toLowerCase() === c),
      ),
    );
  }

  /** Absolute URL for `<img [src]>` (includes cache-busting version query). */
  resolvePictureSrc(food: Food): string | null {
    if (food.id == null || !food.pictureUrl?.trim()) {
      return null;
    }
    const rel = food.pictureUrl.startsWith('/') ? food.pictureUrl : `/${food.pictureUrl}`;
    return `${this.apiBase}${rel}?v=${food.version}`;
  }

  /** `POST /api/foods/{id}/picture` — multipart field `file`; returns updated `Food` (new `version`). */
  uploadFoodPicture(id: number, file: File): Observable<Food> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<Food>(`${this.rootUrl}/${id}/picture`, body);
  }

  /** `POST /api/foods` — returns created `Food` (201). */
  createFood(request: FoodRequest): Observable<Food> {
    return this.http.post<Food>(this.rootUrl, request);
  }

  /** `PUT /api/foods/{id}`. */
  updateFood(id: number, request: FoodRequest): Observable<Food> {
    return this.http.put<Food>(`${this.rootUrl}/${id}`, request);
  }

  /** `DELETE /api/foods/{id}` (204). */
  deleteFood(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }
}
