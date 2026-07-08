import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { FiDelete, FiCheck, FiX } from 'react-icons/fi'
import { MdAllInclusive } from 'react-icons/md'

const ASCII_DIGIT_MAP = (() => {
  const m = {}
  const groups = [
    [0x0660, 0x0669],
    [0x06F0, 0x06F9],
    [0x07C0, 0x07C9],
    [0x0966, 0x096F],
    [0x09E6, 0x09EF],
    [0x0A66, 0x0A6F],
    [0x0AE6, 0x0AEF],
    [0x0B66, 0x0B6F],
    [0x0BE6, 0x0BEF],
    [0x0C66, 0x0C6F],
    [0x0CE6, 0x0CEF],
    [0x0D66, 0x0D6F],
    [0x0DE6, 0x0DEF],
    [0x0E50, 0x0E59],
    [0x0ED0, 0x0ED9],
    [0x0F20, 0x0F29],
    [0x1040, 0x1049],
    [0x1090, 0x1099],
    [0x17E0, 0x17E9],
    [0x1810, 0x1819],
    [0xFF10, 0xFF19],
  ]
  for (const [s, e] of groups) {
    for (let c = s; c <= e; c++) {
      m[String.fromCharCode(c)] = String(c - s)
    }
  }
  return m
})()

export function toAsciiDigits(str) {
  if (!str) return ''
  let out = ''
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ASCII_DIGIT_MAP[ch] !== undefined) out += ASCII_DIGIT_MAP[ch]
    else out += ch
  }
  return out
}

export function NumericKeypad({ value, onConfirm, onClose, allowDecimal = false }) {
  const { t } = useTranslation('common')
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value))

  const press = useCallback((key) => {
    setDraft((prev) => {
      if (key === 'backspace') return prev.slice(0, -1)
      if (key === 'dot') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      if (prev === '0' && key !== '.') return key
      return prev + key
    })
  }, [])

  const confirm = useCallback(() => {
    const parsed = allowDecimal ? parseFloat(draft) : parseInt(draft, 10)
    if (!isNaN(parsed) && draft !== '') onConfirm(parsed)
    else if (draft === '') onConfirm(0)
    else onClose()
  }, [draft, allowDecimal, onConfirm, onClose])

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key
      if (k >= '0' && k <= '9') { e.preventDefault(); press(k) }
      else if (k === '.' && allowDecimal) { e.preventDefault(); press('dot') }
      else if (k === 'Backspace') { e.preventDefault(); press('backspace') }
      else if (k === 'Enter') { e.preventDefault(); confirm() }
      else if (k === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, confirm, allowDecimal, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xs bg-dark-card border border-white/10 rounded-t-2xl sm:rounded-2xl animate-scale-in overflow-hidden shadow-2xl mb-14 sm:mb-0">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-white text-[20px] font-bold tracking-tight flex-1 text-end pe-1">
            {draft === '' ? '0' : draft}
          </span>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 shrink-0">
            <FiX size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} onClick={() => press(k)}
              className="bg-white/5 hover:bg-white/10 text-white text-[18px] font-semibold py-2.5 rounded-xl transition-colors active:scale-[0.97]">
              {k}
            </button>
          ))}
          {allowDecimal ? (
            <button onClick={() => press('dot')}
              className="bg-white/5 hover:bg-white/10 text-white text-[18px] font-semibold py-2.5 rounded-xl transition-colors active:scale-[0.97]">
              .
            </button>
          ) : null}
          <button onClick={() => press('0')}
            className="bg-white/5 hover:bg-white/10 text-white text-[18px] font-semibold py-2.5 rounded-xl transition-colors active:scale-[0.97]">
            0
          </button>
          <button onClick={() => press('backspace')}
            className="bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 rounded-xl transition-colors active:scale-[0.97] flex items-center justify-center">
            <FiDelete size={20} />
          </button>
        </div>
        <div className="px-3 pb-3">
          <button onClick={confirm}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-2.5 rounded-btn transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-[14px]">
            <FiCheck size={16} />
            {t('actions.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function CommonPills({ values, current, onPick, infiniteLabel = false }) {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map(v => {
        const active = current === v.value
        return (
          <button
            key={v.label}
            type="button"
            onClick={() => onPick(v.value)}
            className={`px-2.5 py-1 rounded-pill text-[11px] font-semibold transition-all active:scale-[0.97] border ${
              active
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
            }`}
          >
            {v.icon ? v.icon : v.label}
          </button>
        )
      })}
      {infiniteLabel && (
        <button
          type="button"
          onClick={() => onPick(0)}
          className={`px-2.5 py-1 rounded-pill text-[11px] font-semibold transition-all active:scale-[0.97] border flex items-center gap-1 ${
            current === 0
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
          }`}
          title={t('numberFields.unlimited')}
        >
          <MdAllInclusive size={14} />
        </button>
      )}
    </div>
  )
}

