import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

const STORAGE_KEY = 'pos_jwt_access_token';

/**
 * Persist the token with `localStorage` (not `sessionStorage`) so **new tabs opened with
 * `window.open()`** — e.g. `/orders/display` facing the guest — receive the same JWT.
 * `sessionStorage` is isolated per tab, which broke customer display API calls after login.
 *
 * Migrates legacy `sessionStorage`-only saves on read.
 */

/**
 * Backend contract (implement on Spring / Node):
 * - `POST /api/auth/login` body `{ username: string; password: string }`
 * - Response JSON includes **one** of: `accessToken`, `token`, or `access_token` (JWT string).
 * - Protected routes validate `Authorization: Bearer <jwt>` (resource server).
 */
export interface JwtLoginResponse {
  accessToken?: string;
  token?: string;
  access_token?: string;
}

@Injectable({ providedIn: 'root' })
export class JwtAuthService {
  private readonly http = inject(HttpClient);
  private readonly apiRoot = inject(POS_API_BASE_URL);

  private readonly tokenSignal = signal<string | null>(this.readStoredToken());

  readonly accessToken = computed(() => this.tokenSignal());

  readonly isAuthenticated = computed(() => {
    const t = this.tokenSignal();
    return typeof t === 'string' && t.length > 0;
  });

  login(username: string, password: string): Observable<JwtLoginResponse> {
    const url = `${this.apiRoot}/api/auth/login`;
    return this.http.post<JwtLoginResponse>(url, { username, password }).pipe(
      tap((body) => {
        const token = this.pickToken(body);
        if (token) {
          this.persistToken(token);
        }
      }),
    );
  }

  logout(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.tokenSignal.set(null);
  }

  private persistToken(token: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, token);
      sessionStorage.removeItem(STORAGE_KEY);
      this.tokenSignal.set(token);
    } catch {
      try {
        sessionStorage.setItem(STORAGE_KEY, token);
        this.tokenSignal.set(token);
      } catch {
        this.tokenSignal.set(token);
      }
    }
  }

  private readStoredToken(): string | null {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (raw != null && raw.length > 0) {
        return raw;
      }
      raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw != null && raw.length > 0) {
        localStorage.setItem(STORAGE_KEY, raw);
        sessionStorage.removeItem(STORAGE_KEY);
      }
      return raw != null && raw.length > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  private pickToken(body: JwtLoginResponse): string | undefined {
    const t = body.accessToken ?? body.token ?? body.access_token;
    return typeof t === 'string' && t.length > 0 ? t : undefined;
  }
}
