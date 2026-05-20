import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getVlessUri } from '../api/client'

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
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

export default function QRModal({ uuid, configName, subscriptionLink, onClose }) {
  const [activeTab, setActiveTab] = useState(subscriptionLink ? 'subscription' : 'vless')
  const [uri, setUri] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedSub, setCopiedSub] = useState(false)
  const [ispName, setIspName] = useState('default')

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getVlessUri(uuid, ispName)
      .then((data) => {
        if (!cancelled) {
          setUri(typeof data === 'string' ? data : data?.uri || data?.vless_uri || JSON.stringify(data))
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError('Failed to load VLESS URI')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [uuid, ispName])

  const handleCopy = async (text, setCopiedFn) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFn(true)
      setTimeout(() => setCopiedFn(false), 2000)
    } catch {
      setError('Unable to copy — please copy manually')
    }
  }

  const displayUri = activeTab === 'subscription' ? subscriptionLink : uri
  const isSubTab = activeTab === 'subscription'

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

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-xl p-1">
          {subscriptionLink && (
            <button
              onClick={() => setActiveTab('subscription')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'subscription' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <LinkIcon />
              Subscription
            </button>
          )}
          <button
            onClick={() => setActiveTab('vless')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'vless' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            VLESS URI
          </button>
        </div>

        {/* ISP selector (only for VLESS tab) */}
        {activeTab === 'vless' && (
          <div className="flex items-center gap-2">
            <label className="text-slate-400 text-xs whitespace-nowrap">ISP:</label>
            <input
              type="text"
              value={ispName}
              onChange={(e) => setIspName(e.target.value || 'default')}
              className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-emerald-500"
              placeholder="default"
            />
          </div>
        )}

        {/* QR area */}
        <div className="flex items-center justify-center bg-white rounded-xl p-4 min-h-[200px]">
          {isSubTab ? (
            subscriptionLink ? (
              <QRCodeSVG value={subscriptionLink} size={180} level="M" includeMargin={false} />
            ) : (
              <div className="text-slate-500 text-sm text-center">No subscription link available</div>
            )
          ) : loading ? (
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          ) : error ? (
            <div className="text-red-500 text-sm text-center">{error}</div>
          ) : uri ? (
            <QRCodeSVG value={uri} size={180} level="M" includeMargin={false} />
          ) : (
            <div className="text-slate-500 text-sm">No URI available</div>
          )}
        </div>

        {/* URI preview */}
        {displayUri && !loading && (
          <div className="bg-slate-900 rounded-lg px-3 py-2 border border-slate-700">
            <p className="text-slate-400 text-xs break-all line-clamp-3 font-mono">{displayUri}</p>
          </div>
        )}

        {/* Copy button */}
        <button
          onClick={() => isSubTab ? handleCopy(subscriptionLink, setCopiedSub) : handleCopy(uri, setCopied)}
          disabled={!displayUri || loading}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          <CopyIcon />
          {isSubTab ? (copiedSub ? 'Copied!' : 'Copy Subscription Link') : (copied ? 'Copied!' : 'Copy URI')}
        </button>
      </div>
    </div>
  )
}
