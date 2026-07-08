import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LanguageSelector from '../components/LanguageSelector'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'

const mockChangeLanguage = vi.fn()
const mockOnClose = vi.fn()

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ changeLanguage: mockChangeLanguage, lng: 'en', dir: 'ltr' }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'languageSelector.title': 'Choose your language',
        'languageSelector.subtitle': 'You can change this later in your profile settings.',
      }
      return map[key] || key
    },
  }),
}))

describe('LanguageSelector', () => {
  it('renders one button per supported language', () => {
    render(<LanguageSelector onClose={mockOnClose} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(SUPPORTED_LANGUAGES.length)
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(screen.getAllByText(lang.nativeName).length).toBeGreaterThan(0)
    })
  })

  it('calls changeLanguage and onClose when a language is clicked', () => {
    render(<LanguageSelector onClose={mockOnClose} />)
    const buttons = screen.getAllByRole('button')
    const firstLang = SUPPORTED_LANGUAGES[0]
    fireEvent.click(buttons[0])
    expect(mockChangeLanguage).toHaveBeenCalledWith(firstLang.code)
    expect(mockOnClose).toHaveBeenCalled()
  })
})
