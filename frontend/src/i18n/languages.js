export const LANGUAGES = {
  en: { code: 'en', dir: 'ltr', englishName: 'English', nativeName: 'English', fontClass: 'font-en', calendar: 'gregorian' },
  fa: { code: 'fa', dir: 'rtl', englishName: 'Persian', nativeName: 'فارسی', fontClass: 'font-fa', calendar: 'shamsi' },
}

export const DEFAULT_LANGUAGE = 'en'

export const SUPPORTED_LANGUAGES = Object.values(LANGUAGES)

export function getLangMeta(code) {
  return LANGUAGES[code] || LANGUAGES[DEFAULT_LANGUAGE]
}
