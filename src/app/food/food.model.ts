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
}

/** Body for `POST /api/foods` and `PUT /api/foods/{id}` (`FoodRequest`). */
export interface FoodRequest {
  code: string;
  name: string;
  basePrice: number;
  kitchenId: number;
  foodCategoryId: number;
  version: number;
}