export function sanitizeFloatInput(raw, max) {
  const ascii = toAsciiDigits(String(raw))
  const cleaned = ascii.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  const intPart = parts[0] ? parts[0].replace(/^0+(?=\d)/, '') : ''
  let result = intPart
  if (parts.length > 1) {
    result = (intPart === '' ? '0' : intPart) + '.' + parts.slice(1).join('').replace(/\D/g, '')
  }
  if (result === '' || result === '.') return 0
  let num = parseFloat(result)
  if (isNaN(num)) return 0
  if (max !== undefined && num > max) num = max
  return num
}

export function sanitizeIntInput(raw, max) {
  const ascii = toAsciiDigits(String(raw))
  const cleaned = ascii.replace(/\D/g, '')
  const result = cleaned.replace(/^0+(?=\d)/, '')
  if (result === '') return 0
  let num = parseInt(result, 10)
  if (isNaN(num)) return 0
  if (max !== undefined && num > max) num = max
  return num
}

const TRAFFIC_PRESETS = [1, 5, 10, 50, 100]

export function TrafficField({ value, onChange, min = 0, max, unit = 'GB', inputRef, showSlider = true, showPresets = true }) {
  const [showKeypad, setShowKeypad] = useState(false)
  const localRef = useRef(null)
  const ref = inputRef || localRef

  const clamped = Math.max(min, Math.min(value, max))
  const sliderMax = Math.max(min, max)
  const sliderStep = sliderMax <= 5 ? 0.1 : sliderMax <= 50 ? 0.5 : 1

  const presets = TRAFFIC_PRESETS
    .filter(p => p <= max && p >= min)
    .map(p => ({ label: `${p}`, value: p }))

  let sliderValue = clamped
  if (max - min < 0.1) {
    sliderValue = min
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="text"
          inputMode="none"
          value={value}
          readOnly
          onFocus={e => { e.target.select(); setShowKeypad(true) }}
          onClick={() => setShowKeypad(true)}
          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-[13px] font-semibold text-center focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
        />
        <span className="text-[12px] text-gray-500 font-medium">{unit}</span>
      </div>

      {showSlider && sliderMax > min && (
        <input
          type="range"
          min={min}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          onChange={e => onChange(sanitizeFloatInput(e.target.value, max))}
          className="w-full accent-emerald-500 h-2"
        />
      )}

      {showPresets && presets.length > 0 && (
        <CommonPills
          values={presets}
          current={clamped}
          onPick={(v) => onChange(Math.max(min, Math.min(v, max)))}
        />
      )}

      {showKeypad && (
        <NumericKeypad
          value={value}
          allowDecimal
          onClose={() => { setShowKeypad(false); ref.current?.blur?.() }}
          onConfirm={(v) => {
            onChange(Math.max(min, Math.min(v, max)))
            setShowKeypad(false)
          }}
        />
      )}
    </div>
  )
}

export function DurationField({ value, onChange, min = 0, max, unit = 'days', allowInfinite = true, inputRef }) {
  const [showKeypad, setShowKeypad] = useState(false)
  const localRef = useRef(null)
  const ref = inputRef || localRef

  const DURATION_PRESETS = [
    { label: '1', value: 1 },
    { label: '30', value: 30 },
    { label: '60', value: 60 },
    { label: '90', value: 90 },
  ]

  const clamped = max !== undefined ? Math.max(min, Math.min(value, max)) : Math.max(min, value)
  const presets = DURATION_PRESETS.filter(p => max === undefined || p.value <= max)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="text"
          inputMode="none"
          value={value}
          readOnly
          onFocus={e => { e.target.select(); setShowKeypad(true) }}
          onClick={() => setShowKeypad(true)}
          className="w-12 bg-white/5 border border-white/10 rounded-lg px-1.5 py-2 text-white text-[13px] font-semibold text-center focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
        />
        <span className="text-[12px] text-gray-500 font-medium">{unit}</span>
      </div>
      <CommonPills
        values={presets}
        current={clamped}
        onPick={(v) => onChange(max !== undefined ? Math.max(min, Math.min(v, max)) : Math.max(min, v))}
        infiniteLabel={allowInfinite}
      />
      {showKeypad && (
        <NumericKeypad
          value={value}
          allowDecimal={false}
          onClose={() => { setShowKeypad(false); ref.current?.blur?.() }}
          onConfirm={(v) => {
            onChange(max !== undefined ? Math.max(min, Math.min(v, max)) : Math.max(min, v))
            setShowKeypad(false)
          }}
        />
      )}
    </div>
  )
}
