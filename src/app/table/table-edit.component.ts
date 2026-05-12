import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import type { Zone } from '../zone/zone.model';
import { ZoneService } from '../zone/zone.service';
import type { PosTable, TableRequest } from './table.model';
import { TableService } from './table.service';

@Component({
  selector: 'app-table-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './table-edit.component.html',
  styleUrl: './table-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tableService = inject(TableService);
  private readonly zoneService = inject(ZoneService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly tableId = signal<number | null>(null);
  readonly zoneSearch = signal('');

  readonly zones = signal<Zone[]>([]);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    basePrice: [0, [Validators.required, Validators.min(0)]],
    zoneId: [''],
    manualZoneId: [''],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set('Invalid table id.');
            this.tableId.set(null);
            return EMPTY;
          }
          this.tableId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return forkJoin({
            table: this.tableService.getTableById(id).pipe(
              catchError(() => {
                this.loadError.set('Could not load table.');
                return of(undefined as PosTable | undefined);
              }),
            ),
            zonesApi: this.zoneService.getZones().pipe(catchError(() => of([] as Zone[]))),
            fromTables: this.tableService.getTables().pipe(
              map((tables) => {
                const byId = new Map<number, Zone>();
                for (const t of tables) {
                  const z = t.zone;
                  const zid = z?.id;
                  if (zid != null) {
                    byId.set(zid, z as Zone);
                  }
                }
                return [...byId.values()];
              }),
              catchError(() => of([] as Zone[])),
            ),
          }).pipe(
            map(({ table, zonesApi, fromTables }) => ({ table, zones: mergeZones(zonesApi, fromTables) })),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ table, zones }) => {
        this.zones.set(zones);
        if (!table) {
          if (!this.loadError()) {
            this.loadError.set('Table not found.');
          }
          return;
        }
        this.loadError.set(null);
        const zid = table.zone?.id;
        this.form.patchValue({
          code: table.code,
          basePrice: table.basePrice,
          zoneId: zid != null ? String(zid) : '',
          manualZoneId: zid != null ? String(zid) : '',
          version: table.version,
        });
      });
  }

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

  canSubmitForm(): boolean {
    const f = this.form;
    if (f.controls.code.invalid || f.controls.basePrice.invalid || f.controls.version.invalid) {
      return false;
    }
    const zs = this.zones();
    if (zs.length > 0) {
      const id = Number(f.getRawValue().zoneId);
      return Number.isFinite(id) && id >= 1;
    }
    const mz = Number(f.getRawValue().manualZoneId);
    return Number.isFinite(mz) && mz >= 1;
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.tableId();
    if (id == null || !this.canSubmitForm()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const zs = this.zones();
    const zoneId = zs.length > 0 ? Number(v.zoneId) : Number(v.manualZoneId);
    const body: TableRequest = {
      code: (v.code ?? '').trim(),
      basePrice: Number(v.basePrice),
      zoneId,
      version: Number(v.version),
    };
    this.submitting.set(true);
    this.tableService
      .updateTable(id, body)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/tables'], {
            queryParams: { updated: id },
          });
        },
        error: (err: unknown) => {
          this.saveError.set(this.formatHttpError(err));
        },
      });
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const b = err.error;
      if (typeof b === 'object' && b !== null && 'message' in b) {
        const m = (b as { message?: unknown }).message;
        if (typeof m === 'string') {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.length > 0) {
        return err.error;
      }
      return err.message || `Request failed (${err.status})`;
    }
    return 'Could not save table.';
  }
}

function mergeZones(a: Zone[], b: Zone[]): Zone[] {
  const byId = new Map<number, Zone>();
  for (const z of a) {
    if (z.id != null) {
      byId.set(z.id, z);
    }
  }
  for (const z of b) {
    if (z.id != null && !byId.has(z.id)) {
      byId.set(z.id, z);
    }
  }
  return [...byId.values()].sort((x, y) => {
    const xn = ((x.name ?? '').trim() || x.code).toLowerCase();
    const yn = ((y.name ?? '').trim() || y.code).toLowerCase();
    const c = xn.localeCompare(yn);
    return c !== 0 ? c : x.code.localeCompare(y.code);
  });
}
