import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createInvoice, renewConfig } from '../api/client'

function parseDuration(planName) {
  if (!planName) return 'Unknown'
  const p = planName.toLowerCase()
  if (p.includes('1year') || p.includes('12month')) return '1 Year'
  if (p.includes('6month')) return '6 Months'
  if (p.includes('3month')) return '3 Months'
  if (p.includes('1month') || p.includes('month')) return '1 Month'
  return planName
}

function durationColor(planName) {
  const p = (planName || '').toLowerCase()
  if (p.includes('1year') || p.includes('12month')) return 'from-purple-600 to-indigo-600'
  if (p.includes('6month')) return 'from-blue-600 to-cyan-600'
  if (p.includes('3month')) return 'from-teal-600 to-emerald-600'
  return 'from-emerald-600 to-green-600'
}

const ShoppingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
)

export default function Store() {
  const { user, plans, loading } = useApp()
  const location = useLocation()
  const renewState = location.state

  const [buyingPlan, setBuyingPlan] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const handleBuy = async (plan) => {
    setError(null)
    setSuccess(null)
    setBuyingPlan(plan.plan_name)
    try {
      if (renewState?.renewUuid) {
        await renewConfig(renewState.renewUuid, plan.plan_name)
        setSuccess(`Config renewed with plan "${parseDuration(plan.plan_name)}"!`)
      } else {
        const result = await createInvoice(plan.plan_name, 'USDT')
        const url = result?.invoice_url || result?.url || result
        if (url && typeof url === 'string') {
          const tg = window.Telegram?.WebApp
          if (tg?.openLink) {
            tg.openLink(url)
          } else {
            window.open(url, '_blank')
          }
          setSuccess('Invoice created! Complete payment in the opened window.')
        } else {
          setSuccess('Invoice created successfully!')
        }
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to process request. Please try again.')
    } finally {
      setBuyingPlan(null)
    }
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {renewState?.renewUuid ? 'Renew Config' : 'Store'}
          </h1>
          <p className="text-slate-400 text-sm">
            {renewState?.serverName ? `Renewing: ${renewState.serverName}` : 'Choose a plan'}
          </p>
        </div>
        <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-3 py-2 text-right">
          <p className="text-xs text-emerald-400 font-medium">Wallet</p>
          <p className="text-emerald-300 font-bold text-sm">
            ${(user?.wallet_balance_usd || 0).toFixed(2)} USDT
          </p>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm">
          {success}
        </div>
      )}

      {/* Section title */}
      <div className="flex items-center gap-2">
        <ShoppingIcon />
        <h2 className="text-slate-300 font-semibold text-sm">Charge Wallet</h2>
      </div>

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-8 text-center">
          <p className="text-slate-400 text-sm">No plans available at the moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {plans.map((plan) => (
            <div
              key={plan.plan_name}
              className="bg-slate-800 rounded-xl ring-1 ring-slate-700 overflow-hidden flex flex-col"
            >
              {/* Color header */}
              <div className={`bg-gradient-to-r ${durationColor(plan.plan_name)} px-3 py-2`}>
                <p className="text-white font-bold text-sm">{parseDuration(plan.plan_name)}</p>
              </div>

              <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <p className="text-white font-bold text-xl">
                    ${(plan.price_usd || 0).toFixed(2)}
                  </p>
                  <p className="text-emerald-400 text-xs font-medium">{plan.traffic_gb} GB</p>
                  <p className="text-slate-500 text-xs">USDT</p>
                </div>

                <button
                  onClick={() => handleBuy(plan)}
                  disabled={buyingPlan === plan.plan_name}
                  className="w-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  {buyingPlan === plan.plan_name ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    renewState?.renewUuid ? 'Renew' : 'Buy'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info note */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 px-4 py-3">
        <p className="text-slate-400 text-xs text-center">
          💳 Payments are processed securely in USDT. Your balance will be updated automatically after payment confirmation.
        </p>
      </div>
    </div>
  )
}
