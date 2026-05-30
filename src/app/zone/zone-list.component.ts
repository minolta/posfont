import {
  ChangeDetectionStrategy,
  Component,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, finalize, map, of, switchMap, timer } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { Zone } from './zone.model';
import { ZoneService } from './zone.service';

@Component({
  selector: 'app-zone-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './zone-list.component.html',
  styleUrl: './zone-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneListComponent {
  private readonly zoneService = inject(ZoneService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(LocaleService);

  private readonly brokenPictureIds = signal<Set<number>>(new Set());
  readonly lightboxZone = signal<Zone | null>(null);

  constructor() {
    effect(() => {
      this.zones();
      this.brokenPictureIds.set(new Set());
    });
  }

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  readonly searchTerm = signal('');
  readonly refreshNonce = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly zones = toSignal(
    combineLatest([toObservable(this.searchTerm), toObservable(this.refreshNonce)]).pipe(
      switchMap(([q]) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.zoneService.searchZones(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set(
                  this.i18n.translate('common.couldNotLoad', {
                    entity: this.i18n.translate('zone.entity'),
                  }),
                );
                return of([] as Zone[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as Zone[] },
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  deleteZone(z: Zone): void {
    if (z.id == null) {
      return;
    }
    this.deleteError.set(null);
    if (!window.confirm(`Delete zone "${z.code}"?`)) {
      return;
    }
    this.deletingId.set(z.id);
    this.zoneService
      .deleteZone(z.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => this.refreshNonce.update((n) => n + 1),
        error: (err: unknown) => {
          this.deleteError.set(this.extractErrorMessage(err));
        },
      });
  }

  viewPhotoLabel(z: Zone): string {
    const name = z.name?.trim() || z.code;
    return this.i18n.translate('common.viewPhoto', { name });
  }

  photoDialogLabel(z: Zone): string {
    const name = z.name?.trim() || z.code;
    return this.i18n.translate('common.photoOf', { name });
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim().length > 0) {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.trim().length > 0) {
        return err.error;
      }
    }
    return this.i18n.translate('zone.deleteError');
  }

  pictureSrc(z: Zone): string | null {
    const id = z.id;
    if (id != null && this.brokenPictureIds().has(id)) {
      return null;
    }
    return this.zoneService.resolvePictureSrc(z);
  }

  onPictureError(z: Zone): void {
    const id = z.id;
    if (id == null) {
      return;
    }
    this.brokenPictureIds.update((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (this.lightboxZone()?.id === id) {
      this.lightboxZone.set(null);
    }
  }

  openLightbox(z: Zone): void {
    if (!this.pictureSrc(z)) {
      return;
    }
    this.lightboxZone.set(z);
  }

  closeLightbox(): void {
    this.lightboxZone.set(null);
  }

  onLightboxBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) {
      this.closeLightbox();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.lightboxZone()) {
      this.closeLightbox();
    }
  }
}
