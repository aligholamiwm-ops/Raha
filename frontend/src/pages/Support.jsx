import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getMyTickets, getAllTickets, createTicket, getTicket, replyTicket, updateTicketStatus } from '../api/client'
import { formatDateTime } from '../utils/dates'

const CATEGORIES = ['connection', 'help', 'withdrawal', 'cooperation']

function StatusBadge({ status }) {
  const styles = {
    open: 'bg-emerald-500/20 text-emerald-400',
    closed: 'bg-slate-600/50 text-slate-400',
    waiting_for_user: 'bg-yellow-500/20 text-yellow-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.open}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 rtl:rotate-180">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

// ─── New Ticket Form ─────────────────────────────────────────────────────────
function NewTicketForm({ onCreated, onCancel, initialCategory = null }) {
  const { t } = useTranslation('support')
  const [category, setCategory] = useState(initialCategory || CATEGORIES[0])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [usdtAddress, setUsdtAddress] = useState('')
  const [usdtNetwork, setUsdtNetwork] = useState('TRC20')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim() || !title.trim()) return
    
    // Validate withdrawal fields
    if (category === 'withdrawal') {
      if (!usdtAddress.trim()) {
        setError(t('newTicket.withdrawalRequired'))
        return
      }
      if (!usdtNetwork) {
        setError(t('newTicket.withdrawalNetworkRequired'))
        return
      }
    }
    
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        title: title.trim(),
        category,
        initial_message: message.trim(),
      }
      
      if (category === 'withdrawal') {
        payload.usdt_address = usdtAddress.trim()
        payload.usdt_network = usdtNetwork
      }
      
      const ticket = await createTicket(payload)
      onCreated(ticket)
    } catch (err) {
      setError(err?.response?.data?.detail || t('newTicket.failedCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-slate-400 hover:text-white p-1">
          <BackIcon />
        </button>
        <h2 className="text-white font-semibold text-base">{t('newTicket.title')}</h2>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('newTicket.titleFieldLabel')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('newTicket.titlePlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
            required
          />
        </div>

        <div>
          <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('newTicket.categoryLabel')}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 capitalize"
            disabled={initialCategory !== null}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>

        {category === 'withdrawal' && (
          <>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('newTicket.withdrawalAddressLabel')}</label>
              <input
                type="text"
                value={usdtAddress}
                onChange={(e) => setUsdtAddress(e.target.value)}
                placeholder={t('newTicket.withdrawalAddressPlaceholder')}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('newTicket.withdrawalNetworkLabel')}</label>
              <select
                value={usdtNetwork}
                onChange={(e) => setUsdtNetwork(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
                required
              >
                <option value="TRC20">TRC20 (Tron)</option>
                <option value="BEP-20">BEP-20 (BSC)</option>
                <option value="TON">TON</option>
              </select>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
              <p className="text-blue-300 text-xs">
                {t('newTicket.warningInfo')}
              </p>
            </div>
          </>
        )}

        <div>
          <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('newTicket.messageLabel')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t('newTicket.messagePlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 resize-none placeholder-slate-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !message.trim() || !title.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          {submitting ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <SendIcon />
              {t('newTicket.submit')}
            </>
          )}
        </button>
      </form>
    </div>
  )
}

