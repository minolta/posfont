/** Matches `me.pixka.pos.kitchen.model.Kitchen` JSON. */
export interface Kitchen {
  id: number | null;
  code: string;
  name: string;
  version: number;
}

/** Matches `me.pixka.pos.foodcategory.model.FoodCategory` JSON. */
export interface FoodCategory {
  id: number | null;
  code: string;
  /** Display name; empty on legacy rows — UI falls back to {@link code}. */
  name?: string;
  version: number;
}

/** Fields for create; sent as `FoodCategoryRequest` with `version: 0` via `POST /api/food-categories`. */
export interface NewFoodCategoryRequest {
  code: string;
  name?: string;
}

/** Body for `PUT /api/food-categories/{id}`. */
export interface FoodCategoryRequest {
  code: string;
  name?: string;
  version: number;
}

/** Matches `me.pixka.pos.food.model.Food` JSON from `/api/foods`. */
export interface Food {
  id: number | null;
  code: string;
  /** Display name (required on API; optional here for older payloads). */
  name?: string;
  basePrice: number;
  /** Relative picture URL from API, e.g. `/api/foods/12/picture`; omit when no image. */
  pictureUrl?: string | null;
  kitchen: Kitchen | null;
  foodCategory: FoodCategory | null;
  version: number;
  /**
   * When true, this item cannot be added as order lines (kitchen-only / discontinued display, etc.).
   * Alias keys: `block_order_line` on some APIs.
   */
  blockOrderLine?: boolean | null;
}

/** Body for `POST /api/foods` and `PUT /api/foods/{id}` (`FoodRequest`). */
export interface FoodRequest {
  code: string;
  name: string;
  basePrice: number;
  kitchenId: number;
  foodCategoryId: number;
  version: number;
  /** Omit or false to allow ordering; true blocks new/edited order lines from this food. */
  blockOrderLine?: boolean;
}

/** Normalizes booleans — JSON aliases from Java / legacy payloads. */
export function foodBlocksOrderLines(food: Food): boolean {
  const r = food as unknown as Record<string, unknown>;
  const v =
    food.blockOrderLine ?? r['block_order_line'] ?? r['blockOrderLines'];
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** Builds a PUT body from current server row and optional optimistic field overrides (e.g. list toggle). */
export function foodUpdateRequestSnapshot(
  food: Food,
  overrides: Partial<Pick<FoodRequest, 'blockOrderLine'>> = {},
): FoodRequest {
  const kid = food.kitchen?.id;
  const cid = food.foodCategory?.id;
  if (
    kid == null ||
    cid == null ||
    !Number.isFinite(kid) ||
    kid < 1 ||
    !Number.isFinite(cid) ||
    cid < 1
  ) {
    throw new Error('Food must have kitchen and category for save.');
  }
  const blocked = overrides.blockOrderLine ?? foodBlocksOrderLines(food);
  return {
    code: food.code,
    name: (food.name ?? food.code ?? '').trim(),
    basePrice: food.basePrice,
    kitchenId: kid,
    foodCategoryId: cid,
    version: food.version,
    blockOrderLine: blocked,
  };
}
