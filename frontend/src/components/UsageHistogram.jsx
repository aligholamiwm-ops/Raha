import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import jalaali from 'jalaali-js'
import { getUsageHistory } from '../api/client'

const PERIODS = [
  { id: '1D', label: 'Day', timeframe: 'H', window: '1D' },
  { id: '7D', label: 'Week', timeframe: 'D', window: '7D' },
  { id: '30D', label: 'Month', timeframe: 'D', window: '30D' },
]

function parseUtc(ts) {
  if (!ts) return new Date(0)
  if (!ts.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + 'Z')
  }
  return new Date(ts)
}

function getTehranParts(ts) {
  const date = parseUtc(ts)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24 }
}

function toShamsiShort(year, month, day) {
  const j = jalaali.toJalaali(year, month, day)
  return `${j.jm}/${j.jd}`
}

function to12h(hour) {
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}

function formatXLabel(ts, periodId) {
  const { year, month, day, hour } = getTehranParts(ts)
  if (periodId === '1D') return hour % 6 === 0 ? to12h(hour) : ''
  return toShamsiShort(year, month, day)
}

function formatGB(value) {
  if (value === 0) return '0 GB'
  if (value < 0.001) return `${(value * 1024 * 1024).toFixed(0)} KB`
  if (value < 1) return `${(value * 1024).toFixed(1)} MB`
  return `${value.toFixed(2)} GB`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const { year, month, day, hour } = getTehranParts(label)
  const shamsi = toShamsiShort(year, month, day)
  const timeStr = hour !== undefined ? ` ${String(hour).padStart(2, '0')}:00` : ''
  return (
    <div className="bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{shamsi}{timeStr}</p>
      <p className="text-emerald-400 font-bold">{formatGB(payload[0].value)}</p>
    </div>
  )
}

export default function UsageHistogram({ configs = [], fetchUsageHistory: customFetch }) {
  const [period, setPeriod] = useState('1D')
  const [selectedConfig, setSelectedConfig] = useState('all')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const activePeriod = PERIODS.find(p => p.id === period) || PERIODS[0]

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fn = customFetch || getUsageHistory
      const points = await fn(activePeriod.timeframe, activePeriod.window, selectedConfig)
      setData(points)
    } catch {
      setError('Failed to load usage data')
    } finally {
      setLoading(false)
    }
  }, [activePeriod.timeframe, activePeriod.window, selectedConfig, customFetch])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = useMemo(() => {
    if (!data.length) return null
    const values = data.map(d => d.gb)
    const peak = Math.max(...values)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    const weekTotal = data.reduce((s, d) => s + d.gb, 0)
    return { peak, avg, weekTotal }
  }, [data])

  const maxGB = data.reduce((m, p) => Math.max(m, p.gb), 0)

  const barColor = (value) => {
    if (maxGB === 0) return '#10b981'
    const ratio = value / maxGB
    if (ratio > 0.8) return '#ef4444'
    if (ratio > 0.5) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div className="bg-dark-card rounded-card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-[16px] font-bold">Traffic Overview</h2>
        <div className="segmented-control">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={period === p.id ? 'active' : ''}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {configs.length > 1 && (
        <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto scrollbar-none">
          {['all', ...configs.map(c => c.email)].map(key => {
            const c = key === 'all' ? null : configs.find(cfg => cfg.email === key)
            const label = key === 'all' ? 'All' : (c?.name || key.slice(0, 12))
            return (
              <button
                key={key}
                onClick={() => setSelectedConfig(key)}
                className={`shrink-0 px-2.5 py-1 rounded-pill text-[10px] font-semibold transition-all ${
                  selectedConfig === key
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-gray-500 border border-white/5 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="h-32 mb-3">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="skeleton h-full w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-[12px] text-gray-500">{error}</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-gray-500">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }} barCategoryGap="25%">
              <XAxis
                dataKey="ts"
                tickFormatter={ts => formatXLabel(ts, period)}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => v < 0.01 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1)}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="gb" radius={[2, 2, 0, 0]} maxBarSize={20}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.gb)} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {stats && !loading && (
        <div className="flex items-center gap-4 pt-2.5 border-t border-white/5">
          <div>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Peak</p>
            <p className="text-[13px] font-bold text-white mt-0.5">{formatGB(stats.peak)}</p>
          </div>
          <div className="w-px h-7 bg-white/5" />
          <div>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Average</p>
            <p className="text-[13px] font-bold text-white mt-0.5">{formatGB(stats.avg)}</p>
          </div>
          <div className="w-px h-7 bg-white/5" />
          <div>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total</p>
            <p className="text-[13px] font-bold text-white mt-0.5">{formatGB(stats.weekTotal)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
