import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export default function GaugeChart({ value = 0, max = 1, label = '', color = '#10b981' }) {
  const safeMax = max > 0 ? max : 1
  const safeValue = Math.min(value, safeMax)
  const pct = safeValue / safeMax

  const filled = pct
  const empty = 1 - pct

  const data = [
    { value: filled },
    { value: empty },
  ]

  const displayValue = value < 1 ? (value * 1024).toFixed(1) + ' MB' : value.toFixed(2) + ' GB'
  const maxDisplay = max < 1 ? (max * 1024).toFixed(1) + ' MB' : max.toFixed(1) + ' GB'
  const pctDisplay = Math.round(pct * 100)

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-20">
        <ResponsiveContainer width="100%" height={80}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="90%"
              startAngle={180}
              endAngle={0}
              innerRadius={40}
              outerRadius={56}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={color} />
              <Cell fill="#334155" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-sm font-bold text-white leading-tight">{pctDisplay}%</span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1 text-center">{label}</p>
      <p className="text-xs text-slate-300 font-medium">
        {displayValue} / {maxDisplay}
      </p>
    </div>
  )
}
