import { InjectionToken } from '@angular/core';

/** Origin of the POS backend (no trailing slash), e.g. `http://localhost:8080`. */
export const POS_API_BASE_URL = new InjectionToken<string>('POS_API_BASE_URL', {
  factory: () => 'http://localhost:8080',
});

/**
 * Base URL for zone APIs only (`/api/zones`).
 * Omit from `app.config.ts` to use `POS_API_BASE_URL`. Provide to point zones at a different host.
 */
export const ZONE_API_BASE_URL = new InjectionToken<string | undefined>('ZONE_API_BASE_URL');
