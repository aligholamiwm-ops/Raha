import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, clearReadNotifications } from '../api/client'
import { useApp } from './AppContext'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { user } = useApp()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)
  const pendingReadsRef = useRef(new Set())
  const recentlyReadRef = useRef(new Set())
  const notificationsRef = useRef([])

  const fetchList = useCallback(async (stateFilter) => {
    if (!user || pendingReadsRef.current.size > 0) return
    setLoading(true)
    setError(null)
    try {
      const params = { limit: 50 }
      if (stateFilter) params.state = stateFilter
      const data = await getMyNotifications(params)
      const incoming = data.notifications || []
      // A fetch that was in-flight before a mark-read PUT committed may return
      // a stale "unread" state. Don't let it revert a notification we just
      // marked read locally.
      const recent = recentlyReadRef.current
      const merged = recent.size > 0
        ? incoming.map(n =>
            recent.has(n.notification_id)
              ? { ...n, state: 'read', read_at: n.read_at || new Date().toISOString() }
              : n
          )
        : incoming
      const staleRecentUnread = incoming.filter(
        n => recent.has(n.notification_id) && n.state === 'unread'
      ).length
      notificationsRef.current = merged
      setNotifications(merged)
      setUnreadCount(Math.max(0, (data.unread_count || 0) - staleRecentUnread))
      setTotal(data.total || 0)
    } catch (_e) {
      setError('Failed to load notifications')
      notificationsRef.current = []
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [user])

  const markRead = useCallback(async (id) => {
    if (recentlyReadRef.current.has(id)) return
    const current = notificationsRef.current.find(n => n.notification_id === id)
    const wasUnread = current?.state === 'unread'
    recentlyReadRef.current.add(id)
    pendingReadsRef.current.add(id)
    const readAt = new Date().toISOString()
    if (wasUnread) {
      const next = notificationsRef.current.map(n =>
        n.notification_id === id ? { ...n, state: 'read', read_at: readAt } : n
      )
      notificationsRef.current = next
      setNotifications(next)
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    try {
      await markNotificationRead(id)
    } catch (e) {
      console.error('Failed to mark notification read', e)
      recentlyReadRef.current.delete(id)
      if (wasUnread) {
        const reverted = notificationsRef.current.map(n =>
          n.notification_id === id
            ? { ...n, state: 'unread', read_at: n.read_at || null }
            : n
        )
        notificationsRef.current = reverted
        setNotifications(reverted)
        setUnreadCount(prev => prev + 1)
      }
    } finally {
      pendingReadsRef.current.delete(id)
      // Keep the override for a short window so a stale fetch (started before
      // the PUT committed) cannot revert it to unread.
      setTimeout(() => recentlyReadRef.current.delete(id), 60000)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, state: 'read', read_at: n.read_at || new Date().toISOString() })))
      setUnreadCount(0)
    } catch (e) {
      console.error('Failed to mark all read', e)
    }
  }, [])

  const removeNotification = useCallback(async (id) => {
    try {
      await deleteNotification(id)
      const removed = notifications.find(n => n.notification_id === id)
      setNotifications(prev => prev.filter(n => n.notification_id !== id))
      if (removed?.state === 'unread') {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
      setTotal(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('Failed to delete notification', e)
    }
  }, [notifications])

  const clearRead = useCallback(async () => {
    try {
      await clearReadNotifications()
      setNotifications(prev => prev.filter(n => n.state === 'unread'))
      setTotal(() => {
        const remaining = notifications.filter(n => n.state === 'unread').length
        return remaining
      })
    } catch (e) {
      console.error('Failed to clear read notifications', e)
    }
  }, [notifications])

  useEffect(() => {
    if (user) {
      fetchList()
    }
  }, [user, fetchList])

  useEffect(() => {
    if (!user) return
    pollRef.current = setInterval(() => {
      fetchList()
    }, 30000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user, fetchList])

  // Keep notificationsRef in sync with state so markRead can read the latest
  // committed state synchronously (covers paths that use functional updaters).
  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        total,
        loading,
        error,
        fetchList,
        markRead,
        markAllRead,
        removeNotification,
        clearRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
