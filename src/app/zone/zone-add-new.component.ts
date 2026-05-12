import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, map, of, switchMap } from 'rxjs';

import { ZoneService } from './zone.service';

@Component({
  selector: 'app-zone-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './zone-add-new.component.html',
  styleUrl: './zone-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoneAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly zoneService = inject(ZoneService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Required: every new zone must have a photo (`POST /api/zones/{id}/picture` after create). */
  readonly pendingPicture = signal<File | null>(null);
  readonly pictureRequiredHint = signal(false);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/)]],
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)]],
    version: [0, [Validators.required, Validators.min(0)]],
  });

  canSubmit(): boolean {
    return this.form.valid && this.pendingPicture() != null;
  }

  onPictureSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pendingPicture.set(input.files?.[0] ?? null);
  }

  clearPendingPicture(): void {
    this.pendingPicture.set(null);
  }

  submit(): void {
    this.errorMessage.set(null);
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      this.pictureRequiredHint.set(true);
      return;
    }
    this.pictureRequiredHint.set(false);
    const v = this.form.getRawValue();
    const file = this.pendingPicture()!;
    this.submitting.set(true);
    this.zoneService
      .createZone({
        code: (v.code ?? '').trim(),
        name: (v.name ?? '').trim(),
        version: Number(v.version),
      })
      .pipe(
        switchMap((created) => {
          if (created.id == null) {
            this.errorMessage.set('Server did not return a zone id.');
            return of(null);
          }
          const cid = created.id!;
          return this.zoneService.uploadZonePicture(cid, file).pipe(
            map(() => created),
            catchError((uploadErr: unknown) => {
              this.errorMessage.set(this.formatHttpError(uploadErr));
              return this.zoneService.deleteZone(cid).pipe(
                catchError(() => of(void 0)),
                map(() => null),
              );
            }),
          );
        }),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (created) => {
          if (created?.id != null) {
            void this.router.navigate(['/zones'], {
              queryParams: { created: created.id },
            });
          }
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
    return 'Could not create zone or upload picture.';
  }
}
