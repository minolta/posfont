import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { JwtAuthService } from './jwt-auth.service';

/** Requires a stored JWT (session); redirects to `/login` with `returnUrl`. */
export const jwtAuthGuard: CanActivateFn = () => {
  const auth = inject(JwtAuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: router.url },
  });
};
