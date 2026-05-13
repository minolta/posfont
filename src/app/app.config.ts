import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { devApiResponseLoggerInterceptor } from './api/dev-api-response-logger.interceptor';
import { POS_API_BASE_URL } from './api/pos-api-base-url.token';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([devApiResponseLoggerInterceptor])),
    provideRouter(routes),
    { provide: POS_API_BASE_URL, useValue: 'http://localhost:8080' },
    // Optional: `{ provide: ZONE_API_BASE_URL, useValue: 'http://other-host:8080' }` to use a different API for zones only.
  ]
};
