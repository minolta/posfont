import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { markdownToHtml } from './markdown.util';

@Component({
  selector: 'app-user-manual',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './user-manual.component.html',
  styleUrl: './user-manual.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManualComponent {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18n = inject(LocaleService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly html = signal<SafeHtml | null>(null);

  constructor() {
    toObservable(this.i18n.locale)
      .pipe(
        switchMap((locale) => {
          this.loading.set(true);
          this.error.set(null);
          return this.http.get(`/docs/manual-${locale}.md`, { responseType: 'text' }).pipe(
            catchError(() => of(null)),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((md) => {
        if (md == null || md.trim() === '') {
          this.html.set(null);
          this.error.set(this.i18n.translate('manual.loadError'));
          return;
        }
        this.error.set(null);
        this.html.set(this.sanitizer.bypassSecurityTrustHtml(markdownToHtml(md)));
      });
  }
}
