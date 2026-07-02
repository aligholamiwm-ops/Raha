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

  const fetchList = useCallback(async (stateFilter) => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const params = { limit: 50 }
      if (stateFilter) params.state = stateFilter
      const data = await getMyNotifications(params)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
      setTotal(data.total || 0)
    } catch (_e) {
      setError('Failed to load notifications')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [user])

  const markRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev =>
        prev.map(n =>
          n.notification_id === id
            ? { ...n, state: 'read', read_at: new Date().toISOString() }
            : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('Failed to mark notification read', e)
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
