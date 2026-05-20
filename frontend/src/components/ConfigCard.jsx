import React, { useState } from 'react'
import { 
  FiCopy, FiEdit2, FiTrash2, FiRotateCcw, 
  FiToggleLeft, FiToggleRight, FiLoader, FiClock, FiActivity 
} from 'react-icons/fi'
import { MdQrCode } from 'react-icons/md'
import { toggleConfig, editConfig, regenerateConfigKey, deleteConfig } from '../api/client'
import QRModal from './QRModal'

function daysLeft(dateStr) {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const now = new Date()
  const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
  return diff
}

export default function ConfigCard({ config, onUpdate, onCharge, onRefresh }) {
  const [showQR, setShowQR] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editForm, setEditForm] = useState({
    name: config.name || '',
    total_gb: config.total_gb || 0,
    duration_days: 0
  })

  const usedGb = (config.usage_up + config.usage_down) / (1024 ** 3)
  const usagePercent = config.total_gb > 0 ? Math.min(100, (usedGb / config.total_gb) * 100) : 0
  const isEnabled = config.enable

  // Upload / Download bars
  const uploadGb = config.usage_up / (1024 ** 3)
  const downloadGb = config.usage_down / (1024 ** 3)
  const uploadPct = config.total_gb > 0 ? Math.min(100, (uploadGb / config.total_gb) * 100) : 0
  const downloadPct = config.total_gb > 0 ? Math.min(100, (downloadGb / config.total_gb) * 100) : 0

  const expiryDays = daysLeft(config.expiry_date)

  const refreshAfterAction = async () => {
    if (onRefresh) await onRefresh()
    else if (onUpdate) onUpdate()
  }

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await toggleConfig(config.email)
      await refreshAfterAction()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await editConfig(config.email, editForm)
      setShowEdit(false)
      await refreshAfterAction()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update config')
    } finally {
      setBusy(false)
    }
  }

  const handleRegenerateKey = async () => {
    if (!window.confirm('Are you sure you want to regenerate the UUID key? The old one will stop working immediately.')) return
    setBusy(true)
    try {
      await regenerateConfigKey(config.email)
      await refreshAfterAction()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this config? Unused traffic will be refunded to your balance.')) return
    setBusy(true)
    try {
      await deleteConfig(config.email)
      await refreshAfterAction()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  // Bar color based on usage
  const barColor = usagePercent > 85 ? 'bg-red-500' : usagePercent > 60 ? 'bg-amber-500' : config.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500'

  return (
    <>
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 relative overflow-hidden">
        {/* Status Badge & Toggle */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            config.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            config.status === 'expired' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
            'bg-slate-500/10 text-slate-400 border border-slate-500/20'
          }`}>
            {config.status}
          </span>
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`transition-colors ${isEnabled ? 'text-emerald-500' : 'text-slate-500'}`}
            title={isEnabled ? 'Disable' : 'Enable'}
          >
            {busy ? <FiLoader className="animate-spin" size={20} /> : isEnabled ? <FiToggleRight size={24} /> : <FiToggleLeft size={24} />}
          </button>
        </div>

        {/* Header */}
        <div className="mb-3">
          <h3 className="text-white font-bold text-lg truncate pr-20">{config.name || 'Unnamed Config'}</h3>
          <p className="text-slate-500 text-[10px] font-mono truncate">{config.server_name}</p>
        </div>

        {/* Traffic Usage Section - Linear bars only */}
        <div className="space-y-2 mb-4">
          {/* Total usage bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span className="font-medium">Total Usage</span>
              <span>{usedGb.toFixed(2)} / {config.total_gb.toFixed(1)} GB ({Math.round(usagePercent)}%)</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          {/* Upload bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>↑ Upload</span>
              <span>{uploadGb.toFixed(2)} GB</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>

          {/* Download bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>↓ Download</span>
              <span>{downloadGb.toFixed(2)} GB</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${downloadPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Expiry info */}
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-4">
          <FiClock size={10} />
          {config.expiry_date ? (
            expiryDays !== null && expiryDays > 0 ? (
              <span className={expiryDays <= 3 ? 'text-amber-400 font-semibold' : ''}>
                {expiryDays} day{expiryDays !== 1 ? 's' : ''} remaining
              </span>
            ) : expiryDays !== null && expiryDays <= 0 ? (
              <span className="text-red-400 font-semibold">Expired</span>
            ) : (
              <span>Expires: {new Date(config.expiry_date).toLocaleDateString()}</span>
            )
          ) : (
            <span>No expiry</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQR(true)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium py-2.5 rounded-xl transition-colors"
          >
            <MdQrCode size={14} />
            <span>QR / Sub</span>
          </button>
          <button
            onClick={() => { setEditForm({ name: config.name || '', total_gb: config.total_gb || 0, duration_days: 0 }); setShowEdit(true); }}
            className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-200 p-2.5 rounded-xl transition-colors"
            title="Edit"
          >
            <FiEdit2 size={16} />
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 p-2.5 rounded-xl transition-colors"
            title="Delete"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowEdit(false)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Edit Config</h3>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            {error && <div className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2 mb-4 border border-rose-500/20">{error}</div>}
            <form onSubmit={handleEdit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Config Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Total Traffic (GB)</label>
                <input
                  type="number"
                  value={editForm.total_gb}
                  onChange={e => setEditForm({...editForm, total_gb: parseFloat(e.target.value) || 0})}
                  min={0.1}
                  step="any"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Duration (days)
                  <span className="text-slate-500 font-normal ml-1">— 0 = unlimited, or set new days from now</span>
                </label>
                <input
                  type="number"
                  value={editForm.duration_days}
                  onChange={e => setEditForm({...editForm, duration_days: parseInt(e.target.value) || 0})}
                  min={0}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Leave 0 to keep current expiry"
                />
                {config.expiry_date && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Current expiry: {new Date(config.expiry_date).toLocaleDateString()}
                    {expiryDays !== null && ` (${expiryDays > 0 ? expiryDays + ' days left' : 'expired'})`}
                  </p>
                )}
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRegenerateKey}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-medium py-2.5 rounded-xl border border-slate-700 transition-colors mb-4"
                >
                  <FiRotateCcw size={14} />
                  Regenerate UUID Key
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
                >
                  {busy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQR && (
        <QRModal
          uuid={config.uuid}
          email={config.email}
          configName={config.name || config.email}
          subscriptionLink={config.subscription_link || ''}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  )
}
