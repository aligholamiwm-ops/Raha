import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'
import {
  createInvoice, createDepositInvoice, getMyLoans, payLoan, validateDiscount,
  getMyTickets, getAllTickets, createTicket, getTicket, replyTicket, updateTicketStatus,
  checkNickname, updateNickname, getLinks,
} from '../api/client'

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
  FiPackage, FiTag, FiX, FiUser, FiEdit2, FiSend,
  FiMessageSquare, FiPlus, FiChevronLeft, FiDollarSign, FiDatabase,
  FiChevronDown, FiExternalLink, FiGlobe, FiUsers,
} from 'react-icons/fi'
import { formatDate, formatDateTime, formatDateShort } from '../utils/dates'

import ReferralTab from './Referral'

function formatGregorian(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${dd} ${h}:${mi}`
}

import androidIcon from '../../icons/android.png'
import appleIcon from '../../icons/apple.png'

/* ─── helpers ────────────────────────────────────────────────────── */
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
  if (gb <= 10)  return '#34d399'
  if (gb <= 30)  return '#60a5fa'
  if (gb <= 60)  return '#818cf8'
  if (gb <= 120) return '#c084fc'
  if (gb <= 200) return '#f472b6'
  return '#f87171'
}

function VolumeCube({ side, color }) {
  const gridBg = `linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`
  const bgSize = '8px 8px'

  const faceStyle = (opacity, transform) => ({
    position: 'absolute', inset: 0,
    background: color,
    opacity, transform,
    border: '1px solid rgba(255,255,255,0.2)',
    backgroundImage: gridBg,
    backgroundSize: bgSize,
  })

  return (
    <div style={{ width: side, height: side, perspective: '1000px', flexShrink: 0, position: 'relative' }}>
      <div style={{
        width: '100%', height: '100%', position: 'absolute', transformStyle: 'preserve-3d',
        transform: 'rotateX(-25deg) rotateY(40deg)',
      }}>
        {/* Front */}
        <div style={faceStyle(0.9, `translateZ(${side / 2}px)`)} />
        {/* Back */}
        <div style={faceStyle(0.5, `rotateY(180deg) translateZ(${side / 2}px)`)} />
        {/* Right */}
        <div style={faceStyle(0.7, `rotateY(90deg) translateZ(${side / 2}px)`)} />
        {/* Left */}
        <div style={faceStyle(0.7, `rotateY(-90deg) translateZ(${side / 2}px)`)} />
        {/* Top */}
        <div style={{...faceStyle(1.0, `rotateX(90deg) translateZ(${side / 2}px)`), border: '1px solid rgba(255,255,255,0.4)'}} />
        {/* Bottom */}
        <div style={faceStyle(0.3, `rotateX(-90deg) translateZ(${side / 2}px)`)} />
      </div>
    </div>
  )
}

const CATEGORIES = ['connection', 'help', 'withdrawal', 'cooperation']
const COL_W = 108
const MAX_SIDE = 64
const SQ_ROW_H = MAX_SIDE + 28
const DEPOSIT_PRESETS = [5, 10, 20, 50]

/* ─── Top Tab Bar ─────────────────────────────────────────────────── */
function TopTabs({ active, onChange, loanBadge }) {
  const { t } = useTranslation('profile')
  const tabs = [
    { id: 'account',  icon: FiDollarSign, label: t('tabs.account') },
    { id: 'me',       icon: FiUser,        label: t('tabs.me') },
    { id: 'referral', icon: FiUsers,       label: t('tabs.referral') },
  ]
  return (
    <div className="flex gap-1 bg-slate-800/80 border border-slate-700 rounded-2xl p-1">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            active === t.id
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <t.icon size={14} />
          <span>{t.label}</span>
          {t.badge && (
            <span className="absolute top-1.5 end-2 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
          )}
          {t.id === 'account' && loanBadge && (
            <span className="absolute top-1.5 end-2 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
          )}
        </button>
      ))}
    </div>
  )
}

/* ─── Balance Cards ───────────────────────────────────────────────── */
function BalanceCards({ walletUsd, trafficGb, unpaidLoan }) {
  const { t } = useTranslation('profile')
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <div className="bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 border border-emerald-700/40 rounded-2xl p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FiDollarSign size={12} className="text-emerald-400" />
          <p className="text-[10px] text-emerald-400 font-medium">{t('balance.wallet')}</p>
        </div>
        <p className="text-lg font-bold text-white">${(walletUsd || 0).toFixed(2)}</p>
        <p className="text-[9px] text-emerald-600 mt-0.5">USDT</p>
      </div>
      <div className="bg-gradient-to-br from-blue-900/60 to-blue-800/40 border border-blue-700/40 rounded-2xl p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FiDatabase size={12} className="text-blue-400" />
          <p className="text-[10px] text-blue-400 font-medium">{t('balance.traffic')}</p>
        </div>
        <p className="text-lg font-bold text-white">{(trafficGb || 0).toFixed(2)}</p>
        <p className="text-[9px] text-blue-600 mt-0.5">GB</p>
      </div>
      <div className="bg-gradient-to-br from-rose-900/60 to-rose-800/40 border border-rose-700/40 rounded-2xl p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FiAlertCircle size={12} className="text-rose-400" />
          <p className="text-[10px] text-rose-400 font-medium">{t('balance.loan')}</p>
        </div>
        <p className="text-lg font-bold text-white">${(unpaidLoan || 0).toFixed(2)}</p>
        <p className="text-[9px] text-rose-600 mt-0.5">USDT</p>
      </div>
    </div>
  )
}

/* ─── Store Sub-tabs ──────────────────────────────────────────────── */
function StoreTabBar({ active, onChange, loanBadge }) {
  const { t } = useTranslation('profile')
  const tabs = [
    { id: 'plans',      icon: FiShoppingCart, label: t('store.plans') },
    { id: 'deposit',    icon: FiArrowUp,      label: t('store.deposit') },
    { id: 'withdrawal', icon: FiArrowDown,    label: t('store.withdraw') },
    { id: 'loans',      icon: FiCreditCard,   label: t('store.loans'), badge: loanBadge },
  ]
  return (
    <div className="flex gap-1 bg-slate-900/60 border border-slate-700/60 rounded-xl p-1">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[9px] font-semibold transition-all ${
            active === t.id
              ? 'bg-slate-700 text-emerald-400'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <t.icon size={13} />
          {t.label}
          {t.badge && <span className="absolute top-0.5 end-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />}
        </button>
      ))}
    </div>
  )
}

/* ─── Plans Grid ──────────────────────────────────────────────────── */
function PlansGrid({ plans, maxTrafficGb, onBuy, buying, selectedPlan, onSelectPlan }) {
  const { t } = useTranslation('profile')
  const sorted = [...plans].sort((a, b) => (a.traffic_gb || 0) - (b.traffic_gb || 0))
  const n = sorted.length
  const max = maxTrafficGb || 1
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4, width: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${n}, ${COL_W}px)`,
        gridTemplateRows: `auto ${SQ_ROW_H}px auto auto auto`,
        columnGap: 8, rowGap: 0,
        width: `${n * COL_W + (n - 1) * 8}px`,
        minWidth: '100%',
        padding: '6px',
      }}>
        {sorted.map((plan, i) => {
          const gb = plan.traffic_gb || 0
          const side = Math.max(18, Math.round(MAX_SIDE * Math.sqrt(gb) / Math.sqrt(max)))
          const color = planColor(gb)
          const col = i + 1
          const busy = buying === plan.plan_name
          const isSelected = selectedPlan?.plan_name === plan.plan_name
          return (
            <React.Fragment key={plan.plan_name}>
              {/* Clickable Column Background Container Card */}
              <div
                onClick={() => onSelectPlan && onSelectPlan(plan)}
                style={{
                  gridColumn: col,
                  gridRow: "1 / 6",
                  background: isSelected ? `${color}12` : 'rgba(30, 41, 59, 0.25)',
                  border: isSelected ? `2px solid ${color}` : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  zIndex: 0,
                  transform: isSelected ? 'scale(1.02)' : 'scale(1.0)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isSelected ? `0 4px 20px ${color}20` : undefined,
                  padding: '12px 0'
                }}
              />

              <div style={{ gridColumn: col, gridRow: 1, textAlign: 'center', paddingBottom: 14, zIndex: 1, pointerEvents: 'none', paddingTop: 12 }}>
                <span className="text-white font-bold tracking-wide" style={{ fontSize: 11, lineHeight: 1.3 }}>
                  {parseDuration(plan.plan_name)}
                </span>
              </div>
              <div style={{ gridColumn: col, gridRow: 2, height: SQ_ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, pointerEvents: 'none' }}>
                <VolumeCube side={side} color={color} />
              </div>
              <div style={{ gridColumn: col, gridRow: 3, textAlign: 'center', paddingTop: 12, paddingBottom: 4, zIndex: 1, pointerEvents: 'none' }}>
                <span className="font-extrabold whitespace-nowrap" style={{ fontSize: 11, color }}>{gb}&nbsp;GB</span>
              </div>
              <div style={{ gridColumn: col, gridRow: 4, textAlign: 'center', paddingBottom: 10, zIndex: 1, pointerEvents: 'none' }}>
                <span className="text-white font-black whitespace-nowrap" style={{ fontSize: 13 }}>${(plan.price_usd || 0).toFixed(2)}</span>
              </div>
              <div style={{ gridColumn: col, gridRow: 5, display: 'flex', justifyContent: 'center', zIndex: 1, paddingBottom: 12 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onBuy(plan)
                  }}
                  disabled={busy}
                  style={{ width: 72, height: 30 }}
                  className={`rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${
                    busy ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white shadow-md'
                  }`}
                >
                  {busy ? <FiLoader size={9} className="animate-spin" /> : t('plans.buy')}
                </button>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Buy Confirm Modal ───────────────────────────────────────────── */
function BuyConfirmModal({ plan, walletBalance, onConfirm, onCancel, buying }) {
  const { t } = useTranslation('profile')
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
    setValidating(true); setDiscountError(null); setAppliedDiscount(null)
    try {
      const result = await validateDiscount(discountCode.trim())
      setAppliedDiscount(result)
    } catch (e) {
      setDiscountError(e?.response?.data?.detail || t('buy.invalidCode'))
    } finally { setValidating(false) }
  }

  if (!plan) return null
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center px-4 pt-4 pb-24 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-white font-bold text-base">{t('buy.confirmPurchase')}</h3>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-700 text-slate-400">
            <FiX size={16} />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">{t('buy.plan')}</span>
              <span className="text-white font-bold text-sm">{parseDuration(plan.plan_name)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">{t('buy.traffic')}</span>
              <span className="text-emerald-400 font-bold text-sm">{plan.traffic_gb} GB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">{t('buy.basePrice')}</span>
              <span className="text-white text-sm">${basePrice.toFixed(2)}</span>
            </div>
            {appliedDiscount && (
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-xs flex items-center gap-1"><FiTag size={10} /> {t('buy.discount')} ({discountPct}%)</span>
                <span className="text-sm font-bold">−${(basePrice - finalPrice).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
              <span className="text-slate-300 text-xs font-medium">{t('buy.youPay')}</span>
              <span className="text-white font-black text-base">${finalPrice.toFixed(2)} <span className="text-slate-400 text-xs font-normal">USDT</span></span>
            </div>
          </div>
          {!appliedDiscount ? (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('buy.discountPlaceholder')}
                  value={discountCode}
                  onChange={e => { setDiscountCode(e.target.value); setDiscountError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={!discountCode.trim() || validating}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
                >
                  {validating ? <FiLoader size={14} className="animate-spin" /> : t('buy.apply')}
                </button>
              </div>
              {discountError && <p className="text-rose-400 text-xs mt-1 flex items-center gap-1"><FiAlertCircle size={11} />{discountError}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FiTag className="text-emerald-400" size={14} />
                <span className="text-emerald-400 font-bold text-sm">{appliedDiscount.code}</span>
                <span className="text-emerald-300 text-xs">({discountPct}% {t('buy.off')})</span>
              </div>
              <button onClick={() => { setAppliedDiscount(null); setDiscountCode('') }} className="text-slate-400 hover:text-rose-400">
                <FiX size={14} />
              </button>
            </div>
          )}
          {!canAfford && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
              <FiInfo size={12} /> {t('buy.insufficientBalance')}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold">{t('buy.cancel')}</button>
            <button
              onClick={() => onConfirm(plan, appliedDiscount?.code || null)}
              disabled={buying === plan.plan_name}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ${
                buying === plan.plan_name ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
              }`}
            >
              {buying === plan.plan_name ? <><FiLoader size={13} className="animate-spin" /> {t('buy.processing')}</> : <><FiCheck size={13} /> {t('buy.confirm')}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Account Tab ─────────────────────────────────────────────────── */
function AccountTab({ user, plans, loading: plansLoading, refreshUser, renewState, onWithdrawTicket }) {
  const { t } = useTranslation('profile')
  const [storeTab, setStoreTab] = useState(renewState?.renewUuid ? 'plans' : 'plans')
  const [buyingPlan, setBuyingPlan] = useState(null)
  const [loans, setLoans] = useState([])
  const [loansLoading, setLoansLoading] = useState(false)
  const [payingLoan, setPayingLoan] = useState(null)
  const [confirmPlan, setConfirmPlan] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

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

  const totalUnpaidLoan = loans.filter(l => l.status === 'unpaid').reduce((s, l) => s + (l.amount_usdt || 0), 0)
  const validGbs = plans.filter(p => (p.traffic_gb || 0) > 0).map(p => p.traffic_gb)
  const maxTrafficGb = validGbs.length > 0 ? Math.max(...validGbs) : 1

  useEffect(() => {
    if (storeTab === 'loans') loadLoans()
  }, [storeTab])

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

  const handlePayLoan = async (loan) => {
    setPayingLoan(loan.loan_id)
    try {
      const result = await payLoan(loan.loan_id)
      const url = result?.invoice_url
      if (url) {
        const tg = window.Telegram?.WebApp
        tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
        setSuccess(t('account.paymentLinkOpened'))
      }
    } catch (e) { setError(e?.response?.data?.detail || t('account.failedPayment')) }
    finally { setPayingLoan(null) }
  }

  const handleDeposit = async (amount) => {
    setBuyingPlan(`deposit_${amount}`)
    try {
      const result = await createDepositInvoice(amount, 'USDT')
      const url = result?.invoice_url || result?.url || result
      if (url && typeof url === 'string') {
        const tg = window.Telegram?.WebApp
        tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
        setSuccess(t('account.invoiceCreated'))
      }
    } catch (e) { setError(e?.response?.data?.detail || t('account.failedDepositInvoice')) }
    finally { setBuyingPlan(null) }
  }

  const handleConfirmBuy = async (plan, discountCode) => {
    setBuyingPlan(plan.plan_name)
    try {
      const result = await createInvoice(plan.plan_name, 'USDT', discountCode)
      setConfirmPlan(null)
      if (result?.status === 'wallet_payment') {
        setSuccess(t('account.gbAdded', { gb: result.traffic_gb_added }))
        await refreshUser()
      } else {
        const url = result?.invoice_url || result?.url || result
        if (url && typeof url === 'string') {
          const tg = window.Telegram?.WebApp
          tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
          setSuccess(t('account.invoiceCreatedOpen'))
        }
      }
    } catch (e) { setError(e?.response?.data?.detail || t('account.failedRequest')) }
    finally { setBuyingPlan(null) }
  }

  return (
    <div className="space-y-3">
      <BalanceCards
        walletUsd={user?.wallet_balance_usd}
        trafficGb={user?.traffic_balance_gb}
        unpaidLoan={totalUnpaidLoan}
      />

      {(error || success) && (
        <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs animate-in slide-in-from-top-2 duration-300 ${
          error ? 'bg-rose-900/30 border border-rose-700/40 text-rose-300' : 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-300'
        }`}>
          {error ? <FiAlertCircle size={13} className="flex-shrink-0 mt-0.5" /> : <FiCheck size={13} className="flex-shrink-0 mt-0.5" />}
          {error || success}
        </div>
      )}

      <StoreTabBar active={storeTab} onChange={setStoreTab} loanBadge={totalUnpaidLoan > 0} />

      {/* Plans Tab */}
      {storeTab === 'plans' && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 self-start">
            <FiShoppingCart className="text-emerald-400" size={14} />
            <h2 className="text-slate-200 font-bold text-sm">{t('account.availablePlans')}</h2>
          </div>
          {plansLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-1 w-full">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-3 flex-shrink-0" style={{ width: COL_W }}>
                  <div className="h-3 w-14 bg-slate-800 rounded-lg animate-pulse" />
                  <div className="bg-slate-800 rounded-sm animate-pulse" style={{ width: 40 + i * 18, height: 40 + i * 18 }} />
                  <div className="h-3 w-10 bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-4 w-12 bg-slate-800 rounded-lg animate-pulse" />
                  <div className="h-[30px] w-[72px] bg-slate-800 rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center w-full">
              <FiPackage className="text-slate-500 mx-auto mb-2" size={24} />
              <p className="text-slate-400 text-sm">{t('account.noPlans')}</p>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              {isWebGLSupported && (
                <WebGLErrorBoundary fallback={null}>
                  <React.Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-[180px] bg-slate-800/40 border border-slate-700/50 rounded-2xl animate-pulse w-full">
                      <FiLoader className="text-emerald-500 animate-spin mb-2" size={20} />
                      <span className="text-xs text-slate-500 font-medium">{t('account.initializing3d')}</span>
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

              <PlansGrid
                plans={plans}
                maxTrafficGb={maxTrafficGb}
                onBuy={p => { setError(null); setSuccess(null); setConfirmPlan(p) }}
                buying={buyingPlan}
                selectedPlan={selectedPlan}
                onSelectPlan={setSelectedPlan}
              />
            </div>
          )}
          {/* Purchase History */}
          {(user?.purchase_history?.length > 0) && (
            <div className="w-full space-y-2">
              <div className="flex items-center gap-2">
                <FiPackage className="text-slate-400" size={14} />
                <h3 className="text-slate-300 font-bold text-xs">{t('account.purchaseHistory')}</h3>
              </div>
              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/40">
                        <th className="text-start text-slate-500 font-medium px-3 py-2">{t('account.purchaseDate')}</th>
                        <th className="text-start text-slate-500 font-medium px-3 py-2">{t('account.purchasePlan')}</th>
                        <th className="text-start text-slate-500 font-medium px-3 py-2">{t('account.purchasePrice')}</th>
                        <th className="text-start text-slate-500 font-medium px-3 py-2">{t('account.purchaseTraffic')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(user?.purchase_history || [])].reverse().map((p, i) => (
                        <tr key={i} className="border-b border-slate-700/20 last:border-0">
                          <td className="text-slate-300 px-3 py-2 whitespace-nowrap">{formatGregorian(p.date)}</td>
                          <td className="text-slate-300 px-3 py-2">{p.plan_name === 'Free Trial' ? t('account.freeTrial') : (p.plan_name || "—")}</td>
                          <td className="text-slate-300 px-3 py-2">${(p.price_usd || 0).toFixed(2)}</td>
                          <td className="text-slate-300 px-3 py-2">{(p.traffic_gb || 0).toFixed(1)} GB</td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deposit Tab */}
      {storeTab === 'deposit' && <DepositPanel onDeposit={handleDeposit} buying={buyingPlan} />}

      {/* Withdrawal Tab */}
      {storeTab === 'withdrawal' && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 text-center space-y-4">
          <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <FiArrowDown className="text-amber-400" size={24} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm mb-1.5">{t('account.withdrawTitle')}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              {t('account.withdrawDesc')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {['TRC20', 'BEP-20', 'TON'].map(net => (
              <div key={net} className="bg-slate-900 border border-slate-700 rounded-xl py-2 text-slate-300 font-medium">{net}</div>
            ))}
          </div>
          <button
            onClick={onWithdrawTicket}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
          >
            <FiChevronRight size={15} className="rtl:rotate-180" /> {t('account.createWithdrawTicket')}
          </button>
        </div>
      )}

      {/* Loans Tab */}
      {storeTab === 'loans' && <LoansPanel loans={loans} loading={loansLoading} onPayLoan={handlePayLoan} payingLoan={payingLoan} />}

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

/* ─── Deposit Panel ───────────────────────────────────────────────── */
function DepositPanel({ onDeposit, buying }) {
  const { t } = useTranslation('profile')
  const [amount, setAmount] = useState('')
  return (
    <div className="space-y-3">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiArrowUp className="text-emerald-400" size={15} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">{t('deposit.title')}</h3>
            <p className="text-slate-400 text-xs">{t('deposit.subtitle')}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-2">{t('deposit.quickAmounts')}</p>
          <div className="grid grid-cols-4 gap-2">
            {DEPOSIT_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  amount === String(p) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-500/50'
                }`}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-2">{t('deposit.customAmount')}</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl ps-7 pe-3 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                min={1}
              />
            </div>
            <button
              onClick={() => { const a = parseFloat(amount); if (a > 0) onDeposit(a) }}
              disabled={!amount || parseFloat(amount) <= 0 || !!buying}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-5 rounded-xl"
            >
              {buying ? <FiLoader size={16} className="animate-spin" /> : t('deposit.button')}
            </button>
          </div>
        </div>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2.5 flex items-start gap-2">
        <FiInfo className="text-blue-400 flex-shrink-0 mt-0.5" size={12} />
        <p className="text-xs text-blue-300">{t('deposit.info')}</p>
      </div>
    </div>
  )
}

/* ─── Loans Panel ─────────────────────────────────────────────────── */
function LoansPanel({ loans, loading, onPayLoan, payingLoan }) {
  const { t } = useTranslation('profile')
  const unpaid = loans.filter(l => l.status === 'unpaid')
  const settled = loans.filter(l => l.status === 'settled')
  const totalUnpaid = unpaid.reduce((s, l) => s + (l.amount_usdt || 0), 0)

  if (loading) return (
    <div className="space-y-2">
      {[1, 2].map(i => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)}
    </div>
  )
  if (loans.length === 0) return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
      <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <FiCheck className="text-emerald-400" size={18} />
      </div>
      <p className="text-white font-semibold text-sm">{t('loans.noLoans')}</p>
      <p className="text-slate-400 text-xs mt-1">{t('loans.noLoansDesc')}</p>
    </div>
  )
  return (
    <div className="space-y-3">
      {totalUnpaid > 0 && (
        <div className="bg-rose-900/30 border border-rose-700/40 rounded-2xl p-3.5 flex items-center gap-3">
          <FiAlertCircle className="text-rose-400 flex-shrink-0" size={18} />
          <div>
            <p className="text-xs text-rose-400 font-medium">{t('loans.outstanding')}</p>
            <p className="text-base font-bold text-white">${totalUnpaid.toFixed(2)} USDT</p>
          </div>
        </div>
      )}
      {unpaid.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('loans.unpaid', { count: unpaid.length })}</p>
          <div className="space-y-2">
            {unpaid.map(loan => (
              <div key={loan.loan_id} className="bg-rose-900/20 border border-rose-700/30 rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white font-bold text-sm">${loan.amount_usdt?.toFixed(2)} USDT</p>
                    <p className="text-[10px] text-slate-500">{formatDateShort(loan.created_at)}{loan.note && ` · ${loan.note}`}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">{t('loans.unpaidBadge')}</span>
                </div>
                <button
                  onClick={() => onPayLoan(loan)}
                  disabled={payingLoan === loan.loan_id}
                  className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl"
                >
                  {payingLoan === loan.loan_id ? <><FiLoader size={11} className="animate-spin" /> {t('loans.processing')}</> : <><FiCreditCard size={11} /> {t('loans.payNow')}</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {settled.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('loans.settled', { count: settled.length })}</p>
          <div className="space-y-2">
            {settled.map(loan => (
              <div key={loan.loan_id} className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">${loan.amount_usdt?.toFixed(2)} USDT</p>
                  <p className="text-[10px] text-slate-500">{formatDateShort(loan.created_at)}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">{t('loans.settledBadge')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Links Section (Support Tab top) ─────────────────────────────── */
function openLink(url) {
  const tg = window.Telegram?.WebApp
  tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
}

function LinksSection() {
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedIndex, setExpandedIndex] = useState(0)

  useEffect(() => {
    getLinks()
      .then(setSections)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden animate-pulse p-4">
      <div className="h-5 w-32 bg-slate-700 rounded" />
    </div>
  )

  if (sections.length === 0) return null

  return sections.map((section, idx) => {
    const expanded = expandedIndex === idx
    return (
      <div key={section.title} className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden">
        <button
          onClick={() => setExpandedIndex(expanded ? -1 : idx)}
          className="w-full flex items-center justify-between px-4 py-3 text-start text-white font-semibold text-sm hover:bg-slate-700/50 transition-colors"
        >
          {section.title}
          <FiChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="grid grid-cols-2 gap-3 p-4 pt-0 overflow-x-auto">
            {Object.entries(section.columns || {}).map(([key, items]) => (
              items.length > 0 && (
                <div key={key} className="min-w-0">
                  <div className="flex justify-center mb-3">
                    <img
                      src={key === 'android' ? androidIcon : appleIcon}
                      alt={key}
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <div className="space-y-1.5">
                    {items.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => openLink(item.url)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl text-xs text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-all text-start"
                      >
                        <FiExternalLink size={12} className="text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    )
  })
}

/* ─── Support Tab ─────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const { t } = useTranslation('profile')
  const styles = { open: 'bg-emerald-500/20 text-emerald-400', closed: 'bg-slate-600/50 text-slate-400', waiting_for_user: 'bg-yellow-500/20 text-yellow-400' }
  const labels = { open: t('support.statusOpen'), closed: t('support.statusClosed'), waiting_for_user: t('support.statusWaiting') }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.open}`}>{labels[status] || status.replace('_', ' ')}</span>
}

function SupportTab({ user, initialCategory, clearInitialCategory }) {
  const { t } = useTranslation('profile')
  const [view, setView] = useState(initialCategory ? 'new' : 'list')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [newCategory, setNewCategory] = useState(initialCategory || null)

  const isStaff = useMemo(() => user?.role === 'admin' || user?.role === 'support', [user?.role])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')

  const loadTickets = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let data
      if (isStaff) {
        const params = {}
        if (filterStatus) params.status = filterStatus
        if (filterCategory) params.category = filterCategory
        params.sort_by = sortBy
        params.sort_order = sortOrder
        data = await getAllTickets(params)
      } else {
        data = await getMyTickets()
      }
      setTickets(Array.isArray(data) ? data : [])
    } catch { setError(t('support.failedLoad')); setTickets([]) }
    finally { setLoading(false) }
  }, [isStaff, filterStatus, filterCategory, sortBy, sortOrder, t])

  useEffect(() => { loadTickets() }, [loadTickets])

  useEffect(() => {
    if (initialCategory) {
      setNewCategory(initialCategory)
      setView('new')
    }
  }, [initialCategory])

  const handleTicketCreated = (ticket) => {
    setSelectedTicketId(ticket.ticket_id)
    setView('thread')
    clearInitialCategory()
    loadTickets()
  }

  if (view === 'new') {
    return (
      <NewTicketForm
        onCreated={handleTicketCreated}
        onCancel={() => { setView('list'); clearInitialCategory() }}
        initialCategory={newCategory}
      />
    )
  }

  if (view === 'thread' && selectedTicketId) {
    return (
      <TicketThread
        ticketId={selectedTicketId}
        onBack={() => setView('list')}
        isStaff={isStaff}
      />
    )
  }

  return (
    <div className="space-y-3">
      <LinksSection />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">{isStaff ? t('support.dashboard') : t('support.title')}</h2>
          <p className="text-slate-400 text-xs">{isStaff ? t('support.manage') : t('support.hereToHelp')}</p>
        </div>
        {!isStaff && (
          <button
            onClick={() => { setNewCategory(null); setView('new') }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-xl"
          >
            <FiPlus size={13} /> {t('support.newTicket')}
          </button>
        )}
      </div>

      {isStaff && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500">
              <option value="">{t('support.allStatus')}</option>
              <option value="open">{t('support.statusOpen')}</option>
              <option value="waiting_for_user">{t('support.statusWaiting')}</option>
              <option value="closed">{t('support.statusClosed')}</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500 capitalize">
              <option value="">{t('support.allCategories')}</option>
              {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500">
              <option value="created_at">{t('support.byCreated')}</option>
              <option value="updated_at">{t('support.byUpdated')}</option>
            </select>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500">
              <option value="desc">{t('support.newestFirst')}</option>
              <option value="asc">{t('support.oldestFirst')}</option>
            </select>
          </div>
        </div>
      )}

      {error && <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2.5 text-red-400 text-xs">{error}</div>}

      <div className="space-y-2">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />)
        ) : tickets.length === 0 ? (
          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-8 text-center space-y-3">
            <FiMessageSquare className="text-slate-500 mx-auto" size={24} />
            <p className="text-slate-400 text-sm">{t('support.noTickets')}</p>
            {!isStaff && (
              <button onClick={() => { setNewCategory(null); setView('new') }} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg">
                {t('support.openTicket')}
              </button>
            )}
          </div>
        ) : (
          tickets.map(ticket => (
            <button
              key={ticket.ticket_id}
              onClick={() => { setSelectedTicketId(ticket.ticket_id); setView('thread') }}
              className="w-full text-start bg-slate-800 rounded-xl ring-1 ring-slate-700 hover:ring-slate-500 p-3.5 space-y-1.5 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-white font-medium text-sm truncate">{ticket.title || `Ticket #${ticket.ticket_id?.slice(0, 8)}`}</span>
                <StatusBadge status={ticket.status} />
              </div>
              {isStaff && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {ticket.user_telegram_info?.photo_url && (
                    <img src={ticket.user_telegram_info.photo_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  )}
                  <span className="font-medium text-slate-300">
                    {[ticket.user_telegram_info?.first_name, ticket.user_telegram_info?.last_name].filter(Boolean).join(' ') || `ID: ${ticket.telegram_id}`}
                  </span>
                  {ticket.user_telegram_info?.username && <span className="text-slate-500">@{ticket.user_telegram_info.username}</span>}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">{ticket.category}</span>
                <span className="text-slate-500 text-[10px]">{formatDateTime(ticket.created_at)}</span>
              </div>
              {ticket.messages?.[0]?.text && (
                <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{ticket.messages[0].text.slice(0, 100)}</p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ─── New Ticket Form ─────────────────────────────────────────────── */
function NewTicketForm({ onCreated, onCancel, initialCategory = null }) {
  const { t } = useTranslation('profile')
  const [category, setCategory] = useState(initialCategory || CATEGORIES[0])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [usdtAddress, setUsdtAddress] = useState('')
  const [usdtNetwork, setUsdtNetwork] = useState('TRC20')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim() || !title.trim()) return
    if (category === 'withdrawal' && !usdtAddress.trim()) { setError(t('newTicket.usdtAddressRequired')); return }
    setSubmitting(true); setError(null)
    try {
      const payload = { title: title.trim(), category, initial_message: message.trim() }
      if (category === 'withdrawal') { payload.usdt_address = usdtAddress.trim(); payload.usdt_network = usdtNetwork }
      const ticket = await createTicket(payload)
      onCreated(ticket)
    } catch (err) { setError(err?.response?.data?.detail || t('newTicket.failedCreate')) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white">
          <FiChevronLeft size={16} className="rtl:rotate-180" />
        </button>
        <h2 className="text-white font-bold text-base">{t('newTicket.title')}</h2>
      </div>

      {error && <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2.5 text-red-400 text-xs">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('newTicket.titlePlaceholder')}
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
          required
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 capitalize"
          disabled={initialCategory !== null}
        >
          {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>

        {category === 'withdrawal' && (
          <>
            <input
              type="text"
              value={usdtAddress}
              onChange={e => setUsdtAddress(e.target.value)}
              placeholder={t('newTicket.withdrawalAddressPlaceholder')}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              required
            />
            <select
              value={usdtNetwork}
              onChange={e => setUsdtNetwork(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="TRC20">TRC20 (Tron)</option>
              <option value="BEP-20">BEP-20 (BSC)</option>
              <option value="TON">TON</option>
            </select>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2.5">
              <p className="text-blue-300 text-xs">{t('newTicket.warningInfo')}</p>
            </div>
          </>
        )}

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          placeholder={t('newTicket.messagePlaceholder')}
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 resize-none placeholder-slate-500"
          required
        />
        <button
          type="submit"
          disabled={submitting || !message.trim() || !title.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl"
        >
          {submitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><FiSend size={14} /> {t('newTicket.submit')}</>}
        </button>
      </form>
    </div>
  )
}

/* ─── Ticket Thread ───────────────────────────────────────────────── */
function TicketThread({ ticketId, onBack, isStaff }) {
  const { t } = useTranslation('profile')
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  const loadTicket = useCallback(async () => {
    try { const data = await getTicket(ticketId); setTicket(data) }
    catch { setError(t('ticket.failedLoad')) }
    finally { setLoading(false) }
  }, [ticketId, t])

  useEffect(() => { loadTicket() }, [loadTicket])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket])

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setSending(true); setError(null)
    try { await replyTicket(ticketId, replyText.trim()); setReplyText(''); await loadTicket() }
    catch (err) { setError(err?.response?.data?.detail || t('ticket.failedReply')) }
    finally { setSending(false) }
  }

  const handleClose = async () => {
    if (!window.confirm(t('ticket.confirmClose'))) return
    try { await updateTicketStatus(ticketId, 'closed'); await loadTicket() }
    catch (err) { setError(err?.response?.data?.detail || t('ticket.failedClose')) }
  }

  const messages = ticket?.messages || []
  return (
    <div className="flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex-shrink-0">
          <FiChevronLeft size={16} className="rtl:rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {ticket?.title || `Ticket #${typeof ticketId === 'string' ? ticketId.slice(0, 8) : ticketId}`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {ticket && <StatusBadge status={ticket.status} />}
            {ticket?.category && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">{ticket.category}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isStaff && ticket?.status !== 'closed' && (
            <button onClick={handleClose} className="text-rose-400 text-xs hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10">{t('ticket.close')}</button>
          )}
          <button onClick={loadTicket} className="text-emerald-400 text-xs hover:text-emerald-300">↻</button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 mb-3 overflow-y-auto max-h-80">
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2.5 text-red-400 text-xs">{error}</div>
        ) : messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">{t('ticket.noMessages')}</p>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.sender_role === 'user' || msg.sender === 'user'
            return (
              <div key={msg.id ?? idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 space-y-0.5 ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-200 rounded-bl-sm'}`}>
                  {!isUser && <p className="text-[10px] font-semibold text-emerald-400">{msg.sender_role === 'support' ? t('ticket.supportRole') : t('ticket.adminRole')}</p>}
                  <p className="text-sm leading-relaxed">{msg.text || ''}</p>
                  <p className={`text-[10px] ${isUser ? 'text-blue-300' : 'text-slate-500'} text-end`}>{formatDateTime(msg.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleReply} className="flex items-end gap-2">
        <textarea
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          placeholder={t('ticket.replyPlaceholder')}
          rows={2}
          className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none placeholder-slate-500"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(e) } }}
        />
        <button
          type="submit"
          disabled={sending || !replyText.trim()}
          className="w-10 h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl flex-shrink-0"
        >
          {sending ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSend size={14} />}
        </button>
      </form>
    </div>
  )
}

/* ─── Me Tab ──────────────────────────────────────────────────────── */
function MeTab({ user, refreshUser }) {
  const { t } = useTranslation('profile')
  const { lng, changeLanguage } = useLanguage()
  const [langSuccess, setLangSuccess] = useState(false)

  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(user?.nickname || '')
  const [checking, setChecking] = useState(false)
  const [availability, setAvailability] = useState(null) // null | {available, reason}
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!editing) return
    setInput(user?.nickname || '')
    setAvailability(null)
    setSaveError(null)
    setSaveSuccess(false)
  }, [editing, user?.nickname])

  const handleInputChange = (val) => {
    setInput(val)
    setAvailability(null)
    setSaveError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 2) return
    if (val.trim() === user?.nickname) { setAvailability({ available: true }); return }
    debounceRef.current = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await checkNickname(val.trim())
        setAvailability(res)
      } catch { setAvailability(null) }
      finally { setChecking(false) }
    }, 500)
  }

  const handleSave = async () => {
    const trimmed = input.trim()
    if (trimmed.length < 2 || trimmed.length > 32) { setSaveError(t('me.charLimit')); return }
    setSaving(true); setSaveError(null)
    try {
      await updateNickname(trimmed)
      await refreshUser()
      setSaveSuccess(true)
      setEditing(false)
    } catch (err) {
      setSaveError(err?.response?.data?.detail || t('me.failedSave'))
    } finally { setSaving(false) }
  }

  const nicknameStatus = (() => {
    if (!editing) return null
    const trimmed = input.trim()
    if (trimmed.length < 2) return null
    if (trimmed === user?.nickname) return 'same'
    if (checking) return 'checking'
    if (!availability) return null
    return availability.available ? 'available' : 'taken'
  })()

  return (
    <div className="space-y-4">
      {/* Username / nickname */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiUser size={14} className="text-slate-400" />
            <span className="text-slate-300 text-sm font-medium">{t('me.username')}</span>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <FiEdit2 size={12} /> {t('me.edit')}
            </button>
          )}
        </div>

        {!editing ? (
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">
              {user?.nickname || <span className="text-slate-500 italic">{t('me.notSet')}</span>}
            </span>
            {user?.nickname && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">{t('me.unique')}</span>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                placeholder={t('me.placeholder')}
                minLength={2}
                maxLength={32}
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2.5 pe-9 text-white text-sm focus:outline-none transition-colors ${
                  nicknameStatus === 'available' || nicknameStatus === 'same'
                    ? 'border-emerald-500'
                    : nicknameStatus === 'taken'
                    ? 'border-rose-500'
                    : 'border-slate-700 focus:border-slate-500'
                }`}
                autoFocus
              />
              <div className="absolute end-3 top-1/2 -translate-y-1/2">
                {nicknameStatus === 'checking' && <FiLoader size={13} className="text-slate-400 animate-spin" />}
                {nicknameStatus === 'available' && <FiCheck size={13} className="text-emerald-400" />}
                {nicknameStatus === 'same' && <FiCheck size={13} className="text-emerald-400" />}
                {nicknameStatus === 'taken' && <FiX size={13} className="text-rose-400" />}
              </div>
            </div>

            {nicknameStatus === 'available' && input.trim() !== user?.nickname && (
              <p className="text-emerald-400 text-xs flex items-center gap-1"><FiCheck size={10} /> {t('me.available')}</p>
            )}
            {nicknameStatus === 'taken' && (
              <p className="text-rose-400 text-xs flex items-center gap-1"><FiX size={10} /> {availability?.reason || t('me.taken')}</p>
            )}
            {saveError && <p className="text-rose-400 text-xs">{saveError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold"
              >
                {t('me.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || nicknameStatus === 'taken' || nicknameStatus === 'checking' || input.trim().length < 2}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
              >
                {saving ? <FiLoader size={13} className="animate-spin" /> : <><FiCheck size={13} /> {t('me.save')}</>}
              </button>
            </div>
          </div>
        )}

        {saveSuccess && !editing && (
          <p className="text-emerald-400 text-xs flex items-center gap-1"><FiCheck size={10} /> {t('me.updated')}</p>
        )}

        <p className="text-slate-500 text-[10px]">{t('me.hint')}</p>
      </div>

      {/* Language */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiGlobe size={14} className="text-slate-400" />
            <span className="text-slate-300 text-sm font-medium">{t('me.language')}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lng}
              onChange={(e) => {
                changeLanguage(e.target.value)
                setLangSuccess(true)
                setTimeout(() => setLangSuccess(false), 2000)
              }}
              className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
            {langSuccess && <span className="text-emerald-400 text-xs">{t('me.langUpdated')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Profile Page ───────────────────────────────────────────── */
export default function Profile() {
  const { user, plans, loading, refreshUser } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('account')
  const [withdrawCategory, setWithdrawCategory] = useState(null)

  // Handle incoming navigation state
  useEffect(() => {
    if (location.state?.createWithdrawal) {
      setActiveTab('me')
      setWithdrawCategory('withdrawal')
      // Clear the state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} })
    } else if (location.state?.tab) {
      setActiveTab(location.state.tab === 'support' ? 'me' : location.state.tab)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, navigate, location.pathname])

  const clearWithdrawCategory = () => setWithdrawCategory(null)

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      <TopTabs active={activeTab} onChange={setActiveTab} loanBadge={false} />

      {activeTab === 'account' && (
        <AccountTab
          user={user}
          plans={plans}
          loading={loading}
          refreshUser={refreshUser}
          renewState={null}
          onWithdrawTicket={() => { setActiveTab('me'); setWithdrawCategory('withdrawal') }}
        />
      )}

      {activeTab === 'me' && (
        <>
          <MeTab user={user} refreshUser={refreshUser} />
          <SupportTab
            user={user}
            initialCategory={withdrawCategory}
            clearInitialCategory={clearWithdrawCategory}
          />
        </>
      )}

      {activeTab === 'referral' && (
        <ReferralTab />
      )}
    </div>
  )
}
