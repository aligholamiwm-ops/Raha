import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { useLanguage } from '../context/LanguageContext'
import client from '../api/client'
import { formatDateShort } from '../utils/dates'

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

const ChargeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
)

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C9 4 6 9 6 9z" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C15 4 18 9 18 9z" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
)

export default function Referral() {
  const { t } = useTranslation('referral')
  const { user, loading, refreshUser } = useApp()
  const { dir } = useLanguage()
  const [copied, setCopied] = useState(false)
  const [togglingType, setTogglingType] = useState(false)
  const [referrals, setReferrals] = useState(null)
  const [referralsLoading, setReferralsLoading] = useState(false)
  const [charging, setCharging] = useState(false)
  const [totalReferredUsers, setTotalReferredUsers] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  const botUsername = import.meta.env.VITE_BOT_USERNAME?.trim()
  const hasBotUsername = Boolean(botUsername)
  const referralLink = user?.telegram_id && hasBotUsername
    ? `https://t.me/${botUsername}?start=${user.telegram_id}` 
    : '—'

  const benefitType = user?.referral?.benefit_type || 'usdt'
  const isTraffic = benefitType === 'traffic'

  const fetchReferralSummary = () => {
    if (!user) return
    client.get('/api/v1/users/me/referral-summary')
      .then(res => setTotalReferredUsers(res.data.total_referred_users))
      .catch(() => setTotalReferredUsers(0))
  }

  const fetchLeaderboard = () => {
    setLeaderboardLoading(true)
    client.get('/api/v1/users/referral-leaderboard')
      .then(res => setLeaderboard(res.data))
      .catch(() => setLeaderboard([]))
      .finally(() => setLeaderboardLoading(false))
  }

  const fetchReferrals = () => {
    if (!user) return
    setReferralsLoading(true)
    client.get('/api/v1/users/me/referrals')
      .then(res => setReferrals(res.data))
      .catch(() => setReferrals([]))
      .finally(() => setReferralsLoading(false))
  }

  useEffect(() => {
    fetchReferrals()
    fetchReferralSummary()
    fetchLeaderboard()
  }, [user?.telegram_id])

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
    const shareText = t('shareText')
    const shareUrl = `https://t.me/${botUsername}?start=${user.telegram_id}`
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`)
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')
    }
  }

  const handleCharge = async () => {
    if (charging) return
    setCharging(true)
    try {
      await client.post('/api/v1/users/me/charge-referral-bonuses')
      await refreshUser()
      fetchReferrals()
    } catch (err) {
      console.error('Failed to charge referral bonuses', err)
    } finally {
      setCharging(false)
    }
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

  const pendingRecords = (referrals || []).filter(r => !r.charged)
  const totalUsd = pendingRecords.filter(r => r.type === 'usdt').reduce((s, r) => s + r.amount, 0)
  const totalGb = pendingRecords.filter(r => r.type === 'traffic').reduce((s, r) => s + r.amount, 0)
  const hasPending = totalUsd > 0 || totalGb > 0

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('header.title')}</h1>
        <p className="text-slate-400 text-sm">{t('header.subtitle')}</p>
      </div>

      {/* Leaderboard */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-400">
          <TrophyIcon />
          <span className="font-semibold text-sm">{t('leaderboard.title')}</span>
        </div>
        {leaderboardLoading ? (
          <div className="skeleton h-20 w-full rounded-xl" />
        ) : leaderboard.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-4">{t('leaderboard.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-start pb-2 pe-3">{t('leaderboard.rank')}</th>
                  <th className="text-start pb-2 pe-3">{t('leaderboard.user')}</th>
                  <th className="text-end pb-2 pe-3">{t('leaderboard.referred')}</th>
                  <th className="text-end pb-2">{t('leaderboard.bonuses')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {leaderboard.map((entry, i) => (
                  <tr key={entry.telegram_id} className="text-slate-300">
                      <td className="py-2 pe-3">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-slate-400/20 text-slate-300' :
                          i === 2 ? 'bg-amber-700/20 text-amber-600' :
                          'bg-slate-700/60 text-slate-500'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2 pe-3 truncate max-w-[100px]">{entry.username || entry.telegram_id}</td>
                      <td className="py-2 pe-3 text-end font-medium">{entry.referred_count}</td>
                      <td className="py-2 text-end text-[10px] whitespace-nowrap">
                      {entry.total_usdt_bonus > 0 && <span className="text-emerald-400">${entry.total_usdt_bonus.toFixed(2)}</span>}
                      {entry.total_usdt_bonus > 0 && entry.total_traffic_bonus > 0 && <span className="text-slate-600"> | </span>}
                      {entry.total_traffic_bonus > 0 && <span className="text-blue-400">{entry.total_traffic_bonus.toFixed(2)} GB</span>}
                      {entry.total_usdt_bonus === 0 && entry.total_traffic_bonus === 0 && <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referral link card */}
      <div className="bg-gradient-to-br from-emerald-900/60 to-teal-900/60 rounded-2xl ring-1 ring-emerald-700/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <GiftIcon />
          <span className="font-semibold text-sm">{t('link.title')}</span>
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
              {copied ? t('link.copied') : t('link.copy')}
            </button>
          </div>
        )}

        <button
          onClick={handleShare}
          disabled={!user?.telegram_id || !hasBotUsername}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          <ShareIcon />
          {t('link.share')}
        </button>

        {!hasBotUsername && (
          <p className="text-amber-300 text-xs">
            {t('link.unavailable')}
          </p>
        )}
      </div>

      {/* Benefit type toggle */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-slate-300 text-sm font-semibold">{t('rewardType.title')}</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {isTraffic ? t('rewardType.traffic') : t('rewardType.usdt')}
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
                isTraffic
                  ? (dir === 'rtl' ? '-translate-x-8' : 'translate-x-8')
                  : (dir === 'rtl' ? '-translate-x-1' : 'translate-x-1')
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

      {/* Bonus summary */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          {t('summary.usersReferred')} <span className="text-white font-bold">{t('summary.usersReferredCount', { count: totalReferredUsers })}</span>
        </p>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('summary.pendingBonuses')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 text-[10px] mb-1">{t('summary.usdtBonus')}</p>
            {referralsLoading ? (
              <div className="skeleton h-6 w-16" />
            ) : (
              <p className="text-emerald-400 font-bold text-lg">${totalUsd.toFixed(2)}</p>
            )}
          </div>
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 text-[10px] mb-1">{t('summary.trafficBonus')}</p>
            {referralsLoading ? (
              <div className="skeleton h-6 w-16" />
            ) : (
              <p className="text-blue-400 font-bold text-lg">{totalGb.toFixed(2)} GB</p>
            )}
          </div>
        </div>
        <button
          onClick={handleCharge}
          disabled={!hasPending || charging || referralsLoading}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <ChargeIcon />
          {charging ? t('summary.charging') : t('summary.charge')}
        </button>
      </div>

      {/* Referrals table */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        <h3 className="text-slate-300 font-semibold text-sm">{t('yourReferrals.title')}</h3>
        {referralsLoading ? (
          <div className="skeleton h-20 w-full rounded-xl" />
        ) : !referrals || referrals.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-4">{t('yourReferrals.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-start pb-2 pe-3">{t('yourReferrals.user')}</th>
                  <th className="text-start pb-2 pe-3">{t('yourReferrals.layer')}</th>
                  <th className="text-start pb-2 pe-3">{t('yourReferrals.type')}</th>
                  <th className="text-end pb-2 pe-3">{t('yourReferrals.amount')}</th>
                  <th className="text-end pb-2">{t('yourReferrals.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {referrals.map((r, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="py-2 pe-3 truncate max-w-[80px]">{r.username || r.referred_id}</td>
                    <td className="py-2 pe-3">
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-700/60 text-slate-400">
                        L{r.layer ?? 1}
                      </span>
                    </td>
                    <td className="py-2 pe-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${r.type === 'traffic' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {r.type === 'traffic' ? 'GB' : 'USDT'}
                      </span>
                    </td>
                    <td className="py-2 pe-3 text-end font-mono">
                      {r.type === 'traffic' ? `${r.amount.toFixed(2)} GB` : `$${r.amount.toFixed(2)}`}
                    </td>
                    <td className="py-2 text-end text-slate-500">
                      {formatDateShort(r.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
