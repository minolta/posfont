import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap, timer } from 'rxjs';

import type { Kitchen } from './kitchen.model';
import { KitchenService } from './kitchen.service';

@Component({
  selector: 'app-kitchen-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './kitchen-list.component.html',
  styleUrl: './kitchen-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenListComponent {
  private readonly kitchenService = inject(KitchenService);
  private readonly route = inject(ActivatedRoute);

  readonly createdId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('created'))),
    { initialValue: null as string | null },
  );

  readonly updatedId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('updated'))),
    { initialValue: null as string | null },
  );

  readonly searchTerm = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly kitchens = toSignal(
    toObservable(this.searchTerm).pipe(
      distinctUntilChanged(),
      switchMap((q) => {
        this.loading.set(true);
        this.error.set(null);
        const trimmed = q.trim();
        return timer(trimmed ? 300 : 0).pipe(
          switchMap(() =>
            this.kitchenService.searchKitchens(trimmed || undefined).pipe(
              catchError(() => {
                this.error.set('Could not load kitchens. Check that the API is running.');
                return of([] as Kitchen[]);
              }),
              finalize(() => this.loading.set(false)),
            ),
          ),
        );
      }),
    ),
    { initialValue: [] as Kitchen[] },
  );

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }
}
