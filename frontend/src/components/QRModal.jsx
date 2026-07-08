import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { sendConfigToBot } from '../api/client'

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const TelegramIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.45-.42-1.39-.89.03-.24.37-.49 1.02-.74 4-1.74 6.67-2.88 8-3.43 3.81-1.58 4.6-1.85 5.12-1.86.11 0 .37.03.54.17.14.12.18.28.2.44-.01.07 0 .14-.01.21z" />
  </svg>
)

export default function QRModal({ email, configName, subscriptionLink, onClose }) {
  const { t } = useTranslation('common')
  const [zipPassword, setZipPassword] = useState('')
  const [showZipInput, setShowZipInput] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleSendToBot = async () => {
    if (!zipPassword.trim()) return
    setSending(true)
    setError(null)
    setMessage(null)
    try {
      const res = await sendConfigToBot(email, zipPassword.trim())
      setMessage(res.message || t('qrModal.sent'))
      setShowZipInput(false)
      setZipPassword('')
    } catch (err) {
      setError(err?.response?.data?.detail || t('qrModal.failed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-24"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-2xl ring-1 ring-slate-700 w-full max-w-sm p-5 space-y-4 overflow-y-auto max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base truncate pe-2">{configName || t('qrModal.vpnConfig')}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* QR area */}
        <div className="flex items-center justify-center bg-white rounded-xl p-4 min-h-[200px]">
          {subscriptionLink ? (
            <QRCodeSVG value={subscriptionLink} size={180} level="M" includeMargin={false} />
          ) : (
            <div className="text-slate-500 text-sm text-center">{t('qrModal.noLink')}</div>
          )}
        </div>

        {/* URI preview */}
        {subscriptionLink && (
          <div className="bg-slate-900 rounded-lg px-3 py-2 border border-slate-700">
            <p className="text-slate-400 text-xs break-all line-clamp-3 font-mono">{subscriptionLink}</p>
          </div>
        )}

        {/* Send to Telegram section */}
        {!showZipInput ? (
          <button
            onClick={() => setShowZipInput(true)}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
          >
            <TelegramIcon />
            {t('qrModal.sendToTelegram')}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                value={zipPassword}
                onChange={(e) => setZipPassword(e.target.value)}
                placeholder={t('qrModal.setPassword')}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSendToBot()}
                autoFocus
              />
              <button
                onClick={handleSendToBot}
                disabled={sending || !zipPassword.trim()}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium px-4 rounded-xl transition-colors"
              >
                {sending ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t('qrModal.send')
                )}
              </button>
              <button
                onClick={() => { setShowZipInput(false); setZipPassword(''); setError(null) }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-rose-400 text-center text-xs bg-rose-400/10 py-2 rounded-lg">{error}</p>
        )}
        {message && (
          <p className="text-emerald-400 text-center text-xs bg-emerald-400/10 py-2 rounded-lg">{message}</p>
        )}
      </div>
    </div>
  )
}
