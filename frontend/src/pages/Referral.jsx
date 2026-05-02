import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

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

export default function Referral() {
  const { user, loading } = useApp()
  const [copied, setCopied] = useState(false)

  const referralCode = user?.telegram_id ? String(user.telegram_id) : '—'
  const referredGB = user?.total_referred_gb_purchased || 0
  const giftedGB = referredGB * 0.1

  const handleCopy = async () => {
    if (!user?.telegram_id) return
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleShare = () => {
    const tg = window.Telegram?.WebApp
    const shareText = `Join Raha VPN and get premium VPN service! Use my referral code: ${referralCode}`
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/RahaVPN&text=${encodeURIComponent(shareText)}`)
    } else {
      window.open(`https://t.me/share/url?url=https://t.me/RahaVPN&text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Referral Program</h1>
        <p className="text-slate-400 text-sm">Earn bonus traffic by inviting friends</p>
      </div>

      {/* Referral code card */}
      <div className="bg-gradient-to-br from-emerald-900/60 to-teal-900/60 rounded-2xl ring-1 ring-emerald-700/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <GiftIcon />
          <span className="font-semibold text-sm">Your Referral Code</span>
        </div>

        {loading ? (
          <div className="skeleton h-14 w-full rounded-xl" />
        ) : (
          <div className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-4 py-3">
            <span className="flex-1 text-white font-mono font-bold text-2xl tracking-widest">
              {referralCode}
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
          disabled={!user?.telegram_id}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          <ShareIcon />
          Share with Friends
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 px-4 py-3">
        <p className="text-slate-300 text-xs leading-relaxed text-center">
          🎁 Share your code with friends to earn <span className="text-emerald-400 font-semibold">10%</span> of their purchased GB as bonus traffic
        </p>
      </div>

      {/* Stats cards */}
      <div className="space-y-3">
        <h2 className="text-slate-300 font-semibold text-sm">Your Stats</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-1">
            <p className="text-slate-400 text-xs">Referred Users</p>
            {loading ? (
              <div className="skeleton h-7 w-16" />
            ) : (
              <p className="text-white font-bold text-2xl">N/A</p>
            )}
            <p className="text-slate-500 text-xs">Not tracked</p>
          </div>

          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-1">
            <p className="text-slate-400 text-xs">GB Purchased</p>
            {loading ? (
              <div className="skeleton h-7 w-16" />
            ) : (
              <p className="text-emerald-400 font-bold text-2xl">{referredGB.toFixed(1)}</p>
            )}
            <p className="text-slate-500 text-xs">by referrals</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-slate-400 text-xs">Gifted Traffic (10%)</p>
              {loading ? (
                <div className="skeleton h-8 w-24" />
              ) : (
                <p className="text-emerald-400 font-bold text-3xl">
                  {giftedGB.toFixed(2)} <span className="text-lg font-medium">GB</span>
                </p>
              )}
            </div>
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
              <GiftIcon />
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
              style={{ width: referredGB > 0 ? `${Math.min((giftedGB / referredGB) * 100, 100)}%` : '0%' }}
            />
          </div>
          <p className="text-slate-500 text-xs mt-1">
            {referredGB > 0 ? `${giftedGB.toFixed(2)} GB of ${referredGB.toFixed(1)} GB total` : 'No referral purchases yet'}
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <h3 className="text-slate-300 font-semibold text-sm">How It Works</h3>
        <div className="space-y-2">
          {[
            { step: '1', text: 'Share your referral code with friends' },
            { step: '2', text: 'Friends use your code when signing up' },
            { step: '3', text: 'Earn 10% of their purchased GB as bonus' },
            { step: '4', text: 'Use bonus traffic across your configs' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {step}
              </span>
              <p className="text-slate-400 text-xs">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
