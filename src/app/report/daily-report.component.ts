import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import type { DailyReport } from './report.model';
import { ReportService } from './report.service';

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-daily-report',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './daily-report.component.html',
  styleUrl: './daily-report.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyReportComponent {
  private readonly reportService = inject(ReportService);

  readonly startDate = signal(todayYmd());
  readonly endDate = signal(todayYmd());
  readonly report = signal<DailyReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  refresh(): void {
    const start = this.startDate();
    const end = this.endDate();
    this.loading.set(true);
    this.error.set(null);
    this.reportService
      .getReportRange(start, end)
      .pipe(
        finalize(() => this.loading.set(false)),
        catchError((err: unknown) => {
          this.error.set(this.formatError(err));
          return of(null);
        }),
      )
      .subscribe((data) => {
        if (data) {
          this.report.set(data);
        }
      });
  }

  onStartChange(value: string): void {
    let s = value.slice(0, 10);
    let e = this.endDate();
    if (e < s) {
      const t = s;
      s = e;
      e = t;
    }
    this.startDate.set(s);
    this.endDate.set(e);
    this.refresh();
  }

  onEndChange(value: string): void {
    let e = value.slice(0, 10);
    let s = this.startDate();
    if (e < s) {
      const t = s;
      s = e;
      e = t;
    }
    this.startDate.set(s);
    this.endDate.set(e);
    this.refresh();
  }

  isMultiDay(report: DailyReport): boolean {
    return report.startDate !== report.endDate;
  }
  constructor() {
    this.refresh();
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const b = err.error;
      if (typeof b === 'object' && b !== null && 'message' in b) {
        const m = (b as { message?: unknown }).message;
        if (typeof m === 'string' && m.trim()) {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.trim()) {
        return err.error;
      }
      return err.message || `Request failed (${err.status})`;
    }
    return 'Could not load daily report.';
  }
}
