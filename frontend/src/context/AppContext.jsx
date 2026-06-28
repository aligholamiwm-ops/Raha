import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getUser, getMyConfigs, getPlans } from '../api/client'

const AppContext = createContext(null)

export function AppProvider({ children }) {
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
      setError('Failed to load user profile')
      return null
    }
  }, [])

  const fetchConfigs = useCallback(async () => {
    setConfigsError(null)
    try {
      const data = await getMyConfigs()
      setConfigs(Array.isArray(data) ? data : [])
      return data
    } catch (e) {
      const detail = e.response?.data?.detail || e.message || 'Failed to load configs'
      setConfigsError(detail)
      setConfigs([])
      return []
    }
  }, [])

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

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) {
      setError('Please open this app from Telegram.')
      setLoading(false)
      return
    }
    refreshAll()
  }, [refreshAll])

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
