export type { Kitchen } from '../food/food.model';

/** Fields collected on add-kitchen; sent as `KitchenRequest` with `version: 0` via `POST /api/kitchens`. */
export interface NewKitchenRequest {
  code: string;
  name: string;
}

/** Body for `PUT /api/kitchens/{id}`. */
export interface KitchenRequest {
  code: string;
  name: string;
  version: number;
}
