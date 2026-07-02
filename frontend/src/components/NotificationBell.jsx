import React, { useState, useEffect, useRef } from 'react'
import { FiBell, FiCheck, FiX, FiTrash2, FiRadio, FiArrowDown, FiArrowUp, FiCreditCard, FiShoppingCart, FiUsers, FiMessageSquare, FiClock } from 'react-icons/fi'
import { useNotifications } from '../context/NotificationsContext'

const CATEGORY_ICONS = {
  announcement:    { icon: FiRadio,       color: 'text-violet-400' },
  deposit:         { icon: FiArrowDown,   color: 'text-emerald-400' },
  withdraw:        { icon: FiArrowUp,     color: 'text-amber-400' },
  loan_allocated:  { icon: FiCreditCard,  color: 'text-rose-400' },
  loan_settled:    { icon: FiCreditCard,  color: 'text-emerald-400' },
  plan_purchased:  { icon: FiShoppingCart, color: 'text-blue-400' },
  referral_bonus:  { icon: FiUsers,       color: 'text-cyan-400' },
  support_replied: { icon: FiMessageSquare, color: 'text-indigo-400' },
  ticket_status:   { icon: FiMessageSquare, color: 'text-slate-400' },
}

const DEFAULT_ICON = { icon: FiBell, color: 'text-slate-400' }

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, fetchList, markRead, markAllRead, removeNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const [detailNotif, setDetailNotif] = useState(null)
  const bellRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target) &&
          panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next) fetchList()
  }

  const handleRowClick = (notif) => {
    setDetailNotif(notif)
    if (notif.state === 'unread') {
      markRead(notif.notification_id)
    }
  }

  return (
    <>
      <div ref={bellRef} className="relative">
        <button
          onClick={handleToggle}
          className="p-2 text-gray-400 hover:text-white rounded-icon-btn hover:bg-white/5 transition-all active:scale-[0.98] relative"
        >
          <FiBell size={16} />
          {unreadCount > 0 && (
            <>
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
              <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </>
          )}
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          className="fixed top-12 left-1/2 -translate-x-1/2 w-[calc(100%-16px)] max-w-[440px] max-h-[60vh] bg-dark-card border border-white/10 rounded-2xl shadow-2xl z-[200] flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
            <h3 className="text-white font-bold text-sm">
              Notifications
              {unreadCount > 0 && <span className="text-rose-400 ml-1.5 text-[11px]">({unreadCount} new)</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 disabled:cursor-not-allowed font-semibold"
              >
                Mark all read
              </button>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-white transition-colors">
                <FiX size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <FiBell size={28} className="mb-2 opacity-50" />
                <p className="text-xs">No notifications yet</p>
              </div>
            )}

            {notifications.length > 0 && (
              <div className="divide-y divide-white/5">
                {notifications.map((n) => {
                  const iconDef = CATEGORY_ICONS[n.category] || DEFAULT_ICON
                  const Icon = iconDef.icon
                  const isUnread = n.state === 'unread'
                  return (
                    <button
                      key={n.notification_id}
                      onClick={() => handleRowClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-start gap-3 ${
                        isUnread ? 'border-l-2 border-emerald-500' : 'opacity-70'
                      }`}
                    >
                      <div className={`mt-0.5 ${isUnread ? iconDef.color : 'text-slate-500'}`}>
                        <Icon size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-semibold truncate ${isUnread ? 'text-white' : 'text-slate-400'}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FiClock size={9} className="text-slate-600" />
                          <span className="text-[9px] text-slate-600">{relativeTime(n.created_at)}</span>
                          {n.severity && (
                            <span className={`text-[8px] font-semibold uppercase ${
                              n.severity === 'success' ? 'text-emerald-500' :
                              n.severity === 'warning' ? 'text-amber-500' :
                              n.severity === 'error' ? 'text-rose-500' :
                              'text-slate-500'
                            }`}>
                              {n.severity}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeNotification(n.notification_id) }}
                        className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Delete"
                      >
                        <FiX size={12} />
                      </button>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {detailNotif && (
        <NotificationDetail
          notification={detailNotif}
          onClose={() => setDetailNotif(null)}
          onDelete={(id) => {
            removeNotification(id)
            setDetailNotif(null)
          }}
        />
      )}
    </>
  )
}

function NotificationDetail({ notification, onClose, onDelete }) {
  const { markRead } = useNotifications()
  const iconDef = CATEGORY_ICONS[notification.category] || DEFAULT_ICON
  const Icon = iconDef.icon

  const handleMarkRead = async () => {
    await markRead(notification.notification_id)
    notification.state = 'read'
  }

  const metaLines = []
  if (notification.metadata) {
    const m = notification.metadata
    if (m.amount_usd) metaLines.push(`Amount: $${m.amount_usd}`)
    if (m.traffic_gb) metaLines.push(`Traffic: ${m.traffic_gb} GB`)
    if (m.plan_name) metaLines.push(`Plan: ${m.plan_name}`)
    if (m.loan_id) metaLines.push(`Loan ID: ${m.loan_id}`)
    if (m.ticket_id) metaLines.push(`Ticket: ${m.ticket_id}`)
    if (m.layer) metaLines.push(`Referral layer: ${m.layer}`)
    if (m.payment_method) metaLines.push(`Method: ${m.payment_method}`)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] px-6" onClick={onClose}>
      <div
        className="bg-dark-card border border-white/10 rounded-2xl p-5 w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notification.state === 'unread' ? 'bg-emerald-500/10' : 'bg-slate-800'}`}>
              <Icon size={18} className={notification.state === 'unread' ? iconDef.color : 'text-slate-500'} />
            </div>
            <div>
              <h3 className="text-white font-bold text-[15px]">{notification.title}</h3>
              <p className="text-[10px] text-slate-500">
                {new Date(notification.created_at).toLocaleString()}
                {notification.severity && (
                  <span className={`ml-2 font-semibold ${
                    notification.severity === 'success' ? 'text-emerald-500' :
                    notification.severity === 'warning' ? 'text-amber-500' :
                    notification.severity === 'error' ? 'text-rose-500' :
                    'text-slate-500'
                  }`}>
                    · {notification.severity.toUpperCase()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <FiX size={18} />
          </button>
        </div>

        <div className="bg-white/[0.03] rounded-xl p-3.5">
          <p className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
            {notification.message}
          </p>
        </div>

        {metaLines.length > 0 && (
          <div className="bg-white/[0.03] rounded-xl p-3.5 space-y-1">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Details</p>
            {metaLines.map((line, i) => (
              <div key={i} className="text-[12px] text-slate-400">{line}</div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {notification.state === 'unread' && (
            <button
              onClick={handleMarkRead}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <FiCheck size={14} />
              Mark as read
            </button>
          )}
          <button
            onClick={() => onDelete(notification.notification_id)}
            className="py-2.5 bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 font-semibold rounded-xl text-xs transition-colors px-4"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
