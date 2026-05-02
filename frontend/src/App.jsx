import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Store from './pages/Store'
import Referral from './pages/Referral'
import Support from './pages/Support'

function AppShell() {
  const { error, user } = useApp()

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
        <main className="flex-1 overflow-y-auto pb-20 pt-safe">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/store" element={<Store />} />
            <Route path="/referral" element={<Referral />} />
            <Route path="/support" element={<Support />} />
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
