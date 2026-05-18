import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import client from '../api/client'

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
)

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

const WithdrawIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
)

export default function Referral() {
  const { user, loading, refreshUser } = useApp()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [togglingType, setTogglingType] = useState(false)

  const botUsername = import.meta.env.VITE_BOT_USERNAME?.trim()
  const hasBotUsername = Boolean(botUsername)
  const referralLink = user?.telegram_id && hasBotUsername
    ? `https://t.me/${botUsername}?start=${user.telegram_id}` 
    : '—'

  const benefitType = user?.referral_benefit_type || 'usdt'
  const isTraffic = benefitType === 'traffic'

  const referralBonusUsd = user?.referred_bonus_usd || 0
  const referralBonusGb = user?.referred_bonus_gb || 0

  const handleCopy = async () => {
    if (!user?.telegram_id || !hasBotUsername) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleShare = () => {
    if (!user?.telegram_id || !hasBotUsername) return
    const tg = window.Telegram?.WebApp
    const shareText = `Join Raha VPN and get premium VPN service!`
    const shareUrl = `https://t.me/${botUsername}?start=${user.telegram_id}`
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`)
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  const handleWithdraw = () => {
    navigate('/support', { state: { createWithdrawal: true } })
  }

  const handleToggleBenefitType = async () => {
    if (togglingType) return
    const newType = isTraffic ? 'usdt' : 'traffic'
    setTogglingType(true)
    try {
      await client.put('/api/v1/users/me', { referral_benefit_type: newType })
      await refreshUser()
    } catch (err) {
      console.error('Failed to update benefit type', err)
    } finally {
      setTogglingType(false)
    }
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Referral Program</h1>
        <p className="text-slate-400 text-sm">Earn bonus by inviting friends</p>
      </div>

      {/* Referral link card */}
      <div className="bg-gradient-to-br from-emerald-900/60 to-teal-900/60 rounded-2xl ring-1 ring-emerald-700/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <GiftIcon />
          <span className="font-semibold text-sm">Your Referral Link</span>
        </div>

        {loading ? (
          <div className="skeleton h-14 w-full rounded-xl" />
        ) : (
          <div className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-4 py-3">
            <span className="flex-1 text-white font-mono text-xs break-all">
              {referralLink}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors flex-shrink-0"
            >
              <CopyIcon />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        <button
          onClick={handleShare}
          disabled={!user?.telegram_id || !hasBotUsername}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          <ShareIcon />
          Share with Friends
        </button>

        {!hasBotUsername && (
          <p className="text-amber-300 text-xs">
            Referral sharing is unavailable because this app is not fully configured. Please contact support.
          </p>
        )}
      </div>

      {/* Benefit type toggle */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-slate-300 text-sm font-semibold">Reward Type</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {isTraffic ? 'Earn bonus as GB traffic' : 'Earn bonus as USDT wallet balance'}
            </p>
          </div>
          <button
            onClick={handleToggleBenefitType}
            disabled={togglingType || loading}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
              isTraffic ? 'bg-blue-500' : 'bg-emerald-500'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                isTraffic ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <span className={`text-xs px-2 py-1 rounded-full border ${!isTraffic ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-700/50 text-slate-500 border-slate-600/30'}`}>
            💵 USDT
          </span>
          <span className={`text-xs px-2 py-1 rounded-full border ${isTraffic ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-slate-700/50 text-slate-500 border-slate-600/30'}`}>
            📶 Traffic (GB)
          </span>
        </div>
      </div>

      {/* Bonus display */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Your Referral Bonuses</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 text-[10px] mb-1">USDT Bonus</p>
            {loading ? (
              <div className="skeleton h-6 w-16" />
            ) : (
              <p className="text-emerald-400 font-bold text-lg">${referralBonusUsd.toFixed(2)}</p>
            )}
          </div>
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 text-[10px] mb-1">Traffic Bonus</p>
            {loading ? (
              <div className="skeleton h-6 w-16" />
            ) : (
              <p className="text-blue-400 font-bold text-lg">{referralBonusGb.toFixed(2)} GB</p>
            )}
          </div>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={referralBonusUsd <= 0}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <WithdrawIcon />
          Withdraw USDT Bonus
        </button>
      </div>

      {/* How it works */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <h3 className="text-slate-300 font-semibold text-sm">How It Works</h3>
        <div className="space-y-2">
          {[
            { step: '1', text: 'Share your referral link with friends' },
            { step: '2', text: 'Friends start the bot using your link (automatic assignment)' },
            { step: '3', text: 'Earn bonus USDT or GB traffic when they purchase plans' },
            { step: '4', text: 'Toggle above to choose whether you receive USDT or GB traffic rewards' },
            { step: '5', text: 'Withdraw USDT bonus via support ticket (provide USDT wallet & network)' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {step}
              </span>
              <p className="text-slate-400 text-xs">{step === '4' ? <span className="text-blue-400">{text}</span> : text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
