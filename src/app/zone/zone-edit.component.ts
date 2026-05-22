import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, map, switchMap } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import type { Zone, ZoneRequest } from './zone.model';
import { ZoneService } from './zone.service';

@Component({
  selector: 'app-zone-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './zone-edit.component.html',
  styleUrl: './zone-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly zoneService = inject(ZoneService);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly zoneId = signal<number | null>(null);
  readonly loadedZone = signal<Zone | null>(null);

  readonly pictureFile = signal<File | null>(null);
  readonly pictureUploading = signal(false);
  readonly pictureUploadError = signal<string | null>(null);
  readonly photoRequiredHint = signal(false);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set(
              this.i18n.translate('common.invalidId', {
                entity: this.i18n.translate('zone.entity'),
              }),
            );
            this.zoneId.set(null);
            this.loadedZone.set(null);
            return EMPTY;
          }
          this.zoneId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return this.zoneService.getZoneById(id).pipe(
            catchError(() => {
              this.loadError.set(
                this.i18n.translate('common.couldNotLoad', {
                  entity: this.i18n.translate('zone.entity'),
                }),
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((zone) => {
        if (!zone) {
          this.loadError.set(
            this.i18n.translate('common.notFound', {
              entity: this.i18n.translate('zone.entity'),
            }),
          );
          this.loadedZone.set(null);
          return;
        }
        this.loadError.set(null);
        this.loadedZone.set(zone);
        this.form.patchValue({
          code: zone.code,
          name: zone.name,
          version: zone.version,
        });
      });
  }

  hasZonePhoto(): boolean {
    const z = this.loadedZone();
    if (z != null && this.zoneService.resolvePictureSrc(z) != null) {
      return true;
    }
    return this.pictureFile() != null;
  }

  canSubmitForm(): boolean {
    return this.form.valid && this.hasZonePhoto();
  }

  currentPictureSrc(): string | null {
    const z = this.loadedZone();
    return z ? this.zoneService.resolvePictureSrc(z) : null;
  }

  onPictureFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pictureFile.set(input.files?.[0] ?? null);
  }

  uploadPicture(): void {
    const id = this.zoneId();
    const file = this.pictureFile();
    if (id == null || file == null) {
      return;
    }
    this.pictureUploadError.set(null);
    this.pictureUploading.set(true);
    this.zoneService
      .uploadZonePicture(id, file)
      .pipe(finalize(() => this.pictureUploading.set(false)))
      .subscribe({
        next: (updated) => {
          this.loadedZone.set(updated);
          this.form.patchValue({ version: updated.version });
          this.pictureFile.set(null);
        },
        error: (err: unknown) => {
          this.pictureUploadError.set(this.formatHttpError(err));
        },
      });
  }

  submit(): void {
    this.saveError.set(null);
    const id = this.zoneId();
    if (id == null) {
      return;
    }
    if (!this.canSubmitForm()) {
      this.form.markAllAsTouched();
      this.photoRequiredHint.set(true);
      return;
    }
    this.photoRequiredHint.set(false);
    const v = this.form.getRawValue();
    const body: ZoneRequest = {
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      version: Number(v.version),
    };
    const file = this.pictureFile();

    this.submitting.set(true);
    const request$ =
      file != null
        ? this.zoneService.uploadZonePicture(id, file).pipe(
            switchMap((u) =>
              this.zoneService.updateZone(id, {
                ...body,
                version: u.version,
              }),
            ),
          )
        : this.zoneService.updateZone(id, body);

    request$.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: () => {
        void this.router.navigate(['/zones'], {
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
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotSave', {
      entity: this.i18n.translate('zone.entity'),
    });
  }
}
