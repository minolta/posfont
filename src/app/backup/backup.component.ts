import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import type { BackupExportResponse, BackupImportResponse } from './backup.service';
import { BackupService } from './backup.service';

@Component({
  selector: 'app-backup',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupComponent {
  private readonly backupService = inject(BackupService);
  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('importFile');

  readonly exporting = signal(false);
  readonly downloading = signal(false);
  readonly importing = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastExport = signal<BackupExportResponse | null>(null);
  readonly importResult = signal<BackupImportResponse | null>(null);
  readonly importAck = signal(false);
  readonly pendingImportFileName = signal<string | null>(null);
  private pendingImportFile: File | null = null;

  readonly canImport = (): boolean =>
    !!this.pendingImportFile && this.importAck() && !this.importing() && !this.exporting();

  createBackup(): void {
    this.exporting.set(true);
    this.error.set(null);
    this.importResult.set(null);
    this.backupService
      .exportAllRecords()
      .pipe(
        finalize(() => this.exporting.set(false)),
        catchError((err: unknown) => {
          this.setHttpOrGenericError(err);
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (res) {
          this.lastExport.set(res);
        }
      });
  }

  downloadLast(): void {
    const fn = this.lastExport()?.fileName?.trim();
    if (!fn) {
      return;
    }
    this.downloading.set(true);
    this.error.set(null);
    this.backupService
      .downloadFile(fn)
      .pipe(
        finalize(() => this.downloading.set(false)),
        catchError((err: unknown) => {
          this.setHttpOrGenericError(err);
          return of(null);
        }),
      )
      .subscribe((blob) => {
        if (!(blob instanceof Blob) || blob.size === 0) {
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  onImportFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.pendingImportFile = f;
    this.pendingImportFileName.set(f?.name ?? null);
    this.importResult.set(null);
    this.error.set(null);
  }

  toggleImportAck(checked: boolean): void {
    this.importAck.set(checked);
  }

  importBackup(): void {
    const f = this.pendingImportFile;
    if (!f || !this.importAck()) {
      return;
    }
    this.importing.set(true);
    this.error.set(null);
    this.importResult.set(null);
    this.backupService
      .importBackupFile(f)
      .pipe(
        finalize(() => this.importing.set(false)),
        catchError((err: unknown) => {
          this.setHttpOrGenericError(err);
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (res) {
          this.importResult.set(res);
          this.pendingImportFile = null;
          this.pendingImportFileName.set(null);
          this.importAck.set(false);
          const el = this.fileInput()?.nativeElement;
          if (el) {
            el.value = '';
          }
        }
      });
  }

  formatBytes(raw: number | null | undefined): string {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    if (n < 1024) {
      return `${Math.round(n)} B`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  private setHttpOrGenericError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      this.extractHttpErrorMessage(err).then((msg) => this.error.set(msg));
      return;
    }
    this.error.set('Backup request failed.');
  }

  private async extractHttpErrorMessage(err: HttpErrorResponse): Promise<string> {
    let body = '';
    const raw = err.error;
    if (raw instanceof Blob) {
      try {
        body = (await raw.text()).trim();
      } catch {
        body = '';
      }
    } else if (typeof raw === 'string') {
      body = raw.trim();
    } else if (raw && typeof raw === 'object' && 'message' in raw) {
      const m = (raw as { message?: unknown }).message;
      if (typeof m === 'string') {
        body = m.trim();
      }
    }
    const msg = body || err.message || 'Request failed';
    return `${msg} (${err.status})`;
  }
}
