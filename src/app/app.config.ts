import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AuthConfig, OAuthStorage, provideOAuthClient } from 'angular-oauth2-oidc';

import { devApiResponseLoggerInterceptor } from './api/dev-api-response-logger.interceptor';
import { jwtAuthInterceptor } from './auth/jwt-auth.interceptor';
import { POS_API_BASE_URL, POS_USERS_API_ROOT } from './api/pos-api-base-url.token';
import { POS_API_BASE_URL_VALUE } from './api/pos-api-base-url.value';
import { routes } from './app.routes';
import { PROMPTPAY_RECEIVER_ID } from './payment/promptpay-receiver.token';

export const authCodeFlowConfig: AuthConfig = {
  issuer: 'https://idsvr4.azurewebsites.net', // Placeholder: Update with your OAuth2 issuer URL
  redirectUri: typeof window !== 'undefined' ? window.location.origin + '/login' : '',
  clientId: 'spa', // Placeholder: Update with your OAuth2 Client ID
  responseType: 'code',
  scope: 'openid profile email offline_access',
  showDebugInformation: true,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtAuthInterceptor, devApiResponseLoggerInterceptor])),
    provideRouter(routes),
    provideOAuthClient(),
    { provide: OAuthStorage, useFactory: () => localStorage },
    { provide: POS_API_BASE_URL, useValue: POS_API_BASE_URL_VALUE },
    /** Empty string hides the QR on the settle dialog. PromptPay QR is usable from any Thai bank app. */
    { provide: PROMPTPAY_RECEIVER_ID, useValue: '0650946307' },
    // Optional: `{ provide: ZONE_API_BASE_URL, useValue: 'http://other-host:8080' }` to use a different API for zones only.
  ]
};

