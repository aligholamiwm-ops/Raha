import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ConfigCard from '../components/ConfigCard'
import UsageHistogram from '../components/UsageHistogram'
import { createConfig, getInboundOptions } from '../api/client'
import {
  FiPlus, FiX, FiRefreshCw, FiAlertCircle, FiLoader,
  FiActivity, FiServer, FiClock, FiPieChart
} from 'react-icons/fi'

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

function estimateDaysRemaining(configs) {
  const active = configs.filter(c => c.status === 'active')
  if (active.length === 0) return null
  let totalDays = 0; let count = 0
  for (const c of active) {
    const d = daysLeft(c.expiry_date)
    if (d !== null && d > 0) {
      const used = bytesToGB((c.usage_up || 0) + (c.usage_down || 0))
      const dailyAvg = used > 0 && d > 0 ? (used / (d > 30 ? 30 : Math.max(d, 1))) : 0
      if (dailyAvg > 0) {
        const remaining = c.total_gb - used
        const est = remaining / dailyAvg
        totalDays += Math.min(est, d)
      } else {
        totalDays += d
      }
      count++
    }
  }
  return count > 0 ? Math.round(totalDays / count) : null
}

function SkeletonHero() {
  return (
    <div className="bg-dark-card rounded-card p-5 space-y-4 animate-fade-in">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton h-9 w-40" />
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-10 flex-1" />)}
      </div>
    </div>
  )
}

