import React, { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { downloadConfigZip } from '../api/client'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export default function QRModal({ uuid, configName, subscriptionLink, onClose }) {
  const [copied, setCopied] = useState(false)
  const [zipPassword, setZipPassword] = useState('')
  const [showZipInput, setShowZipInput] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const handleCopy = async () => {
    if (!subscriptionLink) return
    try {
      await navigator.clipboard.writeText(subscriptionLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownloadZip = async () => {
    if (!zipPassword.trim()) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await downloadConfigZip(uuid, zipPassword.trim())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${configName || uuid}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setShowZipInput(false)
      setZipPassword('')
    } catch (err) {
      setDownloadError(err?.response?.data?.detail || 'Failed to download ZIP')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 rounded-2xl ring-1 ring-slate-700 w-full max-w-sm p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base truncate pr-2">{configName || 'VPN Config'}</h3>
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
            <div className="text-slate-500 text-sm text-center">No subscription link available</div>
          )}
        </div>

        {/* URI preview */}
        {subscriptionLink && (
          <div className="bg-slate-900 rounded-lg px-3 py-2 border border-slate-700">
            <p className="text-slate-400 text-xs break-all line-clamp-3 font-mono">{subscriptionLink}</p>
          </div>
        )}

        {/* Copy button */}
        <button
          onClick={handleCopy}
          disabled={!subscriptionLink}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          <CopyIcon />
          {copied ? 'Copied!' : 'Copy Subscription Link'}
        </button>

        {/* Download ZIP section */}
        {!showZipInput ? (
          <button
            onClick={() => setShowZipInput(true)}
            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm py-3 rounded-xl transition-colors"
          >
            <DownloadIcon />
            Download ZIP
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                value={zipPassword}
                onChange={(e) => setZipPassword(e.target.value)}
                placeholder="Enter ZIP password"
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                onKeyDown={(e) => e.key === 'Enter' && handleDownloadZip()}
                autoFocus
              />
              <button
                onClick={handleDownloadZip}
                disabled={downloading || !zipPassword.trim()}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium px-4 rounded-xl transition-colors"
              >
                {downloading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <DownloadIcon />
                )}
              </button>
              <button
                onClick={() => { setShowZipInput(false); setZipPassword(''); setDownloadError(null) }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>
            {downloadError && (
              <p className="text-rose-400 text-xs">{downloadError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
