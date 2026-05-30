import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe } from '../i18n/translate.pipe';

@Component({
  selector: 'app-reports-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './reports-layout.component.html',
  styleUrl: './reports-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsLayoutComponent {}
