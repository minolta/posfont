import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, finalize, map, of, switchMap, timer } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { Material } from './material.model';
import { readMaterialBrand, readMaterialBuyFrom, readMaterialCurrentPrice, readMaterialQuantity } from './material.model';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe, DecimalPipe],
  templateUrl: './material-list.component.html',
  styleUrl: './material-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialListComponent {
  private readonly materialService = inject(MaterialService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LocaleService);

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  readonly importedCount = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('imported'))),
    { initialValue: null as string | null },
  );

  readonly searchTerm = signal('');
  readonly refreshNonce = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly materials = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.materialService.searchMaterials(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set(
                  this.i18n.translate('common.couldNotLoad', {
                    entity: this.i18n.translate('nav.materials'),
                  }),
                );
                return of([] as Material[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as Material[] },
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  readQty(m: Material): number {
    return readMaterialQuantity(m);
  }

  readPrice(m: Material): number {
    return readMaterialCurrentPrice(m);
  }

  readBrand(m: Material): string {
    return readMaterialBrand(m);
  }

  readBuyFrom(m: Material): string {
    return readMaterialBuyFrom(m);
  }

  deleteMaterial(m: Material): void {
    if (m.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`${this.i18n.translate('common.delete')} "${m.code}"?`)) {
      return;
    }
    this.deletingId.set(m.id);
    this.materialService
      .deleteMaterial(m.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(this.extractErrorMessage(err));
        },
      });
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
          return msg;
        }
      }
      if (typeof err.error === 'string' && err.error.trim().length > 0) {
        return err.error;
      }
    }
    return this.i18n.translate('common.couldNotDelete', {
      entity: this.i18n.translate('material.entity'),
    });
  }
}
