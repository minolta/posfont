import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { LangSwitchComponent } from '../i18n/lang-switch.component';
import { TranslatePipe } from '../i18n/translate.pipe';

@Component({
  selector: 'app-guest-order-confirmed',
  standalone: true,
  imports: [RouterLink, TranslatePipe, LangSwitchComponent],
  templateUrl: './guest-order-confirmed.component.html',
  styleUrl: './guest-order-confirmed.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestOrderConfirmedComponent {
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal(this.route.snapshot.queryParamMap.get('mode') ?? 'new');
  readonly tableCode = signal(
    this.route.snapshot.queryParamMap.get('tableCode')?.trim() ?? '',
  );
  readonly tableId = signal(this.route.snapshot.queryParamMap.get('tableId')?.trim() ?? '');
}
