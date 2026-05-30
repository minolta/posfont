import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { tap } from 'rxjs';

/** In dev builds, logs each HTTP response body from the app to the browser console. */
export const devApiResponseLoggerInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isDevMode()) {
    return next(req);
  }
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          console.log('[API]', req.method, req.urlWithParams, event.body);
        }
      },
      error: (err: unknown) => {
        console.error('[API]', req.method, req.urlWithParams, err);
      },
    })
  );
};
