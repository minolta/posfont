import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of } from 'rxjs';

import type { Zone } from '../zone/zone.model';
import { ZoneService } from '../zone/zone.service';
import { TableService } from './table.service';

@Component({
  selector: 'app-table-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './table-add-new.component.html',
  styleUrl: './table-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly tableService = inject(TableService);
  private readonly zoneService = inject(ZoneService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly zoneSearch = signal('');

  readonly zones = toSignal(
    forkJoin({
      zonesApi: this.zoneService.getZones().pipe(catchError(() => of([] as Zone[]))),
      fromTables: this.tableService.getTables().pipe(
        map((tables) => {
          const byId = new Map<number, Zone>();
          for (const t of tables) {
            const z = t.zone;
            const id = z?.id;
            if (id != null) {
              byId.set(id, z as Zone);
            }
          }
          return [...byId.values()];
        }),
        catchError(() => of([] as Zone[])),
      ),
    }).pipe(
      map(({ zonesApi, fromTables }) => {
        const byId = new Map<number, Zone>();
        for (const z of zonesApi) {
          if (z.id != null) {
            byId.set(z.id, z);
          }
        }
        for (const z of fromTables) {
          if (z.id != null && !byId.has(z.id)) {
            byId.set(z.id, z);
          }
        }
        return [...byId.values()].sort((a, b) => {
          const an = ((a.name ?? '').trim() || a.code).toLowerCase();
          const bn = ((b.name ?? '').trim() || b.code).toLowerCase();
          const cmp = an.localeCompare(bn);
          return cmp !== 0 ? cmp : a.code.localeCompare(b.code);
        });
      }),
      catchError(() => of([] as Zone[])),
    ),
    { initialValue: [] as Zone[] },
  );

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    basePrice: [0, [Validators.required, Validators.min(0)]],
    zoneId: [''],
    manualZoneId: [''],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  zoneOptionLabel(z: Zone): string {
    const name = (z.name ?? '').trim();
    const code = (z.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || `#${z.id ?? '?'}`;
  }

  filterZones(zs: Zone[]): Zone[] {
    const q = this.zoneSearch().trim().toLowerCase();
    const raw = this.form.getRawValue().zoneId;
    const selId = Number(raw);
    const base = !q
      ? zs
      : zs.filter(
          (z) =>
            (z.name ?? '').toLowerCase().includes(q) ||
            z.code.toLowerCase().includes(q) ||
            String(z.id ?? '').toLowerCase().includes(q),
        );
    if (!Number.isFinite(selId) || selId < 1) {
      return base;
    }
    const picked = zs.find((z) => z.id === selId);
    if (!picked || base.some((z) => z.id === selId)) {
      return base;
    }
    return [picked, ...base];
  }

  canSubmit(): boolean {
    const f = this.form;
    if (f.controls.code.invalid || f.controls.basePrice.invalid || f.controls.version.invalid) {
      return false;
    }
    const lists = this.zones();
    if (lists.length > 0) {
      const id = Number(f.getRawValue().zoneId);
      return Number.isFinite(id) && id >= 1;
    }
    const mz = Number(f.getRawValue().manualZoneId);
    return Number.isFinite(mz) && mz >= 1;
  }

  submit(): void {
    this.errorMessage.set(null);
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const lists = this.zones();
    const zoneId =
      lists.length > 0 ? Number(v.zoneId) : Number(v.manualZoneId);
    this.submitting.set(true);
    this.tableService
      .createTable({
        code: (v.code ?? '').trim(),
        basePrice: Number(v.basePrice),
        zoneId,
        version: Number(v.version),
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/tables'], {
            queryParams: { created: created.id },
          });
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.formatHttpError(err));
        },
      });
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
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
      return err.message || `Request failed (${err.status})`;
    }
    return 'Could not create table.';
  }
}
