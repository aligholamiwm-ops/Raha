import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'

const mockChangeLanguage = vi.fn()

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ lng: 'en', changeLanguage: mockChangeLanguage }),
}))

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { telegram_id: 1, nickname: 'test', telegram_info: { first_name: 'Test' }, role: 'user' }, plans: [], loading: false, refreshUser: vi.fn() }),
}))

vi.mock('../api/client', () => ({
  checkNickname: () => Promise.resolve({ available: true }),
  updateNickname: () => Promise.resolve(),
  getLinks: () => Promise.resolve([]),
  getMyTickets: () => Promise.resolve([]),
  getTicket: () => Promise.resolve({ messages: [] }),
  replyTicket: () => Promise.resolve(),
  createTicket: () => Promise.resolve({}),
  updateTicketStatus: () => Promise.resolve(),
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: { tab: 'me' }, pathname: '/profile' }),
  useNavigate: () => mockNavigate,
}))

import Profile from '../pages/Profile'

describe('MeTab Language Card', () => {
  it('renders Language label', () => {
    render(<Profile />)
    expect(screen.getByText('Language')).toBeTruthy()
  })

  it('renders language select with supported language options', () => {
    render(<Profile />)
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(screen.getByText(lang.nativeName)).toBeTruthy()
    })
  })
})
