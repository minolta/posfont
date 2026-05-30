import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { JwtAuthService } from './auth/jwt-auth.service';
import { LangSwitchComponent } from './i18n/lang-switch.component';
import { LocaleService } from './i18n/locale.service';
import type { TranslationKey } from './i18n/translations';
import { TranslatePipe } from './i18n/translate.pipe';

type NavLink = {
  path: string;
  labelKey: TranslationKey;
  exact?: boolean;
  auth?: 'in';
  dividerBefore?: boolean;
};

const NAV_LINKS: NavLink[] = [
  { path: '/orders', labelKey: 'nav.orders' },
  { path: '/orders/new', labelKey: 'nav.newOrder' },
  { path: '/foods', labelKey: 'nav.foods' },
  { path: '/foods/new', labelKey: 'nav.addFood' },
  { path: '/food-categories', labelKey: 'nav.categories' },
  { path: '/food-categories/new', labelKey: 'nav.newCategory' },
  { path: '/kitchens', labelKey: 'nav.kitchens' },
  { path: '/kitchens/prep', labelKey: 'nav.kitchenPrep' },
  { path: '/kitchens/new', labelKey: 'nav.addKitchen' },
  { path: '/zones', labelKey: 'nav.zones' },
  { path: '/zones/new', labelKey: 'nav.addZone' },
  { path: '/tables', labelKey: 'nav.tables' },
  { path: '/tables/new', labelKey: 'nav.addTable' },
  { path: '/reports', labelKey: 'nav.reports', exact: false, dividerBefore: true },
  { path: '/manual', labelKey: 'nav.manual' },
  { path: '/users', labelKey: 'nav.users', auth: 'in', dividerBefore: true },
];

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

function normalizeNavPath(url: string): string {
  const path = url.split('?')[0]?.split('#')[0]?.trim() ?? '/';
  const match = NAV_LINKS.find((link) =>
    link.exact === false ? path === link.path || path.startsWith(`${link.path}/`) : path === link.path,
  );
  if (match) {
    return match.path;
  }
  if (path.startsWith('/orders/')) {
    return '/orders';
  }
  if (path.startsWith('/foods/')) {
    return '/foods';
  }
  if (path.startsWith('/food-categories/')) {
    return '/food-categories';
  }
  if (path.startsWith('/kitchens/')) {
    return '/kitchens';
  }
  if (path.startsWith('/zones/')) {
    return '/zones';
  }
  if (path.startsWith('/tables/')) {
    return '/tables';
  }
  return path;
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

  protected readonly navLinks = computed(() =>
    NAV_LINKS.filter((link) => !link.auth || (link.auth === 'in' && this.jwtAuth.isAuthenticated())),
  );

  protected readonly navPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => normalizeNavPath(this.router.url)),
      startWith(normalizeNavPath(this.router.url)),
    ),
    { initialValue: normalizeNavPath(this.router.url) },
  );

  protected onMobileNavChange(ev: Event): void {
    const path = (ev.target as HTMLSelectElement).value;
    if (path) {
      void this.router.navigateByUrl(path);
    }
  }

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
