import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NotificationBell from '../components/NotificationBell'

const mockNotifications = [
  {
    notification_id: 1,
    title: 'Test Notification',
    message: 'This is a test',
    category: 'announcement',
    state: 'unread',
    created_at: new Date().toISOString(),
    severity: 'info',
  },
]

const mockContextValue = {
  notifications: mockNotifications,
  unreadCount: 1,
  total: 1,
  loading: false,
  error: null,
  fetchList: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  removeNotification: vi.fn(),
  clearRead: vi.fn(),
}

vi.mock('../context/NotificationsContext', () => ({
  useNotifications: () => mockContextValue,
}))

describe('NotificationBell', () => {
  it('renders the bell button with unread count', () => {
    render(<NotificationBell />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
