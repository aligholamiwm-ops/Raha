import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import GaugeChart from '../components/GaugeChart'
import ConfigCard from '../components/ConfigCard'
import { renewConfig } from '../api/client'

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
  const [renewError, setRenewError] = useState(null)
  const [renewingId, setRenewingId] = useState(null)

  const totalUsedGB = configs.reduce((sum, c) => sum + bytesToGB(c.usage_up + c.usage_down), 0)
  const totalGB = configs.reduce((sum, c) => sum + (c.total_gb || 0), 0)
  const referredGB = user?.total_referred_gb_purchased || 0
  const giftedGB = referredGB * 0.1

  const handleCharge = () => navigate('/store')

  const handleRenew = async (config) => {
    setRenewError(null)
    setRenewingId(config.uuid)
    try {
      navigate('/store', { state: { renewUuid: config.uuid, serverName: config.server_name } })
    } catch (e) {
      setRenewError('Failed to initiate renewal')
    } finally {
      setRenewingId(null)
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
        <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-3 py-2 text-right">
          <p className="text-xs text-emerald-400 font-medium">Wallet</p>
          <p className="text-emerald-300 font-bold text-sm">
            ${(user?.wallet_balance_usd || 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Error toast */}
      {renewError && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {renewError}
        </div>
      )}

      {/* Gauge Charts */}
      <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4">
        <h2 className="text-slate-300 font-semibold text-sm mb-4">Usage Overview</h2>
        <div className="flex items-start justify-around">
          {loading ? (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="skeleton w-28 h-20 rounded-lg" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="skeleton w-28 h-20 rounded-lg" />
                <div className="skeleton h-3 w-20" />
              </div>
            </>
          ) : (
            <>
              <GaugeChart
                value={totalUsedGB}
                max={totalGB || 1}
                label="Traffic Usage"
                color="#10b981"
              />
              <div className="w-px bg-slate-700 self-stretch" />
              <GaugeChart
                value={giftedGB}
                max={referredGB || 1}
                label="Referral Gift"
                color="#6366f1"
              />
            </>
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
            <button
              onClick={() => navigate('/store')}
              className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Get a Plan
            </button>
          </div>
        ) : (
          configs.map((config) => (
            <ConfigCard
              key={config.uuid}
              config={config}
              onCharge={handleCharge}
              onRenew={handleRenew}
            />
          ))
        )}
      </div>
    </div>
  )
}
