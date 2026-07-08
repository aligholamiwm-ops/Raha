import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getUser, getMyConfigs, getPlans } from '../api/client'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { t } = useTranslation()
  const [user, setUser] = useState(null)
  const [configs, setConfigs] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [configsError, setConfigsError] = useState(null)

  const fetchUser = useCallback(async () => {
    try {
      const data = await getUser()
      setUser(data)
      return data
    } catch (e) {
      setError(t('errors.failedLoadProfile', { ns: 'common' }))
      return null
    }
  }, [t])

  const fetchConfigs = useCallback(async () => {
    setConfigsError(null)
    try {
      const data = await getMyConfigs()
      setConfigs(Array.isArray(data) ? data : [])
      return data
    } catch (e) {
      const detail = e.response?.data?.detail || e.message || t('errors.failedLoadConfigs', { ns: 'common' })
      setConfigsError(detail)
      setConfigs([])
      return []
    }
  }, [t])

  const fetchPlans = useCallback(async () => {
    try {
      const data = await getPlans()
      setPlans(Array.isArray(data) ? data : [])
      return data
    } catch (e) {
      setPlans([])
      return []
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.allSettled([fetchUser(), fetchConfigs(), fetchPlans()])
    setLoading(false)
  }, [fetchUser, fetchConfigs, fetchPlans])

  const checkTelegram = useCallback(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) {
      setError(t('accessRestricted.openFromTelegram', { ns: 'onboarding' }))
      setLoading(false)
      return false
    }
    return true
  }, [t])

  useEffect(() => {
    if (checkTelegram()) {
      refreshAll()
    }
  }, [checkTelegram, refreshAll])

  return (
    <AppContext.Provider
      value={{
        user,
        configs,
        plans,
        loading,
        error,
        configsError,
        setConfigsError,
        setConfigs,
        refreshUser: fetchUser,
        refreshConfigs: fetchConfigs,
        refreshPlans: fetchPlans,
        refreshAll,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