function SkeletonConfigs() {
  return (
    <div className="space-y-2.5">
      {[1, 2].map(i => (
        <div key={i} className="bg-dark-card rounded-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="skeleton h-2 w-2 rounded-full" />
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-4 w-14 rounded-pill" />
          </div>
          <div className="skeleton h-1.5 w-full rounded-pill" />
          <div className="flex justify-between">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-3 w-8" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user, configs, loading, configsError, setConfigsError, refreshConfigs, refreshUser } = useApp()
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [inboundOptions, setInboundOptions] = useState([])
  const [loadingInbounds, setLoadingInbounds] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', total_gb: 1, duration_days: 30, inbound_ids: [] })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const totalUsedGB = configs.reduce((sum, c) => sum + bytesToGB((c.usage_up || 0) + (c.usage_down || 0)), 0)
  const totalGB = configs.reduce((sum, c) => sum + (c.total_gb || 0), 0)
  const usagePct = totalGB > 0 ? Math.min(100, Math.round((totalUsedGB / totalGB) * 100)) : 0
  const trafficBalanceGB = user?.traffic_balance_gb ?? 0
  const activeConfigs = configs.filter(c => c.status === 'active').length
  const estDays = estimateDaysRemaining(configs)

  const handleCharge = () => navigate('/profile')

  const openCreateModal = async () => {
    setShowCreateModal(true)
    setLoadingInbounds(true)
    try {
      const options = await getInboundOptions()
      setInboundOptions(options)
    } catch (err) {
      console.error('Failed to load inbound options', err)
    } finally {
      setLoadingInbounds(false)
    }
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
      setCreateForm({ name: '', total_gb: 1, duration_days: 30, inbound_ids: [] })
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

  const sortedConfigs = [...configs].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return 0
  })

  return (
    <div className="px-3 py-3 space-y-3">

      {loading && configs.length === 0 ? (
        <>
          <SkeletonHero />
          <div className="skeleton h-36 w-full rounded-card" />
          <SkeletonConfigs />
        </>
      ) : (
        <>
          {/* Hero Card */}
          <div className="bg-dark-card rounded-card p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <p className="text-gray-500 text-[13px] font-medium mb-1">Available Traffic</p>
              <div className="flex items-end justify-between mb-4">
                <p className="text-[32px] font-bold text-white leading-none tracking-tight">
                  {trafficBalanceGB.toFixed(2)}
                  <span className="text-base font-medium text-gray-400 ml-1">GB</span>
                </p>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-[13px] font-semibold px-4 py-2.5 rounded-btn transition-all active:scale-[0.98] shadow-glow"
                >
                  <FiPlus size={15} />
                  New Config
                </button>
              </div>
              {trafficBalanceGB <= 0 && (
                <button
                  onClick={() => navigate('/profile')}
                  className="text-[11px] font-semibold text-amber-400 mb-3 flex items-center gap-1"
                >
                  <FiAlertCircle size={12} />
                  Buy traffic to create configs
                </button>
              )}
              <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <FiActivity size={12} className="text-gray-500" />
                  <span className="text-[13px] font-semibold text-white">{totalUsedGB.toFixed(1)}</span>
                  <span className="text-[11px] text-gray-500">used</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <FiServer size={12} className="text-gray-500" />
                  <span className="text-[13px] font-semibold text-white">{activeConfigs}</span>
                  <span className="text-[11px] text-gray-500">active</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <FiClock size={12} className="text-gray-500" />
                  <span className="text-[13px] font-semibold text-white">
                    {estDays !== null ? `~${estDays}` : '—'}
                  </span>
                  <span className="text-[11px] text-gray-500">days</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <FiPieChart size={12} className="text-gray-500" />
                  <span className="text-[13px] font-semibold text-white">{usagePct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configs Error Banner */}
          {configsError && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-card p-3 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <FiAlertCircle size={14} className="text-rose-400 shrink-0" />
                <p className="text-rose-400 text-[12px]">{configsError}</p>
              </div>
              <button
                onClick={() => { setConfigsError(null); refreshConfigs(); refreshUser(); }}
                className="text-rose-400 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Usage Overview */}
          {configs.length > 0 && (
            <UsageHistogram configs={configs} />
          )}

          {/* Configs Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-[18px] font-bold">Configs</h2>
              {configs.length > 0 && (
                <span className="text-[12px] text-gray-500 font-medium">{configs.length} total</span>
              )}
            </div>

            {configs.length === 0 ? (
              <div className="bg-dark-card rounded-card p-8 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <FiServer size={24} className="text-emerald-400" />
                </div>
                <p className="text-white font-semibold text-[16px] mb-1">No configurations yet</p>
                <p className="text-gray-500 text-[13px] mb-4">Create your first config to get started</p>
                {trafficBalanceGB > 0 ? (
                  <button
                    onClick={openCreateModal}
                    className="bg-emerald-500 hover:bg-emerald-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-btn transition-all active:scale-[0.98]"
                  >
                    Create your first config
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/profile')}
                    className="bg-emerald-500 hover:bg-emerald-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-btn transition-all active:scale-[0.98]"
                  >
                    Get a Plan
                  </button>
                )}
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
        </>
      )}

      {/* Create Config Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false) }}>
          <div className="w-full max-w-sm bg-dark-card border border-white/10 rounded-2xl animate-scale-in max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h3 className="text-[16px] font-bold text-white">Create New Config</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors">
                <FiX size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-5">
              <p className="text-[12px] text-gray-500 mb-4">
                Balance: <span className="text-emerald-400 font-bold">{trafficBalanceGB.toFixed(2)} GB</span>
              </p>
              {createError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 text-rose-400 text-[12px] mb-3">
                  {createError}
                </div>
              )}
              <form onSubmit={handleCreateConfig} className="space-y-3.5">
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1">Config Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={e => setCreateForm({...createForm, name: e.target.value})}
                    placeholder="e.g. myphone"
                    maxLength={32}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1">Traffic (GB)</label>
                  <input
                    type="number"
                    value={createForm.total_gb}
                    onChange={e => setCreateForm({...createForm, total_gb: parseFloat(e.target.value) || 0})}
                    min={0.1}
                    max={trafficBalanceGB}
                    step="any"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1">Duration (days, 0 = unlimited)</label>
                  <input
                    type="number"
                    value={createForm.duration_days}
                    onChange={e => setCreateForm({...createForm, duration_days: parseInt(e.target.value) || 0})}
                    min={0}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-400 mb-1">Inbound Selection</label>
                  {loadingInbounds ? (
                    <div className="flex items-center gap-2 text-gray-500 text-[12px] py-2">
                      <FiLoader className="animate-spin" size={14} /> Loading...
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto bg-white/5 border border-white/10 rounded-lg p-2">
                      {inboundOptions.length === 0 ? (
                        <p className="text-[12px] text-gray-500 text-center py-2">No inbounds available</p>
                      ) : (
                        inboundOptions.map((opt) => (
                          <label key={`${opt.server_name}-${opt.id}`} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white/5 rounded-lg transition-colors">
                            <input
                              type="checkbox"
                              checked={createForm.inbound_ids.includes(opt.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked
                                  ? [...createForm.inbound_ids, opt.id]
                                  : createForm.inbound_ids.filter(id => id !== opt.id)
                                setCreateForm({ ...createForm, inbound_ids: newIds })
                              }}
                              className="accent-emerald-500"
                            />
                            <span className="text-[12px] text-gray-300">{opt.server_name} - {opt.remark || opt.port}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={creating || loadingInbounds}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-btn transition-all active:scale-[0.98] text-[13px]"
                >
                  {creating ? 'Creating…' : 'Create Config'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
