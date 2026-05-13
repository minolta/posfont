import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-reports-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './reports-layout.component.html',
  styleUrl: './reports-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsLayoutComponent {}
