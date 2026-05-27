import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { devApiResponseLoggerInterceptor } from './api/dev-api-response-logger.interceptor';
import { jwtAuthInterceptor } from './auth/jwt-auth.interceptor';
import { POS_API_BASE_URL, POS_USERS_API_ROOT } from './api/pos-api-base-url.token';
import { routes } from './app.routes';
import { PROMPTPAY_RECEIVER_ID } from './payment/promptpay-receiver.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtAuthInterceptor, devApiResponseLoggerInterceptor])),
    provideRouter(routes),
    // Use same-origin API path (`/api`) so Docker/Nginx can reverse-proxy to any backend target.
    { provide: POS_API_BASE_URL, useValue: '' },
    /** Empty string hides the QR on the settle dialog. PromptPay QR is usable from any Thai bank app. */
    { provide: PROMPTPAY_RECEIVER_ID, useValue: '0650946307' },
    // Optional: `{ provide: ZONE_API_BASE_URL, useValue: 'http://other-host:8080' }` to use a different API for zones only.
  ]
};
