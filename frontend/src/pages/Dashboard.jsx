import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import GaugeChart from '../components/GaugeChart'
import ConfigCard from '../components/ConfigCard'
import { createConfig } from '../api/client'
import { FiPlus, FiX } from 'react-icons/fi'

function bytesToGB(bytes) {
  if (!bytes || bytes === 0) return 0
  return bytes / (1024 * 1024 * 1024)
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
  const { user, configs, loading, refreshConfigs } = useApp()
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', total_gb: 1, duration_days: 30 })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const totalUsedGB = configs.reduce((sum, c) => sum + bytesToGB(c.usage_up + c.usage_down), 0)
  const totalGB = configs.reduce((sum, c) => sum + (c.total_gb || 0), 0)
  const trafficBalanceGB = user?.traffic_balance_gb ?? 0

  const handleCharge = () => navigate('/store')

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
      await refreshConfigs()
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to create config'
      setCreateError(detail)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Raha VPN</h1>
          <p className="text-slate-400 text-sm">Your secure connection</p>
        </div>
      </div>

      {/* Traffic Balance */}
      <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Traffic Balance</p>
          <p className="text-lg font-bold text-emerald-400">{trafficBalanceGB.toFixed(2)} GB</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={trafficBalanceGB <= 0}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <FiPlus size={16} />
          New Config
        </button>
      </div>

      {/* Traffic Usage Gauge */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
        <h2 className="text-slate-300 font-semibold text-sm mb-4">Traffic Usage</h2>
        <div className="flex items-start justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="skeleton w-28 h-20 rounded-lg" />
              <div className="skeleton h-3 w-20" />
            </div>
          ) : (
            <GaugeChart
              value={totalUsedGB}
              max={totalGB || 1}
              label="Traffic Usage"
              color="#10b981"
            />
          )}
        </div>
      </div>

      {/* Configs Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-slate-300 font-semibold text-sm">My Configs</h2>
          <button
            onClick={refreshConfigs}
            className="text-emerald-400 text-xs font-medium hover:text-emerald-300 transition-colors"
          >
            Refresh
          </button>
        </div>

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
        ) : (
          configs.map((config) => (
            <ConfigCard
              key={config.uuid || config.email}
              config={config}
              onCharge={handleCharge}
              onRefresh={refreshConfigs}
            />
          ))
        )}
      </div>

      {/* Create Config Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}>
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-t-2xl p-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Create New Config</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400">
                <FiX size={18} />
              </button>
            </div>
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
                  step={0.5}
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
          </div>
        </div>
      )}
    </div>
  )
}
