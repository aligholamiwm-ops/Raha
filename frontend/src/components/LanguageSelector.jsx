import React from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'
import { useLanguage } from '../context/LanguageContext'

export default function LanguageSelector({ onClose }) {
  const { t } = useTranslation('onboarding')
  const { changeLanguage } = useLanguage()

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <div className="bg-dark-card border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <h2 className="text-white font-bold text-[18px]">{t('languageSelector.title')}</h2>
          <p className="text-gray-400 text-[13px] mt-1">{t('languageSelector.subtitle')}</p>
        </div>
        <div className="space-y-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                changeLanguage(lang.code)
                onClose()
              }}
              className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white hover:bg-white/10 hover:border-emerald-500/50 transition-all"
            >
              <span className="font-semibold text-[14px]">{lang.nativeName}</span>
              <span className="text-gray-400 text-[11px]">{lang.englishName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
