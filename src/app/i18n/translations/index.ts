import { en } from './en';
import { th } from './th';

export const translations = { en, th } as const;

export type TranslationKey = keyof typeof en;
