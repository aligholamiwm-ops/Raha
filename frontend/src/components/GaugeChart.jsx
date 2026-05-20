import React from 'react'

export default function GaugeChart({ value = 0, max = 1, label = '', color = '#10b981' }) {
  const safeMax = max > 0 ? max : 1
  const safeValue = Math.min(value, safeMax)
  const pct = safeValue / safeMax
  const pctDisplay = Math.round(pct * 100)
  const displayValue = value < 1 ? (value * 1024).toFixed(1) + ' MB' : value.toFixed(2) + ' GB'
  const maxDisplay = max < 1 ? (max * 1024).toFixed(1) + ' MB' : max.toFixed(1) + ' GB'

  // Color based on percentage
  const barColor = pct > 0.85 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : color

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-bold text-white">{pctDisplay}%</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pctDisplay}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-slate-500">{displayValue} used</span>
        <span className="text-[10px] text-slate-500">{maxDisplay} total</span>
      </div>
    </div>
  )
}
