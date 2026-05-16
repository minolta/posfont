import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { POS_API_BASE_URL, POS_USERS_API_ROOT } from '../api/pos-api-base-url.token';

/**
 * Backend contract (default base `{POS_API_BASE_URL}/api/users`, override with {@link POS_USERS_API_ROOT}):
 * - `GET …/users` — list users (JWT required).
 * - `POST …/users` — create user.
 * - `PATCH …/users/{id}` — update fields (`enabled`, `displayName`, `password`, `roles`).
 */
export interface PosUserRecord {
  id: number;
  username: string;
  displayName?: string | null;
  roles?: string[];
  enabled?: boolean;
}

export interface CreatePosUserRequest {
  username: string;
  password: string;
  displayName?: string;
  roles?: string[];
}

export interface UpdatePosUserRequest {
  displayName?: string;
  password?: string;
  roles?: string[];
  enabled?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl =
    inject(POS_USERS_API_ROOT) ?? `${inject(POS_API_BASE_URL)}/api/users`;

  listUsers(): Observable<PosUserRecord[]> {
    return this.http.get<PosUserRecord[]>(this.rootUrl);
  }

  createUser(body: CreatePosUserRequest): Observable<PosUserRecord> {
    return this.http.post<PosUserRecord>(this.rootUrl, body);
  }

  updateUser(id: number, body: UpdatePosUserRequest): Observable<PosUserRecord> {
    return this.http.patch<PosUserRecord>(`${this.rootUrl}/${id}`, body);
  }
}
