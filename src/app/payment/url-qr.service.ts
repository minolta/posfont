import { Injectable } from '@angular/core';
import QRCode from 'qrcode';

@Injectable({ providedIn: 'root' })
export class UrlQrService {
  /** PNG data URL for an arbitrary URL or text payload (e.g. link to open in phone browser). */
  async toDataUrl(text: string): Promise<string | null> {
    const t = text.trim();
    if (t.length === 0) {
      return null;
    }
    try {
      return await QRCode.toDataURL(t, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return null;
    }
  }
}
