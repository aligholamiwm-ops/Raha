import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: { tab: 'referral' }, pathname: '/profile' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { telegram_id: 12345, referral: { benefit_type: 'usdt', records: [] }, role: 'user' }, plans: [], loading: false, refreshUser: vi.fn() }),
}))

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ lng: 'en', dir: 'ltr' }),
}))

const mockClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('../api/client', () => ({
  default: mockClient,
  createInvoice: vi.fn(),
  createDepositInvoice: vi.fn(),
  getMyLoans: () => Promise.resolve([]),
  payLoan: vi.fn(),
  validateDiscount: vi.fn(),
  getMyTickets: () => Promise.resolve([]),
  getAllTickets: () => Promise.resolve([]),
  createTicket: vi.fn(),
  getTicket: () => Promise.resolve({ messages: [] }),
  replyTicket: vi.fn(),
  updateTicketStatus: vi.fn(),
  checkNickname: () => Promise.resolve({ available: true }),
  updateNickname: vi.fn(),
  getLinks: () => Promise.resolve([]),
  updateMyLanguage: vi.fn(),
}))

import Profile from '../pages/Profile'

describe('ReferralTab', () => {
  it('renders referral header title', () => {
    mockClient.get.mockImplementation((url) => {
      if (url === '/api/v1/users/me/referral-summary') return Promise.resolve({ data: { total_referred_users: 0 } })
      if (url === '/api/v1/users/referral-leaderboard') return Promise.resolve({ data: [] })
      if (url === '/api/v1/users/me/referrals') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    render(<Profile />)
    expect(screen.getByText('Referral Program')).toBeTruthy()
  })

  it('renders referral link card title', () => {
    mockClient.get.mockImplementation((url) => {
      if (url === '/api/v1/users/me/referral-summary') return Promise.resolve({ data: { total_referred_users: 0 } })
      if (url === '/api/v1/users/referral-leaderboard') return Promise.resolve({ data: [] })
      if (url === '/api/v1/users/me/referrals') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    render(<Profile />)
    expect(screen.getByText('Your Referral Link')).toBeTruthy()
  })
})
