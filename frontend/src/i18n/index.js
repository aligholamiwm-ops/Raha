import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE } from './languages'

import enCommon from '../locales/en/common.json'
import enNav from '../locales/en/nav.json'
import enDashboard from '../locales/en/dashboard.json'
import enProfile from '../locales/en/profile.json'
import enStore from '../locales/en/store.json'
import enReferral from '../locales/en/referral.json'
import enAdmin from '../locales/en/admin.json'
import enSupport from '../locales/en/support.json'
import enNotifications from '../locales/en/notifications.json'
import enOnboarding from '../locales/en/onboarding.json'

import faCommon from '../locales/fa/common.json'
import faNav from '../locales/fa/nav.json'
import faDashboard from '../locales/fa/dashboard.json'
import faProfile from '../locales/fa/profile.json'
import faStore from '../locales/fa/store.json'
import faReferral from '../locales/fa/referral.json'
import faAdmin from '../locales/fa/admin.json'
import faSupport from '../locales/fa/support.json'
import faNotifications from '../locales/fa/notifications.json'
import faOnboarding from '../locales/fa/onboarding.json'

function detectLanguage() {
  const stored = localStorage.getItem('raha.lang')
  if (stored) return stored
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
  if (tgLang && tgLang.startsWith('fa')) return 'fa'
  return DEFAULT_LANGUAGE
}

i18n.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  resources: {
    en: {
      common: enCommon,
      nav: enNav,
      dashboard: enDashboard,
      profile: enProfile,
      store: enStore,
      referral: enReferral,
      admin: enAdmin,
      support: enSupport,
      notifications: enNotifications,
      onboarding: enOnboarding,
    },
    fa: {
      common: faCommon,
      nav: faNav,
      dashboard: faDashboard,
      profile: faProfile,
      store: faStore,
      referral: faReferral,
      admin: faAdmin,
      support: faSupport,
      notifications: faNotifications,
      onboarding: faOnboarding,
    },
  },
})

export default i18n
