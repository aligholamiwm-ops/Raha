import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NotificationsProvider } from '../context/NotificationsContext'

vi.mock('../api/client', () => ({
  getMyNotifications: vi.fn().mockResolvedValue({ notifications: [], unread_count: 0, total: 0 }),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
  clearReadNotifications: vi.fn(),
}))

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 1, username: 'test' } }),
}))

describe('NotificationsProvider', () => {
  it('renders children', () => {
    render(
      <NotificationsProvider>
        <div data-testid="child">Hello</div>
      </NotificationsProvider>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('Hello')
  })
})
