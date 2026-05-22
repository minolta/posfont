import { Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { JwtAuthService } from './auth/jwt-auth.service';
import { LangSwitchComponent } from './i18n/lang-switch.component';
import { LocaleService } from './i18n/locale.service';
import { TranslatePipe } from './i18n/translate.pipe';

function shouldHideStaffChrome(rawUrl: string): boolean {
  const pathMatch = rawUrl.match(/^([^?#]*)/);
  const path = (pathMatch?.[1] ?? '').trim();

  if (path === '/guest' || path.startsWith('/guest/')) {
    return true;
  }

  if (path === '/login') {
    return true;
  }

  if (path === '/orders/new/line-picker') {
    const qs = rawUrl.split('?')[1]?.split('#')[0];
    if (qs) {
      return new URLSearchParams(qs).get('from') === 'guest';
    }
  }

  return false;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LangSwitchComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  protected readonly jwtAuth = inject(JwtAuthService);

  ngOnInit(): void {
    this.locale.setLocale(this.locale.locale());
  }

  protected readonly title = signal('posfont');

  protected logout(): void {
    this.jwtAuth.logout();
    void this.router.navigate(['/login']);
  }

  /** Main POS chrome (header + links); hidden for `/guest/**` and guest line-picker (`from=guest`). */
  protected readonly staffChromeVisible = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => !shouldHideStaffChrome(this.router.url)),
      startWith(!shouldHideStaffChrome(this.router.url)),
    ),
    { initialValue: !shouldHideStaffChrome(this.router.url) },
  );
}
