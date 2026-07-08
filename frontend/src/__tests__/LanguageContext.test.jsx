import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LanguageProvider, useLanguage } from '../context/LanguageContext'

vi.mock('../api/client', () => ({
  updateMyLanguage: () => Promise.resolve(),
}))

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: null }),
}))

function TestConsumer() {
  const { lng, dir, meta, changeLanguage } = useLanguage()
  return (
    <div>
      <span data-testid="lng">{lng}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="fontClass">{meta.fontClass}</span>
      <button data-testid="switch-to-fa" onClick={() => changeLanguage('fa')}>To Fa</button>
      <button data-testid="switch-to-en" onClick={() => changeLanguage('en')}>To En</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <LanguageProvider>
      <TestConsumer />
    </LanguageProvider>
  )
}

describe('LanguageContext', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = ''
    document.documentElement.dir = ''
    document.body.className = ''
  })

  it('default language is en when localStorage empty', () => {
    renderWithProvider()
    expect(screen.getByTestId('lng').textContent).toBe('en')
    expect(screen.getByTestId('dir').textContent).toBe('ltr')
    expect(screen.getByTestId('fontClass').textContent).toBe('font-en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('changeLanguage to fa updates DOM and localStorage', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-to-fa'))
    })
    expect(screen.getByTestId('lng').textContent).toBe('fa')
    expect(screen.getByTestId('dir').textContent).toBe('rtl')
    expect(document.documentElement.lang).toBe('fa')
    expect(document.documentElement.dir).toBe('rtl')
    expect(localStorage.getItem('raha.lang')).toBe('fa')
  })

  it('changeLanguage back to en restores ltr', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-to-fa'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-to-en'))
    })
    expect(screen.getByTestId('lng').textContent).toBe('en')
    expect(screen.getByTestId('dir').textContent).toBe('ltr')
    expect(document.documentElement.dir).toBe('ltr')
    expect(localStorage.getItem('raha.lang')).toBe('en')
  })
})
