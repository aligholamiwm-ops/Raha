import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import jalaali from 'jalaali-js'
import { getUsageHistory } from '../api/client'

const TIMEFRAMES = [
  { id: 'H', label: 'Hourly' },
  { id: 'D', label: 'Daily' },
]

const WINDOWS = [
  { id: '1D', label: '1D' },
  { id: '30D', label: '30D' },
  { id: 'all', label: 'All' },
]

// Parse a timestamp string as UTC (MongoDB returns naive UTC datetimes)
function parseUtc(ts) {
  if (!ts) return new Date(0)
  // Append Z if no timezone info present
  if (!ts.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(ts)) {
    return new Date(ts + 'Z')
  }
  return new Date(ts)
}

// Extract date/time parts in Tehran timezone
function getTehranParts(ts) {
  const date = parseUtc(ts)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)
  const hour = get('hour') % 24 // normalize 24 → 0
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') }
}

// Convert Gregorian (Tehran local) to Shamsi date string "jY/jM/jD"
function toShamsi(year, month, day) {
  const j = jalaali.toJalaali(year, month, day)
  return `${j.jy}/${j.jm}/${j.jd}`
}

// Short Shamsi without year "jM/jD"
function toShamsiShort(year, month, day) {
  const j = jalaali.toJalaali(year, month, day)
  return `${j.jm}/${j.jd}`
}

// Convert 24h hour to 12h label (e.g. 0→"12AM", 13→"1PM")
function to12h(hour) {
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}

function formatXLabel(ts, timeframe, window) {
  const { year, month, day, hour } = getTehranParts(ts)
  if (timeframe === 'H') {
    if (window === '1D') {
      // Show label every 6 hours: 12AM, 6AM, 12PM, 6PM
      return hour % 6 === 0 ? to12h(hour) : ''
    }
    // 30D or all – show Shamsi date only at midnight (Tehran)
    return hour === 0 ? toShamsiShort(year, month, day) : ''
  }
  // Daily – show Shamsi date
  return toShamsiShort(year, month, day)
}

function formatGB(value) {
  if (value === 0) return '0 GB'
  if (value < 0.001) return `${(value * 1024 * 1024).toFixed(0)} KB`
  if (value < 1) return `${(value * 1024).toFixed(1)} MB`
  return `${value.toFixed(2)} GB`
}

// Y-axis tick formatter
function formatYTick(v) {
  if (v === 0) return '0'
  if (v < 0.01) return `${v.toFixed(3)}`
  if (v < 0.1) return `${v.toFixed(2)}`
  if (v < 1) return `${v.toFixed(1)}`
  return `${v.toFixed(1)}`
}

// Build Shamsi interval string for a data range
function buildIntervalLabel(data) {
  if (!data || data.length === 0) return null
  const first = getTehranParts(data[0].ts)
  const last = getTehranParts(data[data.length - 1].ts)
  const startStr = toShamsi(first.year, first.month, first.day)
  const endStr = toShamsi(last.year, last.month, last.day)
  if (startStr === endStr) {
    return `${startStr} (تهران)`
  }
  return `${startStr} – ${endStr} (تهران)`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const { year, month, day, hour, minute } = getTehranParts(label)
  const shamsi = toShamsi(year, month, day)
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const dateStr = `${shamsi} ${timeStr} (تهران)`
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
  const intervalLabel = buildIntervalLabel(data)

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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {intervalLabel && (
            <span className="text-[10px] text-slate-500">{intervalLabel}</span>
          )}
          <span className="text-[10px] text-slate-500">{formatGB(totalGB)} total</span>
        </div>
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
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
              <XAxis
                dataKey="ts"
                tickFormatter={ts => formatXLabel(ts, timeframe, window)}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={{ stroke: '#334155', strokeWidth: 1 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatYTick}
                tick={{ fill: '#64748b', fontSize: 9 }}
                axisLine={{ stroke: '#64748b', strokeWidth: 1 }}
                tickLine={false}
                width={36}
                label={{ value: 'GB', position: 'insideTopLeft', offset: 2, fill: '#94a3b8', fontSize: 9, fontWeight: 600 }}
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
