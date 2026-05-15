import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { devApiResponseLoggerInterceptor } from './api/dev-api-response-logger.interceptor';
import { POS_API_BASE_URL } from './api/pos-api-base-url.token';
import { routes } from './app.routes';
import { PROMPTPAY_RECEIVER_ID } from './payment/promptpay-receiver.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([devApiResponseLoggerInterceptor])),
    provideRouter(routes),
    { provide: POS_API_BASE_URL, useValue: 'http://localhost:8080' },
    /** Empty string hides the QR on the settle dialog. PromptPay QR is usable from any Thai bank app. */
    { provide: PROMPTPAY_RECEIVER_ID, useValue: '0650946307' },
    // Optional: `{ provide: ZONE_API_BASE_URL, useValue: 'http://other-host:8080' }` to use a different API for zones only.
  ]
};
