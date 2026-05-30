import { inject, Injectable } from '@angular/core';
import QRCode from 'qrcode';

import { buildPromptPayQrPayload, normalizeThaiPromptPayDigits } from './prompt-pay-payload';
import { PROMPTPAY_RECEIVER_ID } from './promptpay-receiver.token';

@Injectable({ providedIn: 'root' })
export class PromptPayQrService {
  private readonly receiverId = inject(PROMPTPAY_RECEIVER_ID);

  /** PNG data URL for scanning, or null if receiver id is unset / amount invalid / generation fails. */
  async makePayQrDataUrl(amountBaht: number): Promise<string | null> {
    const id = this.receiverId.trim();
    const digitsOnly = normalizeThaiPromptPayDigits(id);
    if (digitsOnly === '' || !Number.isFinite(amountBaht) || amountBaht <= 0) {
      return null;
    }
    try {
      const rounded = Math.round(amountBaht * 100) / 100;
      const payload = buildPromptPayQrPayload(digitsOnly, { amount: rounded });      return await QRCode.toDataURL(payload, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return null;
    }
  }
}
