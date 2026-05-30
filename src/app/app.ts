import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { PosCurrentUserService } from './auth/pos-current-user.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('posfont');
  protected readonly currentUser = inject(PosCurrentUserService);

  onUserIdInput(value: string): void {
    this.currentUser.setUserId(value);
  }

  userIdInputValue(): string {
    const id = this.currentUser.userIdRef();
    return id != null ? String(id) : '';
  }
}
