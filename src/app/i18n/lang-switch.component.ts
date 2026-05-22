import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LOCALE_IDS, LOCALE_LABELS, type LocaleId } from './locale-id';
import { LocaleService } from './locale.service';
import { TranslatePipe } from './translate.pipe';

@Component({
  selector: 'app-lang-switch',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lang-switch" role="group" [attr.aria-label]="'lang.switch' | t">
      @for (id of localeIds; track id) {
        <button
          type="button"
          class="lang-btn"
          [class.active]="locale() === id"
          [attr.aria-pressed]="locale() === id"
          (click)="pick(id)"
        >
          {{ labels[id] }}
        </button>
      }
    </div>
  `,
  styles: `
    .lang-switch {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.15rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.06);
    }

    :host(.lang-switch--light) .lang-switch {
      border-color: #ccc;
      background: #f5f5f5;
    }

    .lang-btn {
      border: none;
      background: transparent;
      color: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
      cursor: pointer;
      line-height: 1.2;
    }

    .lang-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    :host(.lang-switch--light) .lang-btn:hover {
      background: rgba(0, 0, 0, 0.06);
    }

    .lang-btn.active {
      background: rgba(255, 255, 255, 0.22);
      color: #fff;
    }

    :host(.lang-switch--light) .lang-btn.active {
      background: #111;
      color: #fff;
    }
  `,
})
export class LangSwitchComponent {
  private readonly i18n = inject(LocaleService);

  readonly localeIds = LOCALE_IDS;
  readonly labels = LOCALE_LABELS;
  readonly locale = this.i18n.locale;

  pick(id: LocaleId): void {
    this.i18n.setLocale(id);
  }
}
