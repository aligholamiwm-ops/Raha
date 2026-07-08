import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createInvoice, createDepositInvoice, getMyLoans, payLoan, validateDiscount } from '../api/client'
import { formatDateShort } from '../utils/dates'

const PlanScene = React.lazy(() => import('../components/PlanScene'))

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch (e) {
    return false
  }
}

class WebGLErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error("WebGL Render Crash caught by boundary:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}
import {
  FiShoppingCart, FiArrowUp, FiArrowDown, FiCreditCard,
  FiCheck, FiLoader, FiChevronRight, FiAlertCircle, FiInfo,
  FiPackage, FiTag, FiX, FiZap, FiTrendingUp
} from 'react-icons/fi'

/* ─── helpers ─────────────────────────────────────────────────── */
function parseDuration(planName) {
  if (!planName) return 'Plan'
  const p = planName.toLowerCase()
  if (p.includes('1year') || p.includes('12month')) return '1 Year'
  if (p.includes('6month')) return '6 Months'
  if (p.includes('3month')) return '3 Months'
  if (p.includes('1month') || p.includes('month')) return '1 Month'
  return planName
}

function planColor(trafficGb) {
  const gb = trafficGb || 0
  if (gb <= 10)  return '#10b981' // emerald green
  if (gb <= 30)  return '#3b82f6' // bright blue
  if (gb <= 60)  return '#6366f1' // indigo
  if (gb <= 120) return '#8b5cf6' // royal purple
  if (gb <= 200) return '#ec4899' // hot pink
  return '#f43f5e' // rose red
}

/* ─── sub-components ──────────────────────────────────────────── */
function BalanceCard({ walletUsd, trafficGb, unpaidLoan, activeTab, setActiveTab }) {
  const { t } = useTranslation('store')
  return (
    <div className="space-y-3">
      {/* Balances Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Wallet Balance Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/60 border border-slate-700/50 rounded-2xl p-4 relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 end-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 bg-emerald-500/10 rounded-md flex items-center justify-center">
              <FiCreditCard className="text-emerald-400" size={11} />
            </div>
            <span className="text-[10px] text-slate-300 font-extrabold tracking-wider uppercase">{t('balance.wallet')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white tracking-tight">${(walletUsd || 0).toFixed(2)}</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">USDT</span>
          </div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80">
            <span className="text-[9px] text-slate-500 font-semibold tracking-wider">TRC20 / BEP20</span>
            <button 
              onClick={() => setActiveTab('deposit')}
              className="text-[10px] font-extrabold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-0.5 active:scale-95 duration-200"
            >
              + {t('balance.topUp')}
            </button>
          </div>
        </div>

        {/* Traffic Balance Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/60 border border-slate-700/50 rounded-2xl p-4 relative overflow-hidden group transition-all duration-300">
          <div className="absolute top-0 end-0 w-16 h-16 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 bg-blue-500/10 rounded-md flex items-center justify-center">
              <FiZap className="text-blue-400" size={11} />
            </div>
            <span className="text-[10px] text-slate-300 font-extrabold tracking-wider uppercase">{t('balance.traffic')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-white tracking-tight">{(trafficGb || 0).toFixed(2)}</span>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">GB</span>
          </div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80">
            <span className="text-[9px] text-slate-500 font-semibold tracking-wider">{t('balance.safeEncrypted')}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{t('balance.available')}</span>
          </div>
        </div>
      </div>

      {/* Outstanding Loan Notification Banner */}
      {unpaidLoan > 0 && (
        <div className="bg-gradient-to-r from-rose-950/40 via-rose-900/10 to-transparent border border-rose-800/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <FiAlertCircle className="text-rose-400" size={18} />
            </div>
            <div>
              <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">{t('balance.outstandingLoan')}</p>
              <p className="text-sm font-black text-white">${unpaidLoan.toFixed(2)} USDT {t('balance.unpaid')}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('loans')}
            className="text-[11px] font-black bg-rose-500 hover:bg-rose-400 text-white px-3.5 py-1.5 rounded-lg transition-all active:scale-95 duration-200 shadow-lg shadow-rose-500/20"
          >
            {t('balance.settleNow')}
          </button>
        </div>
      )}
    </div>
  )
}

