import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import BottomNav from './components/BottomNav'
import Dashboard from './pages/Dashboard'
import Store from './pages/Store'
import Referral from './pages/Referral'
import Support from './pages/Support'

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
    </AppProvider>
  )
}
