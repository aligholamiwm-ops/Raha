import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createInvoice, createDepositInvoice, getMyLoans, payLoan, validateDiscount } from '../api/client'
import {
  FiShoppingCart, FiArrowUp, FiArrowDown, FiCreditCard,
  FiCheck, FiLoader, FiChevronRight, FiAlertCircle, FiInfo,
  FiPackage, FiTag, FiX
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

/* ─── plan colour by traffic volume ──────────────────────────────── */
function planColor(trafficGb) {
  const gb = trafficGb || 0
  if (gb <= 10)  return '#34d399'
  if (gb <= 30)  return '#60a5fa'
  if (gb <= 60)  return '#818cf8'
  if (gb <= 120) return '#c084fc'
  if (gb <= 200) return '#f472b6'
  return '#f87171'
}

/* ─── flat 2D square (area ∝ traffic volume) ─────────────────────── */
function FlatSquare({ side, color }) {
  return (
    <div
      style={{
        width: side,
        height: side,
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

/* ─── grid layout constants ──────────────────────────────────────── */
const COL_W    = 108  // px – fixed width per plan column
const MAX_SIDE = 96   // px – square side for the largest plan
const SQ_ROW_H = MAX_SIDE + 28  // fixed height for the square row

/* ─── sub-components ──────────────────────────────────────────── */
function BalanceCard({ walletUsd, trafficGb, unpaidLoan }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 border border-emerald-700/40 rounded-2xl p-4">
        <p className="text-xs text-emerald-400 font-medium mb-1">Wallet Balance</p>
        <p className="text-xl font-bold text-white">${(walletUsd || 0).toFixed(2)}</p>
        <p className="text-[10px] text-emerald-500 mt-0.5">USDT</p>
      </div>
      <div className="bg-gradient-to-br from-blue-900/60 to-blue-800/40 border border-blue-700/40 rounded-2xl p-4">
        <p className="text-xs text-blue-400 font-medium mb-1">Traffic Balance</p>
        <p className="text-xl font-bold text-white">{(trafficGb || 0).toFixed(2)}</p>
        <p className="text-[10px] text-blue-500 mt-0.5">GB available</p>
      </div>
      {unpaidLoan > 0 && (
        <div className="col-span-2 bg-rose-900/30 border border-rose-700/40 rounded-2xl p-3 flex items-center gap-3">
          <FiAlertCircle className="text-rose-400 flex-shrink-0" size={18} />
          <div>
            <p className="text-xs font-bold text-rose-400">Outstanding Loan</p>
            <p className="text-sm font-bold text-white">${unpaidLoan.toFixed(2)} USDT unpaid</p>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBar({ active, onChange, hasLoanBadge }) {
  const tabs = [
    { id: 'plans', label: 'Plans', icon: FiShoppingCart },
    { id: 'deposit', label: 'Deposit', icon: FiArrowUp },
    { id: 'withdrawal', label: 'Withdraw', icon: FiArrowDown },
    { id: 'loans', label: 'Loans', icon: FiCreditCard, badge: hasLoanBadge },
  ]
  return (
    <div className="flex gap-1 bg-slate-800/80 border border-slate-700 rounded-2xl p-1.5">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-semibold transition-all ${
            active === tab.id
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          <tab.icon size={16} />
          {tab.label}
          {tab.badge && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
          )}
        </button>
      ))}
    </div>
  )
}

/* ─── plans grid – 5 strictly aligned rows across all plans ──────── */
function PlansGrid({ plans, maxTrafficGb, onBuy, buying }) {
  const sorted = [...plans].sort((a, b) => (a.traffic_gb || 0) - (b.traffic_gb || 0))
  const n   = sorted.length
  const max = maxTrafficGb || 1

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px', width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, ${COL_W}px)`,
          gridTemplateRows: `auto ${SQ_ROW_H}px auto auto auto`,
          columnGap: '8px',
          rowGap: 0,
          width: `${n * COL_W + (n - 1) * 8}px`,
          minWidth: '100%',
        }}
      >
        {sorted.map((plan, i) => {
          const gb   = plan.traffic_gb || 0
          const side = Math.max(18, Math.round(MAX_SIDE * Math.sqrt(gb) / Math.sqrt(max)))
          const color = planColor(gb)
          const col  = i + 1
          const busy = buying === plan.plan_name

          return (
            <React.Fragment key={plan.plan_name}>

              {/* Row 1 – Plan name */}
              <div style={{ gridColumn: col, gridRow: 1, textAlign: 'center', paddingBottom: '14px' }}>
                <span className="text-white font-semibold tracking-wide" style={{ fontSize: '11px', lineHeight: 1.3 }}>
                  {parseDuration(plan.plan_name)}
                </span>
              </div>

              {/* Row 2 – Flat 2D square (proportional area) */}
              <div
                style={{
                  gridColumn: col,
                  gridRow: 2,
                  height: SQ_ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FlatSquare side={side} color={color} />
              </div>

              {/* Row 3 – Traffic volume */}
              <div style={{ gridColumn: col, gridRow: 3, textAlign: 'center', paddingTop: '12px', paddingBottom: '4px' }}>
                <span className="font-bold whitespace-nowrap" style={{ fontSize: '11px', color }}>
                  {gb}&nbsp;GB
                </span>
              </div>

              {/* Row 4 – Price */}
              <div style={{ gridColumn: col, gridRow: 4, textAlign: 'center', paddingBottom: '10px' }}>
                <span className="text-white font-black whitespace-nowrap" style={{ fontSize: '13px' }}>
                  ${(plan.price_usd || 0).toFixed(2)}
                </span>
              </div>

              {/* Row 5 – Buy button (uniform size across all plans) */}
              <div style={{ gridColumn: col, gridRow: 5, display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => onBuy(plan)}
                  disabled={busy}
                  style={{ width: '72px', height: '30px' }}
                  className={`rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${
                    busy
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white'
                  }`}
                >
                  {busy ? <FiLoader size={9} className="animate-spin" /> : 'Buy'}
                </button>
              </div>

            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function BuyConfirmModal({ plan, walletBalance, onConfirm, onCancel, buying }) {
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
      setDiscountError(e?.response?.data?.detail || 'Invalid discount code')
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center px-4 pt-4 pb-24 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-white font-bold text-base">Confirm Purchase</h3>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-700 text-slate-400 transition-colors">
            <FiX size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Plan summary */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">Plan</span>
              <span className="text-white font-bold text-sm">{parseDuration(plan.plan_name)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">Traffic</span>
              <span className="text-emerald-400 font-bold text-sm">{plan.traffic_gb} GB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs">Base Price</span>
              <span className="text-white text-sm">${basePrice.toFixed(2)}</span>
            </div>
            {appliedDiscount && (
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-xs flex items-center gap-1"><FiTag size={10} /> Discount ({discountPct}%)</span>
                <span className="text-sm font-bold">−${(basePrice - finalPrice).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
              <span className="text-slate-300 text-xs font-medium">You Pay</span>
              <span className="text-white font-black text-base">${finalPrice.toFixed(2)} <span className="text-slate-400 text-xs font-normal">USDT</span></span>
            </div>
          </div>

          {/* Discount code */}
          {!appliedDiscount ? (
            <div>
              <p className="text-xs text-slate-400 mb-2">Have a discount code?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter code"
                  value={discountCode}
                  onChange={e => { setDiscountCode(e.target.value); setDiscountError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={!discountCode.trim() || validating}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  {validating ? <FiLoader size={14} className="animate-spin" /> : 'Apply'}
                </button>
              </div>
              {discountError && (
                <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
                  <FiAlertCircle size={11} /> {discountError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FiTag className="text-emerald-400" size={14} />
                <div>
                  <span className="text-emerald-400 font-bold text-sm">{appliedDiscount.code}</span>
                  <span className="text-emerald-300 text-xs ml-1.5">({discountPct}% off)</span>
                </div>
              </div>
              <button onClick={handleRemoveDiscount} className="text-slate-400 hover:text-rose-400 transition-colors">
                <FiX size={14} />
              </button>
            </div>
          )}

          {/* Wallet balance note */}
          {!canAfford && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
              <FiInfo size={12} />
              Insufficient wallet balance — will redirect to crypto payment
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(plan, appliedDiscount?.code || null)}
              disabled={buying === plan.plan_name}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                buying === plan.plan_name
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25'
              }`}
            >
              {buying === plan.plan_name ? (
                <><FiLoader size={13} className="animate-spin" /> Processing…</>
              ) : (
                <><FiCheck size={13} /> Confirm</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEPOSIT_PRESETS = [5, 10, 20, 50]

function DepositTab({ onDeposit, buying }) {
  const [amount, setAmount] = useState('')

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <FiArrowUp className="text-emerald-400" size={16} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">Deposit USDT</h3>
            <p className="text-slate-400 text-xs">Add funds to your wallet</p>
          </div>
        </div>

        {/* Quick amounts */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Quick amounts</p>
          <div className="grid grid-cols-4 gap-2">
            {DEPOSIT_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  amount === String(p)
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-500/50'
                }`}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Custom amount</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-7 pr-3 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                min={1}
              />
            </div>
            <button
              onClick={() => {
                const a = parseFloat(amount)
                if (a > 0) onDeposit(a)
              }}
              disabled={!amount || parseFloat(amount) <= 0 || !!buying}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-5 rounded-xl transition-colors"
            >
              {buying ? <FiLoader size={16} className="animate-spin" /> : 'Deposit'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
        <FiInfo className="text-blue-400 flex-shrink-0 mt-0.5" size={14} />
        <p className="text-xs text-blue-300">
          Payments are processed securely in USDT via Plisio. Balance updates automatically after confirmation.
        </p>
      </div>
    </div>
  )
}

function WithdrawalTab({ onNavigate }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <FiArrowDown className="text-amber-400" size={28} />
        </div>
        <div>
          <h3 className="text-white font-bold text-base mb-2">Withdraw Balance</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            To withdraw your balance, submit a support ticket with the withdrawal category.
            Include your USDT wallet address and network.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {['TRC20', 'BEP-20', 'TON'].map(net => (
            <div key={net} className="bg-slate-900 border border-slate-700 rounded-xl py-2 text-slate-300 font-medium">
              {net}
            </div>
          ))}
        </div>
        <button
          onClick={onNavigate}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition-colors"
        >
          <FiChevronRight size={16} />
          Create Withdrawal Ticket
        </button>
      </div>
    </div>
  )
}

function LoansTab({ loans, loansLoading, onPayLoan, payingLoan }) {
  const unpaid = loans.filter(l => l.status === 'unpaid')
  const settled = loans.filter(l => l.status === 'settled')
  const totalUnpaid = unpaid.reduce((s, l) => s + (l.amount_usdt || 0), 0)

  if (loansLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (loans.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <FiCheck className="text-emerald-400" size={20} />
        </div>
        <p className="text-white font-semibold text-sm">No Loans</p>
        <p className="text-slate-400 text-xs mt-1">You have no outstanding loans</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {totalUnpaid > 0 && (
        <div className="bg-rose-900/30 border border-rose-700/40 rounded-2xl p-4 flex items-center gap-3">
          <FiAlertCircle className="text-rose-400 flex-shrink-0" size={20} />
          <div>
            <p className="text-xs text-rose-400 font-medium">Outstanding Balance</p>
            <p className="text-lg font-bold text-white">${totalUnpaid.toFixed(2)} USDT</p>
          </div>
        </div>
      )}

      {unpaid.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Unpaid ({unpaid.length})</p>
          <div className="space-y-2">
            {unpaid.map(loan => (
              <div key={loan.loan_id} className="bg-rose-900/20 border border-rose-700/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white font-bold text-sm">${loan.amount_usdt?.toFixed(2)} USDT</p>
                    <p className="text-[10px] text-slate-500">{new Date(loan.created_at).toLocaleDateString()}{loan.note && ` · ${loan.note}`}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    Unpaid
                  </span>
                </div>
                <button
                  onClick={() => onPayLoan(loan)}
                  disabled={payingLoan === loan.loan_id}
                  className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
                >
                  {payingLoan === loan.loan_id ? (
                    <><FiLoader size={12} className="animate-spin" /> Processing…</>
                  ) : (
                    <><FiCreditCard size={12} /> Pay Now</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {settled.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Settled ({settled.length})</p>
          <div className="space-y-2">
            {settled.map(loan => (
              <div key={loan.loan_id} className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">${loan.amount_usdt?.toFixed(2)} USDT</p>
                  <p className="text-[10px] text-slate-500">{new Date(loan.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓ Settled
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
  const { user, plans, loading, refreshUser } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const renewState = location.state

  const [activeTab, setActiveTab] = useState(renewState?.renewUuid ? 'plans' : 'plans')
  const [buyingPlan, setBuyingPlan] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loans, setLoans] = useState([])
  const [loansLoading, setLoansLoading] = useState(false)
  const [payingLoan, setPayingLoan] = useState(null)
  const [confirmPlan, setConfirmPlan] = useState(null)

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
        setSuccess('Payment link opened. Complete the payment to settle your loan.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create payment. Please try again.')
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
        setSuccess(`Plan "${plan.plan_name}" purchased! +${result.traffic_gb_added} GB added to your balance.`)
        await refreshUser()
      } else {
        const url = result?.invoice_url || result?.url || result
        if (url && typeof url === 'string') {
          const tg = window.Telegram?.WebApp
          tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')
          setSuccess('Invoice created! Complete payment in the opened window.')
        } else {
          setSuccess('Invoice created successfully!')
        }
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to process request. Please try again.')
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
        setSuccess('Invoice created! Complete payment in the opened window.')
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create deposit invoice.')
    } finally { setBuyingPlan(null) }
  }

  return (
    <div className="px-4 py-5 space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">
          {renewState?.renewUuid ? 'Renew Config' : 'Store'}
        </h1>
        <p className="text-slate-400 text-sm">
          {renewState?.serverName ? `Renewing: ${renewState.serverName}` : 'Manage balance & plans'}
        </p>
      </div>

      {/* Balance Cards */}
      <BalanceCard
        walletUsd={user?.wallet_balance_usd}
        trafficGb={user?.traffic_balance_gb}
        unpaidLoan={totalUnpaidLoan}
      />

      {/* Notifications */}
      {error && (
        <div className="flex items-start gap-3 bg-rose-900/30 border border-rose-700/40 rounded-2xl px-4 py-3 animate-in slide-in-from-top-2 duration-300">
          <FiAlertCircle className="text-rose-400 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-rose-300 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-emerald-900/30 border border-emerald-700/40 rounded-2xl px-4 py-3 animate-in slide-in-from-top-2 duration-300">
          <FiCheck className="text-emerald-400 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-emerald-300 text-sm">{success}</p>
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
        <div className="flex flex-col items-center gap-5 min-h-[45vh] justify-center">
          {/* Section header – centred */}
          <div className="flex items-center gap-2 self-center">
            <FiShoppingCart className="text-emerald-400" size={16} />
            <h2 className="text-slate-200 font-bold text-sm">
              {renewState?.renewUuid ? 'Select Plan to Renew' : 'Available Plans'}
            </h2>
          </div>

          {loading ? (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ width: '100%' }}>
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
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
              <FiPackage className="text-slate-500 mx-auto mb-2" size={28} />
              <p className="text-slate-400 text-sm">No plans available</p>
            </div>
          ) : (
            <PlansGrid
              plans={plans}
              maxTrafficGb={maxTrafficGb}
              onBuy={handleBuy}
              buying={buyingPlan}
            />
          )}

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3 flex items-start gap-3 self-stretch">
            <FiInfo className="text-slate-500 flex-shrink-0 mt-0.5" size={13} />
            <p className="text-slate-500 text-xs">
              Plans with sufficient wallet balance are purchased instantly. Others redirect to crypto payment.
            </p>
          </div>
        </div>
      )}

      {/* Deposit Tab */}
      {!renewState?.renewUuid && activeTab === 'deposit' && (
        <DepositTab onDeposit={handleDeposit} buying={buyingPlan} />
      )}

      {/* Withdrawal Tab */}
      {!renewState?.renewUuid && activeTab === 'withdrawal' && (
        <WithdrawalTab onNavigate={() => navigate('/support', { state: { createWithdrawal: true } })} />
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
