import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLanguage = { language: 'en' }

vi.mock('../i18n', () => ({
  default: mockLanguage,
  __esModule: true,
}))

vi.mock('jalaali-js', () => ({
  toJalaali: () => ({ jY: 1403, jM: 4, jD: 15 }),
}))

describe('dates', () => {
  beforeEach(() => {
    mockLanguage.language = 'en'
    vi.resetModules()
  })

  it('formatDate with lng en returns Gregorian format', async () => {
    mockLanguage.language = 'en'
    const { formatDate } = await import('../utils/dates')
    const result = formatDate('2024-07-05T12:00:00Z')
    expect(result).toContain('Jul')
    expect(result).toContain('5')
  })

  it('formatDate with lng fa returns Shamsi format', async () => {
    mockLanguage.language = 'fa'
    const { formatDate } = await import('../utils/dates')
    const result = formatDate('2024-07-05T12:00:00Z')
    expect(result).toContain('1403')
    expect(result).toContain('4')
    expect(result).toContain('15')
  })

  it('handles invalid timestamp gracefully', async () => {
    const { formatDate } = await import('../utils/dates')
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
  })
})
