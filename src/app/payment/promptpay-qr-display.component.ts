import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { DecimalPipe } from '@angular/common';

import { PromptPayQrService } from './prompt-pay-qr.service';
import { PROMPTPAY_RECEIVER_ID } from './promptpay-receiver.token';

/** Renders Thai PromptPay merchant QR when {@link PROMPTPAY_RECEIVER_ID} is configured. */
@Component({
  selector: 'app-promptpay-qr-display',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './promptpay-qr-display.component.html',
  styleUrl: './promptpay-qr-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptPayQrDisplayComponent {
  readonly amountBaht = input.required<number>();

  private readonly qr = inject(PromptPayQrService);
  private readonly receiverId = inject(PROMPTPAY_RECEIVER_ID);

  readonly dataUrl = signal<string | null>(null);

  /** Avoid stale async results when amount changes quickly while the dialog is open. */
  private loadGeneration = 0;

  constructor() {
    effect(() => {
      const amt = this.amountBaht();
      const hasId = untracked(() => this.receiverId.trim() !== '');
      if (!hasId) {
        untracked(() => this.dataUrl.set(null));
        return;
      }
      const gen = ++this.loadGeneration;
      void this.qr.makePayQrDataUrl(amt).then((url) => {
        if (gen === this.loadGeneration) {
          this.dataUrl.set(url);
        }
      });
    });
  }
}
