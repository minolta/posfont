import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';

import { FoodCategoryService } from '../food-category/food-category.service';
import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { MaterialService } from '../material/material.service';
import type { Material } from '../material/material.model';
import {
  bomMaterialUnit,
  buildBomLineRequests,
  filterMaterialsForBom,
  materialOptionLabel,
  newBomLineGroup,
} from './food-bom-form.util';
import type { FoodCategory, Kitchen } from './food.model';
import { FoodService } from './food.service';
import { KitchenService } from '../kitchen/kitchen.service';

@Component({
  selector: 'app-food-add-new',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './food-add-new.component.html',
  styleUrl: './food-add-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodAddNewComponent {
  private readonly fb = inject(FormBuilder);
  private readonly foodService = inject(FoodService);
  private readonly kitchenService = inject(KitchenService);
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly materialService = inject(MaterialService);
  private readonly router = inject(Router);
  private readonly i18n = inject(LocaleService);

  /**
   * Kitchens: `GET /api/kitchens` merged with kitchens on foods. Categories: `GET /api/food-categories`
   * merged with categories on foods. Select labels use name; form values are ids.
   */
  readonly lookups = toSignal(
    forkJoin({
      fromFoods: this.foodService.getKitchenCategoryLookups(),
      kitchensApi: this.kitchenService.getKitchens().pipe(catchError(() => of([] as Kitchen[]))),
      categoriesApi: this.foodCategoryService
        .getFoodCategories()
        .pipe(catchError(() => of([] as FoodCategory[]))),
    }).pipe(
      map(({ fromFoods, kitchensApi, categoriesApi }) => {
        const byKitchen = new Map<number, Kitchen>();
        for (const k of kitchensApi) {
          if (k.id != null) {
            byKitchen.set(k.id, k);
          }
        }
        for (const k of fromFoods.kitchens) {
          if (k.id != null && !byKitchen.has(k.id)) {
            byKitchen.set(k.id, k);
          }
        }
        const kitchens = [...byKitchen.values()].sort((a, b) => {
          const an = (a.name || a.code).toLowerCase();
          const bn = (b.name || b.code).toLowerCase();
          const cmp = an.localeCompare(bn);
          return cmp !== 0 ? cmp : a.code.localeCompare(b.code);
        });

        const byCategory = new Map<number, FoodCategory>();
        for (const c of categoriesApi) {
          if (c.id != null) {
            byCategory.set(c.id, c);
          }
        }
        for (const c of fromFoods.categories) {
          if (c.id != null && !byCategory.has(c.id)) {
            byCategory.set(c.id, c);
          }
        }
        const categories = [...byCategory.values()].sort((a, b) => {
          const an = ((a.name ?? '').trim() || a.code).toLowerCase();
          const bn = ((b.name ?? '').trim() || b.code).toLowerCase();
          const cmp = an.localeCompare(bn);
          return cmp !== 0 ? cmp : a.code.localeCompare(b.code);
        });

        return { kitchens, categories };
      }),
      catchError(() => of({ kitchens: [] as Kitchen[], categories: [] as FoodCategory[] })),
    ),
    { initialValue: { kitchens: [] as Kitchen[], categories: [] as FoodCategory[] } },
  );

  /** Filters kitchen `<select>` options (name, code, or id substring, case-insensitive). */
  readonly kitchenSearch = signal('');
  /** Filters category `<select>` options (name, code, or id substring, case-insensitive). */
  readonly categorySearch = signal('');
  readonly bomMaterialSearch = signal('');

  readonly materials = toSignal(
    this.materialService.getMaterials().pipe(catchError(() => of([] as Material[]))),
    { initialValue: [] as Material[] },
  );

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Optional image uploaded after the food row is created. */
  readonly pendingPicture = signal<File | null>(null);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/)]],
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    basePrice: [0, [Validators.required, Validators.min(0)]],
    /** When true, this SKU cannot be added to orders (kitchen-only listing). */
    blockOrderLine: [false],
    /** Set when the kitchen `<select>` is shown; value is kitchen id as string. */
    kitchenId: [''],
    /** When no kitchen list is loaded: type name, code, or id — resolved via `GET /api/kitchens?q=` on save. */
    manualKitchenQuery: [''],
    foodCategoryId: ['', Validators.required],
    version: [0, [Validators.required, Validators.min(0)]],
    bomLines: this.fb.array<FormGroup>([]),
  });

  get bomLines(): FormArray<FormGroup> {
    return this.form.get('bomLines') as FormArray<FormGroup>;
  }

  readonly materialOptionLabel = materialOptionLabel;
  readonly filterMaterialsForBom = filterMaterialsForBom;
  readonly bomMaterialUnit = bomMaterialUnit;

  filterKitchens(ks: Kitchen[]): Kitchen[] {
    const q = this.kitchenSearch().trim().toLowerCase();
    const raw = this.form.getRawValue().kitchenId;
    const selId = Number(raw);
    const base = !q
      ? ks
      : ks.filter(
          (k) =>
            (k.name ?? '').toLowerCase().includes(q) ||
            k.code.toLowerCase().includes(q) ||
            String(k.id ?? '').toLowerCase().includes(q),
        );
    if (!Number.isFinite(selId) || selId < 1) {
      return base;
    }
    const picked = ks.find((k) => k.id === selId);
    if (!picked || base.some((k) => k.id === selId)) {
      return base;
    }
    return [picked, ...base];
  }

  /** Label for kitchen `<option>`: name first (selection by name); `value` remains id. */
  kitchenOptionLabel(k: Kitchen): string {
    const name = (k.name ?? '').trim();
    const code = (k.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || `#${k.id ?? '?'}`;
  }

  /** Label for category `<option>`: name first; `value` remains id. */
  categoryOptionLabel(c: FoodCategory): string {
    const name = (c.name ?? '').trim();
    const code = (c.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || `#${c.id ?? '?'}`;
  }

  filterCategories(cs: FoodCategory[]): FoodCategory[] {
    const q = this.categorySearch().trim().toLowerCase();
    const raw = this.form.getRawValue().foodCategoryId;
    const selId = Number(raw);
    const base = !q
      ? cs
      : cs.filter(
          (c) =>
            (c.name ?? '').toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q) ||
            String(c.id ?? '').toLowerCase().includes(q),
        );
    if (!Number.isFinite(selId) || selId < 1) {
      return base;
    }
    const picked = cs.find((c) => c.id === selId);
    if (!picked || base.some((c) => c.id === selId)) {
      return base;
    }
    return [picked, ...base];
  }

  onPictureSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.pendingPicture.set(file ?? null);
  }

  clearPendingPicture(): void {
    this.pendingPicture.set(null);
  }

  /** Enables the submit button: core fields valid + kitchen resolved (select or manual lookup text). */
  addBomLine(): void {
    this.bomLines.push(newBomLineGroup(this.fb));
  }

  removeBomLine(index: number): void {
    this.bomLines.removeAt(index);
  }

  canSubmitForm(): boolean {
    const f = this.form;
    if (
      f.controls.code.invalid ||
      f.controls.name.invalid ||
      f.controls.basePrice.invalid ||
      f.controls.foodCategoryId.invalid ||
      f.controls.version.invalid
    ) {
      return false;
    }
    const lists = this.lookups();
    if (lists.kitchens.length > 0) {
      const id = Number(f.getRawValue().kitchenId);
      if (!Number.isFinite(id) || id < 1) {
        return false;
      }
    } else if ((f.getRawValue().manualKitchenQuery ?? '').trim().length === 0) {
      return false;
    }
    if (this.bomLines.length > 0 && this.bomLines.invalid) {
      return false;
    }
    return true;
  }

  submit(): void {
    this.errorMessage.set(null);
    if (!this.canSubmitForm()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const foodCategoryId = Number(v.foodCategoryId);
    if (!Number.isFinite(foodCategoryId) || foodCategoryId < 1) {
      this.errorMessage.set(
        this.i18n.translate('common.choose', {
          entity: this.i18n.translate('common.category'),
        }),
      );
      return;
    }
    this.submitting.set(true);
    this.resolveKitchenId$()
      .pipe(
        switchMap((kitchenId) =>
          this.foodService
            .createFood({
              code: (v.code ?? '').trim(),
              name: (v.name ?? '').trim(),
              basePrice: Number(v.basePrice),
              kitchenId,
              foodCategoryId,
              version: Number(v.version),
              blockOrderLine: !!v.blockOrderLine,
              bomLines: buildBomLineRequests(this.bomLines),
            })
            .pipe(
              switchMap((created) => {
                const file = this.pendingPicture();
                if (file != null && created.id != null) {
                  return this.foodService.uploadFoodPicture(created.id, file).pipe(
                    catchError((uploadErr: unknown) => {
                      this.errorMessage.set(this.formatHttpError(uploadErr));
                      return of(created);
                    }),
                    map(() => created),
                  );
                }
                return of(created);
              }),
            ),
        ),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (created) => {
          void this.router.navigate(['/foods'], {
            queryParams: { created: created.id },
          });
        },
        error: (err: unknown) => {
          this.errorMessage.set(
            err instanceof Error ? err.message : this.formatHttpError(err),
          );
        },
      });
  }

  /** Resolves numeric kitchen id from `<select>` or from manual name/code/id via kitchens API search. */
  private resolveKitchenId$(): Observable<number> {
    const lists = this.lookups();
    const v = this.form.getRawValue();
    if (lists.kitchens.length > 0) {
      const id = Number(v.kitchenId);
      if (!Number.isFinite(id) || id < 1) {
        return throwError(
          () =>
            new Error(
              this.i18n.translate('common.choose', {
                entity: this.i18n.translate('common.kitchen'),
              }),
            ),
        );
      }
      return of(id);
    }
    const q = (v.manualKitchenQuery ?? '').trim();
    if (!q) {
      return throwError(() => new Error(this.i18n.translate('food.kitchenPlaceholder')));
    }
    return this.kitchenService.searchKitchens(q).pipe(
      map((ks) => this.pickSingleKitchenId(ks, q)),
      switchMap((id) =>
        id != null
          ? of(id)
          : throwError(() => new Error(this.i18n.translate('food.resolveKitchen'))),
      ),
    );
  }

  /**
   * Picks one kitchen id from a search result: exact numeric id, exact code, exact name, or single row.
   */
  private pickSingleKitchenId(ks: Kitchen[], q: string): number | null {
    const t = q.trim();
    if (t.length === 0 || ks.length === 0) {
      return null;
    }
    const lower = t.toLowerCase();

    if (/^\d+$/.test(t)) {
      const n = Number(t);
      const byId = ks.filter((k) => k.id != null && Number(k.id) === n);
      if (byId.length === 1) {
        return Number(byId[0].id);
      }
    }

    const byCode = ks.filter((k) => k.code.toLowerCase() === lower);
    if (byCode.length === 1) {
      return Number(byCode[0].id);
    }

    const byName = ks.filter((k) => (k.name ?? '').trim().toLowerCase() === lower);
    if (byName.length === 1) {
      return Number(byName[0].id);
    }

    if (ks.length === 1 && ks[0].id != null) {
      return Number(ks[0].id);
    }

    return null;
  }

  private formatHttpError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const m = (body as { message?: unknown }).message;
        if (typeof m === 'string') {
          return m;
        }
      }
      if (typeof err.error === 'string' && err.error.length > 0) {
        return err.error;
      }
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotCreate', {
      entity: this.i18n.translate('food.entity'),
    });
  }
}
