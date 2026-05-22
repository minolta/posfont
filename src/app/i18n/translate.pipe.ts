import { Pipe, PipeTransform, inject } from '@angular/core';

import { LocaleService } from './locale.service';
import type { TranslationKey } from './translations';

@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(LocaleService);

  transform(key: TranslationKey, params?: Record<string, string | number>): string {
    this.i18n.locale();
    return this.i18n.translate(key, params);
  }
}
