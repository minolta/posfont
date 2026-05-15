import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { CustomerDisplaySessionService } from './customer-display-session.service';

/**
 * Handles old bookmarks `/orders/:id/display`: records the id and navigates to `/orders/display`.
 */
@Component({
  selector: 'app-customer-display-legacy-redirect',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDisplayLegacyRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(CustomerDisplaySessionService);

  ngOnInit(): void {
    const raw = Number(this.route.snapshot.paramMap.get('id') ?? '');
    if (Number.isFinite(raw) && raw > 0) {
      this.session.focusOrder(raw);
    }
    void this.router.navigate(['/orders', 'display'], { replaceUrl: true });
  }
}
