import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  EMPTY,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';

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
  rebuildBomLinesForm,
} from './food-bom-form.util';
import { foodBlocksOrderLines, type Food, type FoodCategory, type Kitchen } from './food.model';
import { FoodService } from './food.service';
import { KitchenService } from '../kitchen/kitchen.service';

@Component({
  selector: 'app-food-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './food-edit.component.html',
  styleUrl: './food-edit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodEditComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly foodService = inject(FoodService);
  private readonly kitchenService = inject(KitchenService);
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly materialService = inject(MaterialService);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly foodId = signal<number | null>(null);
  readonly loadedFood = signal<Food | null>(null);

  readonly pictureFile = signal<File | null>(null);
  readonly pictureUploading = signal(false);
  readonly pictureUploadError = signal<string | null>(null);

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

  readonly kitchenSearch = signal('');
  readonly categorySearch = signal('');
  readonly bomMaterialSearch = signal('');

  readonly materials = toSignal(
    this.materialService.getMaterials().pipe(catchError(() => of([] as Material[]))),
    { initialValue: [] as Material[] },
  );

  readonly submitting = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/\S/)]],
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    basePrice: [0, [Validators.required, Validators.min(0)]],
    /** When true, staff cannot put this SKU on orders (shows in Foods list checkbox). */
    blockOrderLine: [false],
    kitchenId: [''],
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

  constructor() {
    this.route.paramMap
      .pipe(
        map((pm) => Number(pm.get('id') ?? '')),
        switchMap((id) => {
          if (!Number.isFinite(id) || id < 1) {
            this.loading.set(false);
            this.loadError.set(
              this.i18n.translate('common.invalidId', {
                entity: this.i18n.translate('food.entity'),
              }),
            );
            this.foodId.set(null);
            return EMPTY;
          }
          this.foodId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          return this.foodService.getFoodById(id).pipe(
            catchError(() => {
              this.loadError.set(
                this.i18n.translate('common.couldNotLoad', {
                  entity: this.i18n.translate('food.entity'),
                }),
              );
              return of(undefined as Food | undefined);
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((food) => {
        if (!food) {
          if (!this.loadError()) {
            this.loadError.set(
              this.i18n.translate('common.notFound', {
                entity: this.i18n.translate('food.entity'),
              }),
            );
          }
          return;
        }
        this.loadError.set(null);
        this.loadedFood.set(food);
        const kid = food.kitchen?.id;
        const cid = food.foodCategory?.id;
        this.form.patchValue({
          code: food.code,
          name: food.name ?? '',
          basePrice: food.basePrice,
          blockOrderLine: foodBlocksOrderLines(food),
          kitchenId: kid != null ? String(kid) : '',
          manualKitchenQuery: '',
          foodCategoryId: cid != null ? String(cid) : '',
          version: food.version,
        });
        rebuildBomLinesForm(this.fb, this.bomLines, food.bomLines);
      });
  }

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

  kitchenOptionLabel(k: Kitchen): string {
    const name = (k.name ?? '').trim();
    const code = (k.code ?? '').trim();
    if (name && code) {
      return `${name} (${code})`;
    }
    return name || code || `#${k.id ?? '?'}`;
  }

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

  currentPictureSrc(): string | null {
    const f = this.loadedFood();
    return f ? this.foodService.resolvePictureSrc(f) : null;
  }

  onPictureFileChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pictureFile.set(input.files?.[0] ?? null);
    this.pictureUploadError.set(null);
  }

  uploadPicture(inputEl?: HTMLInputElement): void {
    const id = this.foodId();
    const file = this.pictureFile();
    if (id == null || file == null) {
      return;
    }
    this.pictureUploadError.set(null);
    this.pictureUploading.set(true);
    this.foodService
      .uploadFoodPicture(id, file)
      .pipe(finalize(() => this.pictureUploading.set(false)))
      .subscribe({
        next: (updated) => {
          this.loadedFood.set(updated);
          this.form.patchValue({ version: updated.version });
          this.pictureFile.set(null);
          if (inputEl) {
            inputEl.value = '';
          }
        },
        error: (err: unknown) => {
          this.pictureUploadError.set(this.formatHttpError(err));
        },
      });
  }

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
    this.saveError.set(null);
    const id = this.foodId();
    if (id == null || !this.canSubmitForm()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const foodCategoryId = Number(v.foodCategoryId);
    if (!Number.isFinite(foodCategoryId) || foodCategoryId < 1) {
      this.saveError.set(
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
          this.foodService.updateFood(id, {
            code: (v.code ?? '').trim(),
            name: (v.name ?? '').trim(),
            basePrice: Number(v.basePrice),
            kitchenId,
            foodCategoryId,
            version: Number(v.version),
            blockOrderLine: !!v.blockOrderLine,
            bomLines: buildBomLineRequests(this.bomLines),
          }),
        ),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.loadedFood.set(updated);
          void this.router.navigate(['/foods'], {
            queryParams: { updated: id },
          });
        },
        error: (err: unknown) => {
          this.saveError.set(
            err instanceof Error ? err.message : this.formatHttpError(err),
          );
        },
      });
  }

  private resolveKitchenId$(): Observable<number> {
    const lists = this.lookups();
    const v = this.form.getRawValue();
    if (lists.kitchens.length > 0) {
      const kid = Number(v.kitchenId);
      if (!Number.isFinite(kid) || kid < 1) {
        return throwError(
          () =>
            new Error(
              this.i18n.translate('common.choose', {
                entity: this.i18n.translate('common.kitchen'),
              }),
            ),
        );
      }
      return of(kid);
    }
    const q = (v.manualKitchenQuery ?? '').trim();
    if (!q) {
      return throwError(() => new Error(this.i18n.translate('food.kitchenPlaceholder')));
    }
    return this.kitchenService.searchKitchens(q).pipe(
      map((ks) => this.pickSingleKitchenId(ks, q)),
      switchMap((kid) =>
        kid != null
          ? of(kid)
          : throwError(() => new Error(this.i18n.translate('food.resolveKitchen'))),
      ),
    );
  }

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
    return this.i18n.translate('common.couldNotSave', {
      entity: this.i18n.translate('food.entity'),
    });
  }
}
