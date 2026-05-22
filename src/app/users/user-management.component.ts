import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { JwtAuthService } from '../auth/jwt-auth.service';
import type { PosUserRecord } from './users.service';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { UsersService } from './users.service';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagementComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersService = inject(UsersService);
  private readonly jwtAuth = inject(JwtAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly listError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly users = signal<PosUserRecord[]>([]);

  readonly createForm = this.fb.group({
    username: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(4096)]],
    displayName: ['', [Validators.maxLength(255)]],
    rolesCsv: ['', [Validators.maxLength(512)]],
  });

  constructor() {
    this.reloadUsers();
  }

  logout(): void {
    this.jwtAuth.logout();
    void this.router.navigate(['/login']);
  }

  reloadUsers(): void {
    this.listError.set(null);
    this.loading.set(true);
    this.usersService
      .listUsers()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (rows) => this.users.set(rows ?? []),
        error: (err: unknown) => this.listError.set(this.formatHttpError(err, 'Could not load users.')),
      });
  }

  createUser(): void {
    this.formError.set(null);
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const v = this.createForm.getRawValue();
    const roles = this.parseRolesCsv(v.rolesCsv ?? '');
    this.saving.set(true);
    this.usersService
      .createUser({
        username: (v.username ?? '').trim(),
        password: v.password ?? '',
        displayName: (v.displayName ?? '').trim() || undefined,
        roles: roles.length ? roles : undefined,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.createForm.reset({
            username: '',
            password: '',
            displayName: '',
            rolesCsv: '',
          });
          this.reloadUsers();
        },
        error: (err: unknown) => this.formError.set(this.formatHttpError(err, this.i18n.translate('users.couldNotCreate'))),
      });
  }

  rolesLabel(roles?: string[] | null): string {
    if (!roles?.length) {
      return this.i18n.translate('common.emptyDash');
    }
    return roles.join(', ');
  }

  toggleEnabled(user: PosUserRecord): void {
    const next = !(user.enabled !== false);
    this.usersService.updateUser(user.id, { enabled: next }).subscribe({
      next: (updated) => {
        this.users.update((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      },
      error: (err: unknown) => this.listError.set(this.formatHttpError(err, this.i18n.translate('users.couldNotUpdate'))),
    });
  }

  private parseRolesCsv(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private formatHttpError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404) {
        return `${fallback} ${this.i18n.translate('users.api404Hint')}`;
      }
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string') {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.length > 0) {
        return err.error;
      }
      return err.message || this.i18n.translate('common.requestFailedHttp', { status: err.status });
    }
    return fallback;
  }
}
