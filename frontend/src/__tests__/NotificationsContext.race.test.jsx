import { render, waitFor, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationsProvider, useNotifications } from '../context/NotificationsContext'

const getMyNotifications = vi.fn()
const markNotificationRead = vi.fn()
const markAllNotificationsRead = vi.fn()
const deleteNotification = vi.fn()
const clearReadNotifications = vi.fn()

vi.mock('../api/client', () => ({
  getMyNotifications: (...a) => getMyNotifications(...a),
  markNotificationRead: (...a) => markNotificationRead(...a),
  markAllNotificationsRead: (...a) => markAllNotificationsRead(...a),
  deleteNotification: (...a) => deleteNotification(...a),
  clearReadNotifications: (...a) => clearReadNotifications(...a),
}))

vi.mock('../context/AppContext', () => {
  const user = { id: 1, username: 'test' }
  return { useApp: () => ({ user }) }
})

const captured = {}
function Consumer() {
  Object.assign(captured, useNotifications())
  return null
}

function renderProvider() {
  return render(
    <NotificationsProvider>
      <Consumer />
    </NotificationsProvider>
  )
}

describe('NotificationsProvider read-state race', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(captured)) delete captured[k]
  })

  afterEach(() => {
    cleanup()
  })

  it('marks read optimistically and does not revert on a stale fetch', async () => {
    const notif = {
      notification_id: 'n1',
      title: 'T',
      message: 'M',
      category: 'announcement',
      state: 'unread',
      created_at: new Date().toISOString(),
    }
    getMyNotifications.mockResolvedValue({
      notifications: [notif],
      unread_count: 1,
      total: 1,
    })
    markNotificationRead.mockResolvedValue({ state: 'read' })

    renderProvider()

    await waitFor(() => expect(captured.notifications).toHaveLength(1))
    expect(captured.notifications[0].state).toBe('unread')
    expect(captured.unreadCount).toBe(1)

    // markRead: optimistic flip + API call
    await act(async () => {
      await captured.markRead('n1')
    })
    expect(markNotificationRead).toHaveBeenCalledWith('n1')
    expect(captured.notifications[0].state).toBe('read')
    expect(captured.unreadCount).toBe(0)

    // Simulate a stale fetch that still reports the notification as unread
    getMyNotifications.mockResolvedValue({
      notifications: [{ ...notif, state: 'unread' }],
      unread_count: 1,
      total: 1,
    })

    await act(async () => {
      await captured.fetchList()
    })

    // Must NOT revert to unread
    expect(captured.notifications[0].state).toBe('read')
    expect(captured.unreadCount).toBe(0)
  })

  it('rolls back to unread when the mark-read API fails', async () => {
    const notif = {
      notification_id: 'n2',
      title: 'T',
      message: 'M',
      category: 'announcement',
      state: 'unread',
      created_at: new Date().toISOString(),
    }
    getMyNotifications.mockResolvedValue({
      notifications: [notif],
      unread_count: 1,
      total: 1,
    })
    markNotificationRead.mockRejectedValue(new Error('boom'))

    renderProvider()
    await waitFor(() => expect(captured.notifications).toHaveLength(1))

    await act(async () => {
      await captured.markRead('n2')
    })

    expect(captured.notifications[0].state).toBe('unread')
    expect(captured.unreadCount).toBe(1)
  })
})
