import React, { useState } from 'react'
import QRModal from './QRModal'

function bytesToGB(bytes) {
  if (!bytes || bytes === 0) return 0
  return bytes / (1024 * 1024 * 1024)
}

function daysLeft(expiryDate) {
  if (!expiryDate) return null
  const now = new Date()
  const exp = new Date(expiryDate)
  const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
  return diff
}

function formatDaysLeft(expiryDate) {
  const d = daysLeft(expiryDate)
  if (d === null) return '—'
  if (d < 0) return 'Expired'
  if (d === 0) return 'Expires today'
  return `${d}d left`
}

const QrIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="5" height="5" /><rect x="16" y="3" width="5" height="5" />
    <rect x="3" y="16" width="5" height="5" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" /><line x1="21" y1="21" x2="21" y2="21" />
    <path d="M15 21h-3v-3" /><path d="M13 16v-3h3" />
  </svg>
)

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export default function ConfigCard({ config, onCharge, onRenew }) {
  const [showQR, setShowQR] = useState(false)

  const usedGB = bytesToGB(config.usage_up + config.usage_down)
  const totalGB = config.total_gb || 0
  const usagePct = totalGB > 0 ? Math.min((usedGB / totalGB) * 100, 100) : 0
  const isActive = config.status === 'active'
  const days = daysLeft(config.expiry_date)
  const daysText = formatDaysLeft(config.expiry_date)
  const isExpiringSoon = days !== null && days >= 0 && days <= 3

  return (
    <>
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm truncate">
                {config.server_name || config.email || 'Config'}
              </span>
              {config.is_online && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/50" title="Online" />
              )}
            </div>
            <p className="text-slate-400 text-xs truncate mt-0.5">{config.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isActive ? 'Active' : 'Expired'}
            </span>
          </div>
        </div>

        {/* Usage bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{usedGB.toFixed(2)} GB used</span>
            <span>{totalGB} GB total</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>

        {/* Expiry */}
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${isExpiringSoon ? 'text-yellow-400' : 'text-slate-400'}`}>
            ⏱ {daysText}
          </span>
          {config.domain_name && (
            <span className="text-slate-500 truncate max-w-[140px]">{config.domain_name}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setShowQR(true)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <QrIcon />
            QR Code
          </button>
          <button
            onClick={() => onRenew && onRenew(config)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <RefreshIcon />
            Renew
          </button>
          <button
            onClick={() => onCharge && onCharge(config)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <PlusIcon />
            Charge
          </button>
        </div>
      </div>

      {showQR && (
        <QRModal
          uuid={config.uuid}
          configName={config.server_name || config.email}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  )
}
