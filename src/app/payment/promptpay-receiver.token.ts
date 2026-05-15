import { InjectionToken } from '@angular/core';

/**
 * PromptPay receiving ID — normalized before QR encoding:
 * • **≥15 digits**: e-wallet (BOT TLV 03)
 * • **13–14 digits**: tax / citizen style (BOT TLV 02), value as-entered
 * • **Exactly 10 digits** matching `^0[689]\d{8}$` (084…, 089…): **phone** (BOT TLV 01)
 * • **`66812345678`**: normalized to **`0812345678`** (Thai intl mobile → domestic) before encoding
 * • **Otherwise**: shorter ids use TLV **02** with zero-padding to **13** digits (e.g. `2452692719` → bot value `0002452692719`), not the phone TLV
 * Empty string hides the QR on the pay dialog.
 */
export const PROMPTPAY_RECEIVER_ID = new InjectionToken<string>('PROMPTPAY_RECEIVER_ID', {
  factory: () => '',
});
