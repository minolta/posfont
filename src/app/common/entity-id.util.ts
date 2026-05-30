/** Parse form/API ids (number or string) into a positive integer, or null. */
export function entityIdNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw).trim();
  if (text === '') {
    return null;
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  return Math.floor(n);
}

/** Compare ids from selects, API JSON, and manual numeric inputs. */
export function sameEntityId(a: unknown, b: unknown): boolean {
  const na = entityIdNumber(a);
  const nb = entityIdNumber(b);
  return na !== null && nb !== null && na === nb;
}
