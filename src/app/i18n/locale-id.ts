export const LOCALE_IDS = ['en', 'th'] as const;
export type LocaleId = (typeof LOCALE_IDS)[number];

export const LOCALE_STORAGE_KEY = 'posfont.locale';

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'EN',
  th: 'ไทย',
};

export function isLocaleId(value: string): value is LocaleId {
  return (LOCALE_IDS as readonly string[]).includes(value);
}
