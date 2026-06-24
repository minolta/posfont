import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { LocaleService } from '../i18n/locale.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { MaterialService } from '../material/material.service';
import type { Material } from '../material/material.model';
import { FoodService } from '../food/food.service';
import type { Food, FoodCategory } from '../food/food.model';
import { FoodCategoryService } from '../food-category/food-category.service';
import {
  bomMaterialUnit,
  buildBomLineRequests,
  filterMaterialsForBom,
  materialOptionLabel,
  newBomLineGroup,
  rebuildBomLinesForm,
} from '../food/food-bom-form.util';
import { foodBlocksOrderLines } from '../food/food.model';

@Component({
  selector: 'app-bom-management',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './bom-management.component.html',
  styleUrl: './bom-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BomManagementComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly foodService = inject(FoodService);
  private readonly materialService = inject(MaterialService);
  private readonly foodCategoryService = inject(FoodCategoryService);
  private readonly i18n = inject(LocaleService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly foods = signal<Food[]>([]);
  readonly materials = signal<Material[]>([]);
  readonly categories = signal<FoodCategory[]>([]);

  readonly selectedFood = signal<Food | null>(null);
  readonly searchTerm = signal('');
  readonly selectedCategoryId = signal<number | null>(null);
  readonly bomMaterialSearch = signal('');

  readonly form = this.fb.group({
    bomLines: this.fb.array<FormGroup>([]),
  });

  get bomLines(): FormArray<FormGroup> {
    return this.form.get('bomLines') as FormArray<FormGroup>;
  }

  readonly materialOptionLabel = materialOptionLabel;
  readonly filterMaterialsForBom = filterMaterialsForBom;
  readonly bomMaterialUnit = bomMaterialUnit;

  readonly filteredFoods = computed(() => {
    const list = this.foods();
    const query = this.searchTerm().trim().toLowerCase();
    const catId = this.selectedCategoryId();

    return list.filter((f) => {
      // Category filter
      if (catId != null && f.foodCategory?.id !== catId) {
        return false;
      }
      // Search term filter
      if (query) {
        const nameMatch = (f.name ?? '').toLowerCase().includes(query);
        const codeMatch = f.code.toLowerCase().includes(query);
        return nameMatch || codeMatch;
      }
      return true;
    });
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      foods: this.foodService.getFoods(),
      materials: this.materialService.getMaterials(),
      categories: this.foodCategoryService.getFoodCategories(),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        catchError((err: unknown) => {
          this.error.set(
            this.i18n.translate('common.couldNotLoad', {
              entity: this.i18n.translate('bom.title'),
            })
          );
          return of({ foods: [], materials: [], categories: [] });
        })
      )
      .subscribe((res) => {
        // Sort foods by code/name
        const sortedFoods = [...res.foods].sort((a, b) => a.code.localeCompare(b.code));
        this.foods.set(sortedFoods);
        this.materials.set(res.materials);
        this.categories.set(res.categories);
      });
  }

  selectFood(food: Food | null): void {
    this.selectedFood.set(food);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.bomMaterialSearch.set('');

    if (food) {
      rebuildBomLinesForm(this.fb, this.bomLines, food.bomLines);
    } else {
      this.bomLines.clear();
    }
  }

  addBomLine(): void {
    this.bomLines.push(newBomLineGroup(this.fb));
  }

  removeBomLine(index: number): void {
    this.bomLines.removeAt(index);
  }

  canSubmit(): boolean {
    return this.form.valid && !this.loading() && this.selectedFood() !== null;
  }

  submit(): void {
    const food = this.selectedFood();
    if (!food || food.id == null) {
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const lr = buildBomLineRequests(this.bomLines);

    // Validate no duplicates
    const materialIds = lr.map((line) => line.materialId);
    const hasDuplicates = new Set(materialIds).size !== materialIds.length;
    if (hasDuplicates) {
      this.errorMessage.set('Duplicate material selected in BOM lines.');
      return;
    }

    const kid = food.kitchen?.id;
    const cid = food.foodCategory?.id;
    if (kid == null || cid == null) {
      this.errorMessage.set('Food must have kitchen and category to update BOM.');
      return;
    }

    this.loading.set(true);
    this.foodService
      .updateFood(food.id, {
        code: food.code,
        name: food.name ?? food.code,
        basePrice: food.basePrice,
        kitchenId: kid,
        foodCategoryId: cid,
        version: food.version,
        blockOrderLine: foodBlocksOrderLines(food),
        bomLines: lr,
      })
      .pipe(
        finalize(() => this.loading.set(false)),
        catchError((err: unknown) => {
          this.errorMessage.set(this.formatHttpError(err));
          return of(null);
        })
      )
      .subscribe((updated) => {
        if (updated) {
          // Update the list entry
          const currentFoods = this.foods();
          const idx = currentFoods.findIndex((f) => f.id === updated.id);
          if (idx !== -1) {
            currentFoods[idx] = updated;
            this.foods.set([...currentFoods]);
          }

          this.selectFood(updated);
          this.successMessage.set(
            this.i18n.translate('bom.saveSuccess', {
              name: updated.name || updated.code,
            })
          );
        }
      });
  }

  categoryName(c: FoodCategory): string {
    return c.name?.trim() || c.code;
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
      return (
        err.message ||
        this.i18n.translate('common.requestFailedHttp', { status: err.status })
      );
    }
    return this.i18n.translate('common.couldNotSave', {
      entity: this.i18n.translate('bom.title'),
    });
  }
}
