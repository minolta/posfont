import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pos-current-user-id';

/** POS operator id stored in session until login exists; sent as `userId` / `user_id` on orders and lines. */
@Injectable({ providedIn: 'root' })
export class PosCurrentUserService {
  private readonly userIdSignal = signal<number | null>(this.readStored());

  /** Current operator user id, or null if not set in the header. */
  userId(): number | null {
    return this.userIdSignal();
  }

  /** Reactive id for templates (header input). */
  readonly userIdRef = this.userIdSignal.asReadonly();

  setUserId(raw: string | number | null | undefined): void {
    const trimmed = String(raw ?? '').trim();
    if (trimmed === '') {
      sessionStorage.removeItem(STORAGE_KEY);
      this.userIdSignal.set(null);
      return;
    }
    const id = Math.floor(Number(trimmed));
    if (!Number.isFinite(id) || id < 1) {
      sessionStorage.removeItem(STORAGE_KEY);
      this.userIdSignal.set(null);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, String(id));
    this.userIdSignal.set(id);
  }

  /** Returns id or null; use before create / add-line when the API requires an operator. */
  requireUserId(): number | null {
    return this.userId();
  }

  private readStored(): number | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw == null || raw.trim() === '') {
        return null;
      }
      const id = Math.floor(Number(raw));
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }
}
