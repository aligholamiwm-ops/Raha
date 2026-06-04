import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { getUsageHistory } from '../api/client'

const TIMEFRAMES = [
  { id: 'H', label: 'H' },
  { id: 'D', label: 'D' },
]

const WINDOWS = [
  { id: '1D', label: '1D' },
  { id: '30D', label: '30D' },
  { id: 'all', label: 'All' },
]

function formatXLabel(ts, timeframe, window) {
  const d = new Date(ts)
  if (timeframe === 'H') {
    if (window === '1D') {
      return d.getUTCHours() % 6 === 0 ? `${String(d.getUTCHours()).padStart(2, '0')}h` : ''
    }
    // 30D or all – show date at midnight only
    if (d.getUTCHours() === 0) {
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
    }
    return ''
  }
  // Daily
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

function formatGB(value) {
  if (value === 0) return '0 B'
  if (value < 0.001) return `${(value * 1024 * 1024).toFixed(0)} KB`
  if (value < 1) return `${(value * 1024).toFixed(1)} MB`
  return `${value.toFixed(2)} GB`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = new Date(label)
  const dateStr = d.toUTCString().replace(' GMT', ' UTC').slice(0, -4) + 'UTC'
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{dateStr}</p>
      <p className="text-emerald-400 font-bold">{formatGB(payload[0].value)}</p>
    </div>
  )
}

export default function UsageHistogram({ configs = [] }) {
  const [timeframe, setTimeframe] = useState('H')
  const [window, setWindow] = useState('1D')
  const [selectedConfig, setSelectedConfig] = useState('all')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const points = await getUsageHistory(timeframe, window, selectedConfig)
      setData(points)
    } catch {
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [timeframe, window, selectedConfig])

  useEffect(() => { fetchData() }, [fetchData])

  const totalGB = data.reduce((s, p) => s + p.gb, 0)
  const maxGB = data.reduce((m, p) => Math.max(m, p.gb), 0)

  const barColor = (value) => {
    if (maxGB === 0) return '#10b981'
    const ratio = value / maxGB
    if (ratio > 0.8) return '#ef4444'
    if (ratio > 0.5) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-slate-300 font-semibold text-sm">Usage History</h2>
        <span className="text-[10px] text-slate-500">{formatGB(totalGB)} total</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Timeframe */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                timeframe === tf.id
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Window */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {WINDOWS.map(w => (
            <button
              key={w.id}
              onClick={() => setWindow(w.id)}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                window === w.id
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* Config selector */}
        {configs.length > 0 && (
          <select
            value={selectedConfig}
            onChange={e => setSelectedConfig(e.target.value)}
            className="ml-auto bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500 max-w-[120px] truncate"
          >
            <option value="all">All configs</option>
            {configs.map(c => (
              <option key={c.uuid} value={c.uuid}>{c.name || c.email}</option>
            ))}
          </select>
        )}
      </div>

      {/* Chart area */}
      <div className="h-36">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="skeleton h-full w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">{error}</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="20%">
              <XAxis
                dataKey="ts"
                tickFormatter={ts => formatXLabel(ts, timeframe, window)}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => v === 0 ? '0' : v < 1 ? `${(v * 1024).toFixed(0)}M` : `${v.toFixed(1)}G`}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="gb" radius={[2, 2, 0, 0]} maxBarSize={24}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.gb)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
