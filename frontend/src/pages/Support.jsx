import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getMyTickets, createTicket, getTicket, replyTicket } from '../api/client'

const CATEGORIES = ['Technical Issue', 'Billing', 'Order', 'General']

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const styles = {
    open: 'bg-emerald-500/20 text-emerald-400',
    closed: 'bg-slate-600/50 text-slate-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    answered: 'bg-blue-500/20 text-blue-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.open}`}>
      {status || 'open'}
    </span>
  )
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
function NewTicketForm({ onCreated, onCancel }) {
  const [category, setCategory] = useState(CATEGORIES[0])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const fullMessage = `[${category}] ${message.trim()}`
      const ticket = await createTicket(fullMessage)
      onCreated(ticket)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create ticket')
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
        <h2 className="text-white font-semibold text-base">New Ticket</h2>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-400 text-xs mb-1.5 font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 text-xs mb-1.5 font-medium">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Describe your issue in detail..."
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 resize-none placeholder-slate-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !message.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium text-sm py-3 rounded-xl transition-colors"
        >
          {submitting ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <SendIcon />
              Submit Ticket
            </>
          )}
        </button>
      </form>
    </div>
  )
}

// ─── Ticket Thread View ───────────────────────────────────────────────────────
function TicketThread({ ticketId, onBack }) {
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
      setError('Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

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
      setError(err?.response?.data?.detail || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const messages = ticket?.messages || (ticket?.replies ? [
    { id: 0, text: ticket.initial_message || '', sender: 'user', created_at: ticket.created_at },
    ...ticket.replies.map((r) => ({ ...r, sender: r.is_admin ? 'admin' : 'user' })),
  ] : [])

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white p-1">
          <BackIcon />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            Ticket #{ticketId}
          </p>
          {ticket && <StatusBadge status={ticket.status} />}
        </div>
        <button onClick={loadTicket} className="text-emerald-400 text-xs hover:text-emerald-300">
          Refresh
        </button>
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
          <p className="text-slate-500 text-sm text-center py-8">No messages</p>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.sender === 'user' || msg.is_user || (!msg.is_admin)
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
                    <p className="text-xs font-semibold text-emerald-400">Support</p>
                  )}
                  <p className="text-sm leading-relaxed">{msg.text || msg.message || ''}</p>
                  <p className={`text-xs ${isUser ? 'text-blue-300' : 'text-slate-500'} text-right`}>
                    {formatDate(msg.created_at)}
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
            placeholder="Type a reply..."
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
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'new' | 'thread'
  const [selectedTicketId, setSelectedTicketId] = useState(null)

  const loadTickets = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyTickets()
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load tickets')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [])

  const handleTicketCreated = (ticket) => {
    setSelectedTicketId(ticket.id)
    setView('thread')
    loadTickets()
  }

  if (view === 'new') {
    return (
      <NewTicketForm
        onCreated={handleTicketCreated}
        onCancel={() => setView('list')}
      />
    )
  }

  if (view === 'thread' && selectedTicketId) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
        <TicketThread
          ticketId={selectedTicketId}
          onBack={() => setView('list')}
        />
      </div>
    )
  }

  // List view
  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Support</h1>
          <p className="text-slate-400 text-sm">We're here to help</p>
        </div>
        <button
          onClick={() => setView('new')}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <PlusIcon />
          New Ticket
        </button>
      </div>

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
            <p className="text-slate-400 text-sm">No tickets yet</p>
            <button
              onClick={() => setView('new')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Open a Ticket
            </button>
          </div>
        ) : (
          tickets.map((ticket) => {
            const preview = ticket.initial_message
              ? ticket.initial_message.replace(/^\[.*?\]\s*/, '').slice(0, 80)
              : 'No message'
            return (
              <button
                key={ticket.id}
                onClick={() => { setSelectedTicketId(ticket.id); setView('thread') }}
                className="w-full text-left bg-slate-800 rounded-xl ring-1 ring-slate-700 hover:ring-slate-500 p-4 space-y-2 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-medium text-sm">Ticket #{ticket.id}</span>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{preview}</p>
                <p className="text-slate-500 text-xs">{formatDate(ticket.created_at)}</p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
