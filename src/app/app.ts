import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { JwtAuthService } from './auth/jwt-auth.service';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  protected readonly jwtAuth = inject(JwtAuthService);

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
