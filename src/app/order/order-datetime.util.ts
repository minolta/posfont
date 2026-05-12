/** `datetime-local` value from an ISO-ish backend string (date + HH:mm). */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso?.trim()) {
    return '';
  }
  const s = iso.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : s.slice(0, 16);
}

/** Current local time as `yyyy-MM-ddTHH:mm` for `datetime-local`. */
export function defaultDatetimeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ensure seconds for Jackson `LocalDateTime` when the input has no seconds. */
export function normalizeLocalDateTimeForApi(s: string): string {
  const t = s.trim();
  if (!t) {
    return t;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) {
    return `${t}:00`;
  }
  return t;
}
