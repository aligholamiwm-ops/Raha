import i18n from '../i18n'
import { getLangMeta } from '../i18n/languages'
import { toJalaali } from 'jalaali-js'

export function formatDate(ts, opts = {}) {
  if (!ts) return ''
  const lng = i18n.language
  const meta = getLangMeta(lng)
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  if (meta.calendar === 'shamsi') {
    const j = toJalaali(d)
    const { month: monthStyle, year: yearStyle, ...rest } = opts
    let monthStr = String(j.jM)
    if (monthStyle === 'short' || monthStyle === 'numeric') {
      monthStr = String(j.jM).padStart(2, '0')
    }
    let yearStr = String(j.jY)
    if (opts.year === '2-digit') yearStr = String(j.jY).slice(-2)
    const dayStr = String(j.jD).padStart(2, '0')
    let result = `${yearStr}-${monthStr}-${dayStr}`
    if (opts.hour || opts.minute) {
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      result += ` ${h}:${m}`
    }
    return result
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...opts })
}

export function formatDateTime(ts) {
  return formatDate(ts, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateShort(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const meta = getLangMeta(i18n.language)
  if (meta.calendar === 'shamsi') {
    const j = toJalaali(d)
    return `${j.jY}/${String(j.jM).padStart(2, '0')}/${String(j.jD).padStart(2, '0')}`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
