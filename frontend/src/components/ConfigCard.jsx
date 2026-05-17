import React, { useState } from 'react'
import QRModal from './QRModal'
import { toggleConfig, editConfig, regenerateConfigKey, deleteConfig } from '../api/client'
import { FiEdit2, FiRotateCcw, FiTrash2, FiToggleLeft, FiToggleRight, FiLoader } from 'react-icons/fi'

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
  if (d === null) return '∞ Unlimited'
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

export default function ConfigCard({ config: initialConfig, onCharge, onRefresh }) {
  const [config, setConfig] = useState(initialConfig)
  const [showQR, setShowQR] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ name: config.name || '', total_gb: config.total_gb || 0, duration_days: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const usedGB = bytesToGB(config.usage_up + config.usage_down)
  const totalGB = config.total_gb || 0
  const usagePct = totalGB > 0 ? Math.min((usedGB / totalGB) * 100, 100) : 0
  const isEnabled = config.enable !== false
  const isActive = config.status === 'active'
  const isExpired = config.status === 'expired'
  const days = daysLeft(config.expiry_date)
  const daysText = formatDaysLeft(config.expiry_date)
  const isExpiringSoon = days !== null && days >= 0 && days <= 3

  const wrap = (fn) => async (...args) => {
    setBusy(true)
    setError(null)
    try { await fn(...args) } catch (e) { setError(e.response?.data?.detail || e.message || 'Error') }
    setBusy(false)
  }

  const handleToggle = wrap(async () => {
    const updated = await toggleConfig(config.email)
    setConfig(updated)
  })

  const handleEdit = wrap(async (e) => {
    e.preventDefault()
    const updated = await editConfig(config.email, { ...editForm, name: editForm.name.trim() })
    setConfig(updated)
    setShowEdit(false)
    if (onRefresh) onRefresh()
  })

  const handleRegenerateKey = wrap(async () => {
    if (!window.confirm('Regenerate the UUID key? Your existing connection will be reset.')) return
    const updated = await regenerateConfigKey(config.email)
    setConfig(updated)
    if (onRefresh) onRefresh()
  })

  const handleDelete = wrap(async () => {
    if (!window.confirm('Delete this config? Unused traffic will be refunded.')) return
    await deleteConfig(config.email)
    if (onRefresh) onRefresh()
  })

  const statusLabel = isEnabled ? (isActive ? 'Active' : isExpired ? 'Expired' : 'Active') : 'Disabled'
  const statusClass = isEnabled && isActive
    ? 'bg-emerald-500/20 text-emerald-400'
    : isEnabled && isExpired
    ? 'bg-amber-500/20 text-amber-400'
    : 'bg-slate-600/40 text-slate-400'

  return (
    <>
      <div className={`bg-slate-800 rounded-xl ring-1 p-4 space-y-3 transition-opacity ${isEnabled ? 'ring-slate-700' : 'ring-slate-700/50 opacity-70'}`}>
        {/* Error */}
        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm truncate">
                {config.name || config.server_name || 'Config'}
              </span>
              {/* Online indicator (enable status) */}
              <span
                className={`flex-shrink-0 w-2 h-2 rounded-full ${isEnabled && isActive ? 'bg-emerald-400 shadow shadow-emerald-400/50' : 'bg-slate-600'}`}
                title={isEnabled ? 'Enabled' : 'Disabled'}
              />
            </div>
            <p className="text-slate-400 text-xs truncate mt-0.5">{config.email}</p>
            <p className="text-slate-500 text-[10px] truncate">{config.server_name}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
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
              className={`h-full rounded-full transition-all ${usagePct > 90 ? 'bg-rose-500' : usagePct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>

        {/* Expiry */}
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${isExpiringSoon ? 'text-amber-400' : 'text-slate-400'}`}>
            ⏱ {daysText}
          </span>
          {config.domain_name && (
            <span className="text-slate-500 truncate max-w-[140px]">{config.domain_name}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {/* QR Code */}
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            title="QR Code / Copy config"
          >
            <QrIcon />
          </button>

          {/* Toggle enable/disable */}
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg transition-colors ${isEnabled ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
            title={isEnabled ? 'Disable config' : 'Enable config'}
          >
            {busy ? <FiLoader size={14} className="animate-spin" /> : isEnabled ? <FiToggleRight size={14} /> : <FiToggleLeft size={14} />}
          </button>

          {/* Edit */}
          <button
            onClick={() => { setEditForm({ name: config.name || '', total_gb: config.total_gb || 0, duration_days: 0 }); setShowEdit(true); }}
            className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            title="Edit config"
          >
            <FiEdit2 size={14} />
          </button>

          {/* Regenerate Key */}
          <button
            onClick={handleRegenerateKey}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-amber-400 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            title="Regenerate UUID key"
          >
            <FiRotateCcw size={14} />
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            title="Delete config"
          >
            <FiTrash2 size={14} />
          </button>

          {/* Charge / top up */}
          {onCharge && (
            <button
              onClick={() => onCharge(config)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
            >
              Buy Plan
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowEdit(false) }}>
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl p-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Edit Config</h3>
              <button onClick={() => setShowEdit(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 text-xl">&times;</button>
            </div>
            {error && <div className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2 mb-3">{error}</div>}
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name (no hyphens)</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  maxLength={32}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Total Traffic (GB)</label>
                <input
                  type="number"
                  value={editForm.total_gb}
                  onChange={e => setEditForm({...editForm, total_gb: parseFloat(e.target.value) || 0})}
                  min={0.1}
                  step={0.5}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Duration (days from now, 0 = unlimited)</label>
                <input
                  type="number"
                  value={editForm.duration_days}
                  onChange={e => setEditForm({...editForm, duration_days: parseInt(e.target.value) || 0})}
                  min={0}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQR && (
        <QRModal
          uuid={config.uuid}
          email={config.email}
          configName={config.name || config.server_name || config.email}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  )
}