// ─── Ticket Thread View ───────────────────────────────────────────────────────
function TicketThread({ ticketId, onBack, isStaff }) {
  const { t } = useTranslation('support')
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  const loadTicket = useCallback(async () => {
    try {
      const data = await getTicket(ticketId)
      setTicket(data)
    } catch {
      setError(t('thread.failedLoad'))
    } finally {
      setLoading(false)
    }
  }, [ticketId, t])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket])

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setSending(true)
    setError(null)
    try {
      await replyTicket(ticketId, replyText.trim())
      setReplyText('')
      await loadTicket()
    } catch (err) {
      setError(err?.response?.data?.detail || t('thread.failedReply'))
    } finally {
      setSending(false)
    }
  }

  const handleCloseTicket = async () => {
    if (!window.confirm(t('thread.confirmClose'))) return
    try {
      await updateTicketStatus(ticketId, 'closed')
      await loadTicket()
    } catch (err) {
      setError(err?.response?.data?.detail || t('thread.failedClose'))
    }
  }

  const messages = ticket?.messages || []

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white p-1">
          <BackIcon />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {ticket?.title || `Ticket #${typeof ticketId === 'string' ? ticketId.slice(0, 8) : ticketId}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {ticket && <StatusBadge status={ticket.status} />}
            {ticket?.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                {ticket.category}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && ticket?.status !== 'closed' && (
            <button onClick={handleCloseTicket} className="text-rose-400 text-xs hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10">
              {t('thread.close')}
            </button>
          )}
          <button onClick={loadTicket} className="text-emerald-400 text-xs hover:text-emerald-300">
            {t('thread.refresh')}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">{t('thread.noMessages')}</p>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.sender_role === 'user' || msg.sender === 'user'
            return (
              <div key={msg.id ?? idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 space-y-1 ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-700 text-slate-200 rounded-bl-sm'
                  }`}
                >
                  {!isUser && (
                    <p className="text-xs font-semibold text-emerald-400">
                      {msg.sender_role === 'support' ? t('thread.supportRole') : t('thread.adminRole')}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">{msg.text || ''}</p>
                  <p className={`text-xs ${isUser ? 'text-blue-300' : 'text-slate-500'} text-end`}>
                    {formatDateTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div className="px-4 py-3 bg-slate-800 border-t border-slate-700">
        {error && !loading && (
          <p className="text-red-400 text-xs mb-2">{error}</p>
        )}
        <form onSubmit={handleReply} className="flex items-end gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('thread.replyPlaceholder')}
            rows={2}
            className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 resize-none placeholder-slate-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleReply(e)
              }
            }}
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <SendIcon />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main Support Page ────────────────────────────────────────────────────────
export default function Support() {
  const { t } = useTranslation('support')
  const { user } = useApp()
  const location = useLocation()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'new' | 'thread'
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [initialCategory, setInitialCategory] = useState(null)

  // Support staff filters
  const isStaff = useMemo(() => user?.role === 'admin' || user?.role === 'support', [user?.role])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')

  // Check if we should open withdrawal ticket creation
  useEffect(() => {
    if (location.state?.createWithdrawal) {
      setInitialCategory('withdrawal')
      setView('new')
    }
  }, [location.state])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let data
      if (isStaff) {
        const params = {}
        if (filterStatus) params.status = filterStatus
        if (filterCategory) params.category = filterCategory
        params.sort_by = sortBy
        params.sort_order = sortOrder
        data = await getAllTickets(params)
      } else {
        data = await getMyTickets()
      }
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setError(t('errors.loadFailed'))
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [isStaff, filterStatus, filterCategory, sortBy, sortOrder, t])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  const handleTicketCreated = (ticket) => {
    setSelectedTicketId(ticket.ticket_id)
    setView('thread')
    setInitialCategory(null) // Reset initial category
    loadTickets()
  }

  if (view === 'new') {
    return (
      <NewTicketForm
        onCreated={handleTicketCreated}
        onCancel={() => {
          setView('list')
          setInitialCategory(null)
        }}
        initialCategory={initialCategory}
      />
    )
  }

  if (view === 'thread' && selectedTicketId) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
        <TicketThread
          ticketId={selectedTicketId}
          onBack={() => setView('list')}
          isStaff={isStaff}
        />
      </div>
    )
  }

  // List view
  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{isStaff ? t('header.dashboard') : t('header.title')}</h1>
          <p className="text-slate-400 text-sm">{isStaff ? t('header.manage') : t('header.hereToHelp')}</p>
        </div>
        {!isStaff && (
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <PlusIcon />
            {t('list.new')}
          </button>
        )}
      </div>

      {isStaff && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('list.filterStatusLabel')}</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="">{t('list.filterAll')}</option>
                <option value="open">{t('list.filterOpen')}</option>
                <option value="waiting_for_user">{t('list.filterWaiting')}</option>
                <option value="closed">{t('list.filterClosed')}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('list.filterCategoryLabel')}</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 capitalize"
              >
                <option value="">{t('list.filterAllCategories')}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('list.sortByLabel')}</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="created_at">{t('list.sortByCreated')}</option>
                <option value="updated_at">{t('list.sortByUpdated')}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1.5 font-medium">{t('list.orderLabel')}</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="desc">{t('list.orderNewest')}</option>
                <option value="asc">{t('list.orderOldest')}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))
        ) : tickets.length === 0 ? (
          <div className="bg-slate-800 rounded-xl ring-1 ring-slate-700 p-8 text-center space-y-3">
            <p className="text-slate-400 text-sm">{t('list.noTickets')}</p>
            {!isStaff && (
              <button
                onClick={() => setView('new')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {t('list.openTicket')}
              </button>
            )}
          </div>
        ) : (
          tickets.map((ticket) => {
            return (
              <button
                key={ticket.ticket_id}
                onClick={() => { setSelectedTicketId(ticket.ticket_id); setView('thread') }}
                className="w-full text-start bg-slate-800 rounded-xl ring-1 ring-slate-700 hover:ring-slate-500 p-4 space-y-2 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-medium text-sm">{ticket.title || `Ticket #${ticket.ticket_id?.slice(0, 8)}`}</span>
                  <StatusBadge status={ticket.status} />
                </div>
                {isStaff && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    {ticket.user_telegram_info?.photo_url && (
                      <img
                        src={ticket.user_telegram_info.photo_url}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <span className="font-medium text-slate-300">
                      {[ticket.user_telegram_info?.first_name, ticket.user_telegram_info?.last_name].filter(Boolean).join(' ') || `ID: ${ticket.telegram_id}`}
                    </span>
                    {ticket.user_telegram_info?.username && (
                      <span className="text-slate-500">@{ticket.user_telegram_info.username}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                    {ticket.category}
                  </span>
                  <span className="text-slate-500 text-xs">{formatDateTime(ticket.created_at)}</span>
                </div>
                {ticket.messages?.[0]?.text && (
                  <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">
                    {ticket.messages[0].text.slice(0, 100)}
                  </p>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
