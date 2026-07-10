import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { LanguageProvider, useLanguage } from './context/LanguageContext'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Store from './pages/Store'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import api, { updateMyLanguage } from './api/client'
import { NotificationsProvider } from './context/NotificationsContext'
import NotificationBell from './components/NotificationBell'
import LanguageSelector from './components/LanguageSelector'

function NicknameModal({ onSave }) {
  const { t } = useTranslation('onboarding')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = nickname.trim()
    if (trimmed.length < 2 || trimmed.length > 32) {
      setError(t('nickname.errorLength'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.put('/api/v1/users/me/nickname', { nickname: trimmed })
      onSave(trimmed)
    } catch (err) {
      setError(err?.response?.data?.detail || t('nickname.errorFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <div className="bg-dark-card border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <h2 className="text-white font-bold text-[18px]">{t('nickname.title')}</h2>
          <p className="text-gray-400 text-[13px] mt-1">
            {t('nickname.subtitle')}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder={t('nickname.placeholder')}
            minLength={2}
            maxLength={32}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] focus:outline-none focus:border-emerald-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={saving || nickname.trim().length < 2}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-btn transition-colors text-[13px]"
          >
            {saving ? t('nickname.saving') : t('nickname.save')}
          </button>
        </form>
      </div>
    </div>
  )
}

function Header() {
  const { t } = useTranslation('common')
  return (
    <header className="flex items-center justify-between px-3 py-2.5">
      <h1 className="text-white font-bold text-[18px] tracking-tight">{t('app.name')}</h1>
      <div className="flex items-center gap-1">
        <NotificationBell />

      </div>
    </header>
  )
}

function AppShell() {
  const { t } = useTranslation('onboarding')
  const { error, user, refreshUser } = useApp()
  const { lng } = useLanguage()
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [showLanguageSelector, setShowLanguageSelector] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('raha.lang')) {
      setShowLanguageSelector(true)
    }
  }, [])

  useEffect(() => {
    if (user && user.nickname === null || user && user.nickname === undefined) {
      setShowNicknameModal(true)
    }
  }, [user])

  const handleNicknameSaved = async (_nickname) => {
    setShowNicknameModal(false)
    await refreshUser()
    updateMyLanguage(lng).catch(() => {})
  }

  if (error && !user) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-dark-bg text-white p-8" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 className="text-xl font-semibold mb-3 text-center">{t('accessRestricted.title')}</h1>
        <p className="text-gray-400 text-center text-[13px]">{error}</p>
      </div>
    )
  }

  return (
    <HashRouter>
      <div className="flex flex-col h-full bg-dark-bg" style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
        {showLanguageSelector && <LanguageSelector onClose={() => setShowLanguageSelector(false)} />}
        {showNicknameModal && user && <NicknameModal onSave={handleNicknameSaved} />}
        <Header />
        <main className="flex-1 overflow-y-auto pb-[72px]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/store" element={<Store />} />
            <Route path="/referral" element={<Navigate to="/profile" replace state={{ tab: 'referral' }} />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/support" element={<Navigate to="/profile" replace state={{ tab: 'me' }} />} />
            {user?.role?.toLowerCase() === 'admin' && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

export default function App() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      if (tg.setHeaderColor) tg.setHeaderColor('#0f172a')
      if (tg.setBackgroundColor) tg.setBackgroundColor('#0f172a')
    }
  }, [])

  return (
    <AppProvider>
      <LanguageProvider>
        <NotificationsProvider>
          <AppShell />
        </NotificationsProvider>
      </LanguageProvider>
    </AppProvider>
  )
}
