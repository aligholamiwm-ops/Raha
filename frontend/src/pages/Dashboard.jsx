import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfigCard from '../components/ConfigCard'
import { createConfig } from '../api/client'
import { FiPlus, FiX, FiRefreshCw, FiSearch } from 'react-icons/fi'

function bytesToGB(bytes) {
  if (!bytes || bytes === 0) return 0
  return bytes / (1024 * 1024 * 1024)
}

function daysLeft(dateStr) {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const now = new Date()
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
}

function SkeletonCard() {
  return (
    <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-2 w-full" />
      <div className="flex gap-2">
        <div className="skeleton h-8 flex-1" />
        <div className="skeleton h-8 flex-1" />
        <div className="skeleton h-8 flex-1" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, configs, loading, refreshConfigs, refreshUser } = useApp()
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', total_gb: 1, duration_days: 30 })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('creation')

  // Correctly sum total used GB across all configs
  const totalUsedGB = configs.reduce((sum, c) => sum + bytesToGB((c.usage_up || 0) + (c.usage_down || 0)), 0)
  const totalGB = configs.reduce((sum, c) => sum + (c.total_gb || 0), 0)
  const usagePct = totalGB > 0 ? Math.min(100, Math.round((totalUsedGB / totalGB) * 100)) : 0

  const trafficBalanceGB = user?.traffic_balance_gb ?? 0

  const handleCharge = () => navigate('/store')

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refreshConfigs(), refreshUser()])
    setRefreshing(false)
  }

  const handleCreateConfig = async (e) => {
    e.preventDefault()
    setCreateError(null)
    if (!createForm.name.trim()) { setCreateError('Config name is required'); return }
    if (createForm.name.includes('-')) { setCreateError('Config name must not contain hyphens'); return }
    if (createForm.total_gb > trafficBalanceGB) {
      setCreateError(`Insufficient traffic balance. You have ${trafficBalanceGB.toFixed(2)} GB available.`)
      return
    }
    setCreating(true)
    try {
      await createConfig({ ...createForm, name: createForm.name.trim() })
      setShowCreateModal(false)
      setCreateForm({ name: '', total_gb: 1, duration_days: 30 })
      // Refresh both configs and user (to update traffic balance)
      await Promise.all([refreshConfigs(), refreshUser()])
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to create config'
      setCreateError(detail)
    } finally {
      setCreating(false)
    }
  }

  const handleConfigUpdate = async () => {
    await Promise.all([refreshConfigs(), refreshUser()])
  }

  // Color for total usage bar
  const usageBarColor = usagePct > 85 ? 'bg-red-500' : usagePct > 60 ? 'bg-amber-500' : 'bg-emerald-500'

  // Filter configs by search query (case-insensitive, partial match)
  const filteredConfigs = configs.filter(c =>
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort configs
  const sortedConfigs = [...filteredConfigs].sort((a, b) => {
    if (sortBy === 'remaining_days') {
      const da = daysLeft(a.expiry_date)
      const db = daysLeft(b.expiry_date)
      // No expiry (null) → goes last
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    }
    if (sortBy === 'usage_pct') {
      const pa = a.total_gb > 0 ? ((a.usage_up + a.usage_down) / (1024 ** 3)) / a.total_gb : 0
      const pb = b.total_gb > 0 ? ((b.usage_up + b.usage_down) / (1024 ** 3)) / b.total_gb : 0
      return pb - pa // highest usage first
    }
    // Default: creation order (original array order)
    return 0
  })

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Raha VPN</h1>
          <p className="text-slate-400 text-sm">Your secure connection</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <FiRefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Traffic Balance */}
      <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Available Traffic Balance</p>
          <p className="text-lg font-bold text-emerald-400">{trafficBalanceGB.toFixed(2)} GB</p>
        </div>
        <div className="flex gap-2">
          {trafficBalanceGB <= 0 ? (
            <button
              onClick={() => navigate('/store')}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              Buy Traffic
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <FiPlus size={16} />
              New Config
            </button>
          )}
        </div>
      </div>

      {/* Total Traffic Usage Summary */}
      {configs.length > 0 && (
        <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-300 font-semibold text-sm">Total Traffic Usage</h2>
            <span className="text-xs font-bold text-white">{usagePct}%</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="skeleton h-3 w-3/4 rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${usageBarColor}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{totalUsedGB.toFixed(2)} GB used</span>
                <span>{totalGB.toFixed(1)} GB total across {configs.length} config{configs.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Configs Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-slate-300 font-semibold text-sm">My Configs</h2>
        </div>

        {/* Search & Sort */}
        {configs.length > 0 && (
          <div className="space-y-2">
            <div className="relative">
              <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search configs…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Sort:</span>
              {[
                { value: 'creation', label: 'Date' },
                { value: 'remaining_days', label: 'Expiry' },
                { value: 'usage_pct', label: 'Usage' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    sortBy === opt.value
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : configs.length === 0 ? (
          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-8 text-center">
            <p className="text-slate-400 text-sm">No configs found</p>
            {trafficBalanceGB > 0 ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Create Config
              </button>
            ) : (
              <button
                onClick={() => navigate('/store')}
                className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Get a Plan
              </button>
            )}
          </div>
        ) : sortedConfigs.length === 0 ? (
          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-6 text-center">
            <p className="text-slate-400 text-sm">No configs match your search</p>
          </div>
        ) : (
          sortedConfigs.map((config) => (
            <ConfigCard
              key={config.uuid || config.email}
              config={config}
              onCharge={handleCharge}
              onRefresh={handleConfigUpdate}
            />
          ))
        )}
      </div>

      {/* Create Config Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}>
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl animate-in zoom-in-95 duration-300 max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
              <h3 className="text-base font-bold text-white">Create New Config</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400">
                <FiX size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-5">
              <p className="text-xs text-slate-400 mb-4">
                Available traffic balance: <span className="text-emerald-400 font-bold">{trafficBalanceGB.toFixed(2)} GB</span>
              </p>
              {createError && (
                <div className="bg-rose-500/20 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-400 text-sm mb-4">
                  {createError}
                </div>
              )}
              <form onSubmit={handleCreateConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Config Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={e => setCreateForm({...createForm, name: e.target.value})}
                    placeholder="e.g. myphone (no hyphens)"
                    maxLength={32}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Used as your config identifier. No hyphens allowed.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Traffic (GB)</label>
                  <input
                    type="number"
                    value={createForm.total_gb}
                    onChange={e => setCreateForm({...createForm, total_gb: parseFloat(e.target.value) || 0})}
                    min={0.1}
                    max={trafficBalanceGB}
                    step="any"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Duration (days, 0 = unlimited)</label>
                  <input
                    type="number"
                    value={createForm.duration_days}
                    onChange={e => setCreateForm({...createForm, duration_days: parseInt(e.target.value) || 0})}
                    min={0}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors"
                >
                  {creating ? 'Creating…' : 'Create Config'}
                </button>
              </form>
              <div className="h-8"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