function TabBar({ active, onChange, hasLoanBadge }) {
  const { t } = useTranslation('store')
  const tabs = [
    { id: 'plans', label: t('tabs.buyPlans'), icon: FiShoppingCart },
    { id: 'deposit', label: t('tabs.deposit'), icon: FiArrowUp },
    { id: 'withdrawal', label: t('tabs.withdraw'), icon: FiArrowDown },
    { id: 'loans', label: t('tabs.myLoans'), icon: FiCreditCard, badge: hasLoanBadge },
  ]
  return (
    <div className="flex gap-1 bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-2xl p-1.5 shadow-inner">
      {tabs.map(tab => {
        const isSelected = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-extrabold tracking-wider uppercase transition-all duration-300 ${
              isSelected
                ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.25)] scale-[1.02]'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/35'
            }`}
          >
            <tab.icon size={15} className={`transition-transform duration-300 ${isSelected ? 'scale-110 text-white' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="absolute top-1.5 end-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping border border-slate-900" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ─── modern plans vertical list – high value volume visualizer ── */
function PlansList({ plans, maxTrafficGb, onBuy, buying, selectedPlan, onSelectPlan }) {
  const { t } = useTranslation('store')
  const sorted = [...plans].sort((a, b) => (a.traffic_gb || 0) - (b.traffic_gb || 0))
  const plansCount = sorted.length
  const max = maxTrafficGb || 1

  // Use the smallest plan per-GB price as baseline for value savings comparison
  const basePlan = sorted[0]
  const basePricePerGb = basePlan && basePlan.traffic_gb > 0 ? (basePlan.price_usd / basePlan.traffic_gb) : 0

  return (
    <div className="w-full space-y-3.5">
      {sorted.map((plan, i) => {
        const gb = plan.traffic_gb || 0
        const price = plan.price_usd || 0
        const pricePerGb = gb > 0 ? (price / gb) : 0
        const color = planColor(gb)
        const busy = buying === plan.plan_name
        
        // Dynamic badges based on volume hierarchy to encourage higher volume selection
        let badgeText = ""
        let badgeColor = ""
        let borderGlow = ""

        if (i === 0) {
          badgeText = "Starter Lite"
          badgeColor = "bg-slate-800 text-slate-400 border-slate-700/60"
          borderGlow = "border-slate-800 hover:border-slate-700 shadow-sm"
        } else if (i === plansCount - 1 && plansCount > 1) {
          badgeText = "Ultimate Value"
          badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          borderGlow = "border-emerald-500/20 hover:border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.06)] bg-emerald-950/5"
        } else if (i === Math.floor(plansCount / 2) && plansCount > 2) {
          badgeText = "Most Popular"
          badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20"
          borderGlow = "border-blue-500/20 hover:border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.06)] bg-blue-950/5"
        } else {
          badgeText = "Best Seller"
          badgeColor = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
          borderGlow = "border-indigo-500/20 hover:border-indigo-500/50 bg-indigo-950/5"
        }

        const pctOfMax = max > 0 ? (gb / max) * 100 : 0
        const savingsPercent = basePricePerGb > pricePerGb && basePricePerGb > 0
          ? Math.round((1 - (pricePerGb / basePricePerGb)) * 100)
          : 0

        const isSelected = selectedPlan?.plan_name === plan.plan_name

        return (
          <div 
            key={plan.plan_name} 
            onClick={() => onSelectPlan && onSelectPlan(plan)}
            className={`p-4.5 rounded-2xl bg-slate-900/40 backdrop-blur-sm border ${borderGlow} transition-all duration-300 relative group overflow-hidden cursor-pointer ${isSelected ? 'scale-[1.01] shadow-lg' : ''}`}
            style={{ 
              borderColor: isSelected ? color : undefined,
              borderWidth: isSelected ? '2px' : '1px'
            }}
          >
            {/* Ambient Accent Glows */}
            {i === plansCount - 1 && (
              <div className="absolute -top-12 -end-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
            )}
            {i === Math.floor(plansCount / 2) && plansCount > 2 && (
              <div className="absolute -top-12 -end-12 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
            )}

            {/* Top row: badge & duration */}
            <div className="flex items-center justify-between mb-3.5">
              <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                {badgeText}
              </span>
              <span className="text-slate-400 text-xs font-extrabold flex items-center gap-1">
                <FiPackage size={11} className="text-slate-500" />
                {parseDuration(plan.plan_name)}
              </span>
            </div>

            {/* Middle row: volume & price */}
            <div className="flex items-baseline justify-between">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white tracking-tight">{gb}</span>
                  <span className="text-sm font-black text-slate-300">GB</span>
                </div>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{t('plans.highSpeedTraffic')}</p>
              </div>

              <div className="text-end">
                <div className="flex items-baseline justify-end gap-0.5">
                  <span className="text-white font-black text-xl tracking-tight">${price.toFixed(2)}</span>
                  <span className="text-[10px] text-emerald-400 font-bold ms-0.5">USDT</span>
                </div>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{t('plans.oneTime')}</p>
              </div>
            </div>

            {/* Volume Progress Bar Visualizer */}
            <div className="my-3.5">
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/40">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ 
                    width: `${Math.max(6, pctOfMax)}%`, 
                    background: `linear-gradient(90deg, ${color} 0%, ${color}aa 100%)`,
                    boxShadow: `0 0 6px ${color}50`
                  }} 
                />
              </div>
            </div>

            {/* Bottom row: Value metrics & buy button */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/30">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-300 font-extrabold tracking-tight">
                  ${pricePerGb.toFixed(3)} <span className="text-[9px] text-slate-500 font-normal">{t('plans.perGb')}</span>
                </span>
                {savingsPercent > 0 ? (
                  <span className="text-[10px] text-emerald-400 font-black flex items-center gap-0.5 animate-pulse">
                    <FiZap size={9} /> {t('plans.savePerGb', { percent: savingsPercent })}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">{t('plans.baseTariff')}</span>
                )}
              </div>

              <button
                onClick={() => onBuy(plan)}
                disabled={busy}
                className={`px-4.5 py-2 rounded-xl text-xs font-black transition-all duration-300 active:scale-95 shadow-md flex items-center justify-center gap-1 ${
                  busy
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : i === plansCount - 1 && plansCount > 1
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-500/15 hover:shadow-emerald-500/25'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/40'
                }`}
              >
                {busy ? <FiLoader size={12} className="animate-spin" /> : t('plans.selectPlan')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BuyConfirmModal({ plan, walletBalance, onConfirm, onCancel, buying }) {
  const { t } = useTranslation('store')
  const [discountCode, setDiscountCode] = useState('')
  const [validating, setValidating] = useState(false)
  const [appliedDiscount, setAppliedDiscount] = useState(null)
  const [discountError, setDiscountError] = useState(null)

  const basePrice = plan?.price_usd || 0
  const discountPct = appliedDiscount?.discount_percent || 0
  const finalPrice = basePrice * (1 - discountPct / 100)
  const canAfford = (walletBalance || 0) >= finalPrice

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return
    setValidating(true)
    setDiscountError(null)
    setAppliedDiscount(null)
    try {
      const result = await validateDiscount(discountCode.trim())
      setAppliedDiscount(result)
    } catch (e) {
      setDiscountError(e?.response?.data?.detail || t('buy.invalidCode'))
    } finally {
      setValidating(false)
    }
  }

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null)
    setDiscountCode('')
    setDiscountError(null)
  }

  if (!plan) return null

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-end justify-center px-4 pt-4 pb-24 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Modal Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1 bg-slate-800 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5">
          <h3 className="text-white font-extrabold text-lg flex items-center gap-2">
            <FiShoppingCart className="text-emerald-400" size={18} />
            {t('buy.confirmOrder')}
          </h3>
          <button 
            onClick={onCancel} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <FiX size={15} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Order Receipt */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4.5 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs font-semibold">{t('buy.selectedPlan')}</span>
              <span className="text-white font-black text-sm">{parseDuration(plan.plan_name)}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs font-semibold">{t('buy.includedTraffic')}</span>
              <span className="text-emerald-400 font-black text-sm flex items-center gap-1">
                <FiZap size={11} /> {plan.traffic_gb} GB
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">{t('buy.regularPrice')}</span>
              <span className="text-slate-300 font-bold">${basePrice.toFixed(2)} USDT</span>
            </div>

            {appliedDiscount && (
              <div className="flex items-center justify-between text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                <span className="flex items-center gap-1">
                  <FiTag size={11} className="animate-pulse" /> {t('buy.discount')} ({discountPct}%)
                </span>
                <span>−${(basePrice - finalPrice).toFixed(2)} USDT</span>
              </div>
            )}

            <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
              <div>
                <span className="text-slate-200 text-xs font-bold">{t('buy.totalDue')}</span>
                <p className="text-[10px] text-slate-500 font-medium">{t('buy.networkFeesIncluded')}</p>
              </div>
              <div className="text-end">
                <span className="text-white font-black text-xl tracking-tight">${finalPrice.toFixed(2)}</span>
                <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider ms-1">USDT</span>
              </div>
            </div>
          </div>

          {/* Discount code Input or Applied Chip */}
          {!appliedDiscount ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{t('buy.promoCode')}</p>
                {discountError && (
                  <p className="text-rose-400 text-[10px] font-semibold flex items-center gap-0.5 animate-bounce">
                    <FiAlertCircle size={10} /> {discountError}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('buy.promoPlaceholder')}
                  value={discountCode}
                  onChange={e => { setDiscountCode(e.target.value); setDiscountError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-semibold focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600"
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={!discountCode.trim() || validating}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:opacity-40 text-white text-xs font-extrabold rounded-xl transition-colors border border-slate-700/30 flex items-center justify-center min-w-[70px]"
                >
                  {validating ? <FiLoader size={12} className="animate-spin" /> : t('buy.apply')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-950/30 to-slate-900 border border-emerald-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                  <FiTag className="text-emerald-400" size={12} />
                </div>
                <div>
                  <div className="text-emerald-400 font-black text-xs uppercase tracking-wider">{appliedDiscount.code}</div>
                  <div className="text-slate-400 text-[10px] font-medium">{t('buy.promoActive', { pct: discountPct })}</div>
                </div>
              </div>
              <button 
                onClick={handleRemoveDiscount} 
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <FiX size={12} />
              </button>
            </div>
          )}

          {/* Wallet Balance Warning or Direct affordance details */}
          {canAfford ? (
            <div className="flex items-center gap-2.5 text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3.5 py-3">
              <div className="w-5 h-5 bg-emerald-500/15 rounded-full flex items-center justify-center flex-shrink-0">
                <FiCheck size={11} className="text-emerald-400" />
              </div>
              <div>
                <p className="font-bold">{t('buy.affordableWallet')}</p>
                <p className="text-slate-400 text-[9px] font-normal mt-0.5">{t('buy.balanceSufficient', { balance: walletBalance.toFixed(2) })}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-xl px-3.5 py-3">
              <FiInfo size={13} className="text-amber-400 flex-shrink-0 mt-0.5 animate-bounce" />
              <div>
                <p className="font-bold">{t('buy.cryptoInvoiceRequired')}</p>
                <p className="text-slate-400 text-[9px] font-normal mt-0.5">{t('buy.insufficientBalance', { balance: walletBalance.toFixed(2) })}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all active:scale-95 border border-slate-700/20"
            >
              {t('buy.cancelOrder')}
            </button>
            <button
              onClick={() => onConfirm(plan, appliedDiscount?.code || null)}
              disabled={buying === plan.plan_name}
              className={`flex-1 py-3 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg ${
                buying === plan.plan_name
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
                  : canAfford
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-500/20'
              }`}
            >
              {buying === plan.plan_name ? (
                <><FiLoader size={12} className="animate-spin" /> {t('buy.processing')}</>
              ) : canAfford ? (
                <><FiCheck size={13} /> {t('buy.payWithWallet')}</>
              ) : (
                <><FiCreditCard size={13} /> {t('buy.payViaPlisio')}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEPOSIT_PRESETS = [5, 10, 20, 50]

function DepositTab({ onDeposit, buying, currentBalance }) {
  const { t } = useTranslation('store')
  const [amount, setAmount] = useState('')

  const numericAmount = parseFloat(amount) || 0
  const futureBalance = (currentBalance || 0) + numericAmount

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/40 border border-slate-700/50 rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiArrowUp className="text-emerald-400" size={18} />
          </div>
          <div>
            <h3 className="text-white font-extrabold text-sm">{t('deposit.title')}</h3>
            <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wider">{t('deposit.subtitle')}</p>
          </div>
        </div>

        {/* Quick amounts preset */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('deposit.selectPreset')}</p>
            {numericAmount > 0 && (
              <span className="text-[10px] text-slate-500 font-semibold">{t('deposit.clearsInstantly')}</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {DEPOSIT_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className={`py-2.5 rounded-xl text-xs font-black border transition-all duration-300 active:scale-95 ${
                  amount === String(p)
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/15'
                    : 'bg-slate-950 text-slate-300 border-slate-800/80 hover:border-emerald-500/40'
                }`}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">{t('deposit.customAmount')}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-8 pe-3.5 py-3 text-white text-xs font-bold focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-700"
                min={1}
              />
            </div>
            <button
              onClick={() => {
                const a = parseFloat(amount)
                if (a > 0) onDeposit(a)
              }}
              disabled={!amount || parseFloat(amount) <= 0 || !!buying}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-extrabold px-5 rounded-xl transition-all duration-300 active:scale-95 flex items-center justify-center min-w-[100px] text-xs shadow-lg shadow-emerald-500/10 disabled:shadow-none"
            >
              {buying === `deposit_${amount}` ? <FiLoader size={14} className="animate-spin" /> : t('deposit.button')}
            </button>
          </div>
        </div>

        {/* Live balance estimator */}
        {numericAmount > 0 && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs animate-in fade-in duration-300">
            <span className="text-slate-400 font-medium">{t('deposit.estimatedBalance')}</span>
            <span className="text-white font-black">
              ${futureBalance.toFixed(2)} <span className="text-emerald-400 text-[9px] font-bold">USDT</span>
            </span>
          </div>
        )}
      </div>

      {/* Security info card */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl px-4 py-3.5 flex items-start gap-3">
        <FiInfo className="text-blue-400 flex-shrink-0 mt-0.5" size={14} />
        <div>
          <p className="text-xs text-blue-300 font-bold">{t('deposit.secureGateway')}</p>
          <p className="text-slate-400 text-[10px] leading-relaxed mt-0.5">
            {t('deposit.secureDesc')}
          </p>
        </div>
      </div>
    </div>
  )
}

function WithdrawalTab({ onNavigate }) {
  const { t } = useTranslation('store')
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/40 border border-slate-700/50 rounded-2xl p-6 text-center space-y-4 relative overflow-hidden">
        <div className="absolute top-0 end-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none" />
        
        <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-md">
          <FiArrowDown className="text-amber-400 animate-bounce" size={24} />
        </div>
        
        <div className="space-y-1.5">
          <h3 className="text-white font-extrabold text-base">{t('withdraw.title')}</h3>
          <p className="text-slate-400 text-xs leading-relaxed max-w-[280px] mx-auto">
            {t('withdraw.desc')}
          </p>
        </div>

        {/* Networks */}
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('withdraw.supportedNetworks')}</p>
          <div className="grid grid-cols-3 gap-2 max-w-[320px] mx-auto">
            {['USDT (TRC20)', 'USDT (BEP-20)', 'USDT (TON)'].map(net => (
              <div key={net} className="bg-slate-950 border border-slate-800/80 rounded-xl py-2 text-[10px] text-slate-300 font-bold tracking-wide">
                {net}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onNavigate}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-extrabold py-3.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/15"
        >
          <FiChevronRight size={15} className="rtl:rotate-180" />
          {t('withdraw.createTicket')}
        </button>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 flex items-start gap-3">
        <FiInfo className="text-slate-500 flex-shrink-0 mt-0.5" size={13} />
        <p className="text-slate-500 text-[10px] leading-relaxed">
          {t('withdraw.info')}
        </p>
      </div>
    </div>
  )
}

function LoansTab({ loans, loansLoading, onPayLoan, payingLoan }) {
  const { t } = useTranslation('store')
  const unpaid = loans.filter(l => l.status === 'unpaid')
  const settled = loans.filter(l => l.status === 'settled')
  const totalUnpaid = unpaid.reduce((s, l) => s + (l.amount_usdt || 0), 0)

  if (loansLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-20 bg-slate-800/50 rounded-2xl animate-pulse border border-slate-700/30" />)}
      </div>
    )
  }

  if (loans.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
          <FiCheck className="text-emerald-400" size={18} />
        </div>
        <p className="text-white font-bold text-sm">{t('loans.noLoans')}</p>
        <p className="text-slate-500 text-xs mt-1">{t('loans.noLoansDesc')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {totalUnpaid > 0 && (
        <div className="bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-800/30 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-9 h-9 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiAlertCircle className="text-rose-400" size={18} />
          </div>
          <div>
            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">{t('loans.totalOutstanding')}</p>
            <p className="text-lg font-black text-white">${totalUnpaid.toFixed(2)} USDT</p>
          </div>
        </div>
      )}

      {unpaid.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('loans.unpaidLoans', { count: unpaid.length })}</p>
          <div className="space-y-2.5">
            {unpaid.map(loan => (
              <div key={loan.loan_id} className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 relative overflow-hidden group">
                <div className="absolute top-0 end-0 w-20 h-20 bg-rose-500/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-white font-black text-base">${loan.amount_usdt?.toFixed(2)} USDT</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium flex items-center gap-1">
                      <span>{formatDateShort(loan.created_at)}</span>
                      {loan.note && (
                        <>
                          <span>·</span>
                          <span className="text-slate-400 font-semibold">{loan.note}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {t('loans.unpaidBadge')}
                  </span>
                </div>
                <button
                  onClick={() => onPayLoan(loan)}
                  disabled={payingLoan === loan.loan_id}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white text-xs font-black py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-rose-500/10 disabled:shadow-none"
                >
                  {payingLoan === loan.loan_id ? (
                    <><FiLoader size={12} className="animate-spin" /> {t('loans.processing')}</>
                  ) : (
                    <><FiCreditCard size={12} /> {t('loans.payOutstanding')}</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {settled.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('loans.paymentHistory', { count: settled.length })}</p>
          <div className="space-y-2">
            {settled.map(loan => (
              <div key={loan.loan_id} className="bg-slate-800/20 border border-slate-800/60 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-slate-300 font-bold text-sm">${loan.amount_usdt?.toFixed(2)} USDT</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 font-medium">{formatDateShort(loan.created_at)}</p>
                </div>
                <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                  ✓ {t('loans.settledBadge')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── main component ──────────────────────────────────────────── */
export default function Store() {
  const { t } = useTranslation('store')
  const { user, plans, loading, refreshUser } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const renewState = location.state

  const [activeTab, setActiveTab] = useState('plans')
  const [buyingPlan, setBuyingPlan] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loans, setLoans] = useState([])
  const [loansLoading, setLoansLoading] = useState(false)
  const [payingLoan, setPayingLoan] = useState(null)
  const [confirmPlan, setConfirmPlan] = useState(null)

  const [isWebGLSupported, setIsWebGLSupported] = useState(true)
  useEffect(() => {
    setIsWebGLSupported(checkWebGLSupport())
  }, [])

  const [selectedPlan, setSelectedPlan] = useState(null)
  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlan) {
      const sorted = [...plans].sort((a, b) => (a.traffic_gb || 0) - (b.traffic_gb || 0))
      setSelectedPlan(sorted[0])
    }
  }, [plans, selectedPlan])

  useEffect(() => {
    if (activeTab === 'loans') loadLoans()
  }, [activeTab])

  // Auto-dismiss notifications
  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(null); setSuccess(null) }, 6000)
      return () => clearTimeout(t)
    }
  }, [error, success])

  const loadLoans = async () => {
    setLoansLoading(true)
    try {
      const data = await getMyLoans()
      setLoans(Array.isArray(data) ? data : [])
    } catch { setLoans([]) }
    finally { setLoansLoading(false) }
  }

  const totalUnpaidLoan = loans.filter(l => l.status === 'unpaid').reduce((s, l) => s + (l.amount_usdt || 0), 0)
  const validGbs = plans.filter(p => (p.traffic_gb || 0) > 0).map(p => p.traffic_gb)
  const maxTrafficGb = validGbs.length > 0 ? Math.max(...validGbs) : 1

  const handlePayLoan = async (loan) => {
    setError(null); setSuccess(null)
    setPayingLoan(loan.loan_id)
    try {
      const result = await payLoan(loan.loan_id)
      const url = result?.invoice_url
      if (url) {
        const tg = window.Telegram?.WebApp
        tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
        setSuccess(t('main.paymentLinkOpened'))
      }
    } catch (e) {
      setError(e?.response?.data?.detail || t('main.failedPayment'))
    } finally { setPayingLoan(null) }
  }

  const handleBuy = (plan) => {
    setError(null); setSuccess(null)
    setConfirmPlan(plan)
  }

  const handleConfirmBuy = async (plan, discountCode) => {
    setError(null); setSuccess(null)
    setBuyingPlan(plan.plan_name)
    try {
      const result = await createInvoice(plan.plan_name, 'USDT', discountCode)
      setConfirmPlan(null)
      if (result?.status === 'wallet_payment') {
        setSuccess(t('main.planPurchased', { planName: plan.plan_name, gb: result.traffic_gb_added }))
        await refreshUser()
      } else {
        const url = result?.invoice_url || result?.url || result
        if (url && typeof url === 'string') {
          const tg = window.Telegram?.WebApp
          tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
          setSuccess(t('main.invoiceCreated'))
        } else {
          setSuccess(t('main.invoiceCreatedSuccess'))
        }
      }
    } catch (e) {
      setError(e?.response?.data?.detail || t('main.failedRequest'))
    } finally { setBuyingPlan(null) }
  }

  const handleDeposit = async (amount) => {
    setBuyingPlan(`deposit_${amount}`)
    setError(null); setSuccess(null)
    try {
      const result = await createDepositInvoice(amount, 'USDT')
      const url = result?.invoice_url || result?.url || result
      if (url && typeof url === 'string') {
        const tg = window.Telegram?.WebApp
        tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
        setSuccess(t('main.invoiceCreated'))
      }
    } catch (e) {
      setError(e?.response?.data?.detail || t('main.failedDeposit'))
    } finally { setBuyingPlan(null) }
  }

  return (
    <div className="px-4 py-5 space-y-4.5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {renewState?.renewUuid ? t('header.renew') : t('header.title')}
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {renewState?.serverName ? t('header.renewing', { serverName: renewState.serverName }) : t('header.subtitle')}
          </p>
        </div>
        <div className="w-9 h-9 bg-slate-800/40 rounded-xl border border-slate-800/40 flex items-center justify-center">
          <FiShoppingCart className="text-emerald-400" size={16} />
        </div>
      </div>

      {/* Balance Cards */}
      <BalanceCard
        walletUsd={user?.wallet_balance_usd}
        trafficGb={user?.traffic_balance_gb}
        unpaidLoan={totalUnpaidLoan}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-3 bg-rose-900/30 border border-rose-800/30 rounded-2xl px-4 py-3.5 animate-in slide-in-from-top-2 duration-300">
          <FiAlertCircle className="text-rose-400 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-rose-300 text-xs font-semibold">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-emerald-900/30 border border-emerald-800/30 rounded-2xl px-4 py-3.5 animate-in slide-in-from-top-2 duration-300">
          <FiCheck className="text-emerald-400 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-emerald-300 text-xs font-semibold">{success}</p>
        </div>
      )}

      {/* Tab Bar */}
      {!renewState?.renewUuid && (
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          hasLoanBadge={totalUnpaidLoan > 0}
        />
      )}

      {/* Plans Tab */}
      {(renewState?.renewUuid || activeTab === 'plans') && (
        <div className="flex flex-col gap-4.5 min-h-[40vh]">
          {/* Section header */}
          <div className="flex items-center gap-2 pt-1">
            <FiShoppingCart className="text-emerald-400" size={15} />
            <h2 className="text-slate-200 font-extrabold text-sm tracking-wide uppercase">
              {renewState?.renewUuid ? t('main.selectPlanRenew') : t('main.availablePlans')}
            </h2>
          </div>

          {loading ? (
            <div className="w-full space-y-3.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-slate-800/30 border border-slate-800/60 rounded-2xl p-5 space-y-4 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-3 w-20 bg-slate-700 rounded" />
                    <div className="h-3 w-14 bg-slate-700 rounded" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-6 w-32 bg-slate-700 rounded" />
                    <div className="h-5 w-16 bg-slate-700 rounded" />
                  </div>
                  <div className="h-1.5 w-full bg-slate-700 rounded animate-pulse" />
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-slate-700 rounded" />
                    <div className="h-8 w-20 bg-slate-700 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 text-center">
              <FiPackage className="text-slate-500 mx-auto mb-2" size={28} />
              <p className="text-slate-400 text-sm font-semibold">{t('main.noPlans')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {isWebGLSupported && (
                <WebGLErrorBoundary fallback={null}>
                  <React.Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-[180px] bg-slate-900/30 border border-slate-800/80 rounded-3xl animate-pulse w-full">
                      <FiLoader className="text-emerald-500 animate-spin mb-2" size={20} />
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">{t('main.initializing3d')}</span>
                    </div>
                  }>
                    <PlanScene
                      plans={plans}
                      selectedPlan={selectedPlan}
                      onSelectPlan={setSelectedPlan}
                      maxTrafficGb={maxTrafficGb}
                    />
                  </React.Suspense>
                </WebGLErrorBoundary>
              )}

              <PlansList
                plans={plans}
                maxTrafficGb={maxTrafficGb}
                onBuy={handleBuy}
                buying={buyingPlan}
                selectedPlan={selectedPlan}
                onSelectPlan={setSelectedPlan}
              />
            </div>
          )}

          <div className="bg-slate-800/20 border border-slate-800/60 rounded-2xl px-4 py-3.5 flex items-start gap-3">
            <FiInfo className="text-slate-500 flex-shrink-0 mt-0.5" size={13} />
            <p className="text-slate-500 text-[10px] leading-relaxed">
              Plans with sufficient wallet balance are purchased instantly. Others will automatically redirect to crypto invoice payments.
            </p>
          </div>
        </div>
      )}

      {/* Deposit Tab */}
      {!renewState?.renewUuid && activeTab === 'deposit' && (
        <DepositTab 
          onDeposit={handleDeposit} 
          buying={buyingPlan} 
          currentBalance={user?.wallet_balance_usd || 0}
        />
      )}

      {/* Withdrawal Tab */}
      {!renewState?.renewUuid && activeTab === 'withdrawal' && (
        <WithdrawalTab onNavigate={() => navigate('/profile', { state: { createWithdrawal: true } })} />
      )}

      {/* Loans Tab */}
      {!renewState?.renewUuid && activeTab === 'loans' && (
        <LoansTab
          loans={loans}
          loansLoading={loansLoading}
          onPayLoan={handlePayLoan}
          payingLoan={payingLoan}
        />
      )}

      {/* Buy Confirmation Modal */}
      {confirmPlan && (
        <BuyConfirmModal
          plan={confirmPlan}
          walletBalance={user?.wallet_balance_usd || 0}
          onConfirm={handleConfirmBuy}
          onCancel={() => setConfirmPlan(null)}
          buying={buyingPlan}
        />
      )}
    </div>
  )
}
