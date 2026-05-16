import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';
import { JwtAuthService } from './jwt-auth.service';

/** Attaches `Authorization: Bearer` for requests under {@link POS_API_BASE_URL}; skips `/api/auth/login`. */
export const jwtAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(POS_API_BASE_URL);
  const auth = inject(JwtAuthService);

  if (!req.url.startsWith(base)) {
    return next(req);
  }

  const loginPath = `${base}/api/auth/login`;
  if (req.url === loginPath || req.url.startsWith(`${loginPath}?`)) {
    return next(req);
  }

  const token = auth.accessToken();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
