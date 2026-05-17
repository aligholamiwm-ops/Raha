import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Store from './pages/Store'
import Referral from './pages/Referral'
import Support from './pages/Support'
import Admin from './pages/Admin'
import api from './api/client'

function NicknameModal({ onSave }) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = nickname.trim()
    if (trimmed.length < 2 || trimmed.length > 32) {
      setError('Nickname must be between 2 and 32 characters')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.put('/api/v1/users/me/nickname', { nickname: trimmed })
      onSave(trimmed)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save nickname. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-3">👤</div>
          <h2 className="text-white font-bold text-lg">Choose Your Nickname</h2>
          <p className="text-slate-400 text-sm mt-1">
            Pick a display name for your Raha VPN account. You can change it later.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="Enter nickname..."
            minLength={2}
            maxLength={32}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
            autoFocus
          />
          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving || nickname.trim().length < 2}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Nickname'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AppShell() {
  const { error, user, refreshUser } = useApp()
  const [showNicknameModal, setShowNicknameModal] = useState(false)

  useEffect(() => {
    if (user && user.nickname === null || user && user.nickname === undefined) {
      setShowNicknameModal(true)
    }
  }, [user])

  const handleNicknameSaved = (nickname) => {
    setShowNicknameModal(false)
    refreshUser()
  }

  if (error && !user) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white p-8" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="text-5xl mb-6">🔒</div>
        <h1 className="text-xl font-semibold mb-3 text-center">Access Restricted</h1>
        <p className="text-slate-400 text-center">{error}</p>
      </div>
    )
  }
  return (
    <HashRouter>
      <div className="flex flex-col h-full bg-slate-900" style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
        {showNicknameModal && user && <NicknameModal onSave={handleNicknameSaved} />}
        <main className="flex-1 overflow-y-auto pb-20 pt-safe">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/store" element={<Store />} />
            <Route path="/referral" element={<Referral />} />
            <Route path="/support" element={<Support />} />
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
      <AppShell />
    </AppProvider>
  )
}
