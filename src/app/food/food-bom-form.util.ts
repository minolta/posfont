import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';

import { entityIdNumber, sameEntityId } from '../common/entity-id.util';
import type { Material } from '../material/material.model';
import { materialOptionLabel } from '../material/material.model';
import type { FoodBomLine, FoodBomLineRequest } from './food.model';

export { materialOptionLabel };

export function newBomLineGroup(fb: FormBuilder): FormGroup {
  return fb.group({
    materialId: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(0.0001)]],
  });
}

export function rebuildBomLinesForm(
  fb: FormBuilder,
  target: FormArray<FormGroup>,
  lines: FoodBomLine[] | undefined | null,
): void {
  while (target.length > 0) {
    target.removeAt(0);
  }
  for (const ln of lines ?? []) {
    const mid = ln.material?.id;
    if (mid == null) {
      continue;
    }
    target.push(
      fb.group({
        materialId: [String(mid), Validators.required],
        quantity: [ln.quantity, [Validators.required, Validators.min(0.0001)]],
      }),
    );
  }
}

export function buildBomLineRequests(bomLines: FormArray<FormGroup>): FoodBomLineRequest[] {
  const out: FoodBomLineRequest[] = [];
  for (const g of bomLines.controls) {
    const v = g.getRawValue();
    const materialId = entityIdNumber(v.materialId);
    const quantity = Number(v.quantity);
    if (materialId == null || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    out.push({ materialId, quantity });
  }
  return out;
}

export function filterMaterialsForBom(
  ms: Material[],
  materialIdRaw: string | undefined | null,
  search: string,
): Material[] {
  const q = search.trim().toLowerCase();
  const selId = entityIdNumber(materialIdRaw);
  const base = !q
    ? ms
    : ms.filter((m) => materialOptionLabel(m).toLowerCase().includes(q));
  if (selId == null) {
    return base;
  }
  const picked = ms.find((m) => sameEntityId(m.id, selId));
  if (!picked || base.some((m) => sameEntityId(m.id, selId))) {
    return base;
  }
  return [picked, ...base];
}

export function bomMaterialUnit(ms: Material[], materialIdRaw: string | undefined | null): string {
  const id = entityIdNumber(materialIdRaw);
  if (id == null) {
    return '';
  }
  return (ms.find((m) => sameEntityId(m.id, id))?.unit ?? '').trim();
}
