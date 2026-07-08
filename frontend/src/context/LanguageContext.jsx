import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import i18n from '../i18n'
import { getLangMeta, DEFAULT_LANGUAGE } from '../i18n/languages'
import { useApp } from './AppContext'
import { updateMyLanguage } from '../api/client'

const LanguageContext = createContext(null)

function applyDomEffects(lng, meta) {
  document.documentElement.lang = lng
  document.documentElement.dir = meta.dir
  document.body.classList.remove('font-en', 'font-fa')
  document.body.classList.add(meta.fontClass)
}

export function LanguageProvider({ children }) {
  const { user } = useApp()
  const [lng, setLng] = useState(() => i18n.language || DEFAULT_LANGUAGE)
  const [meta, setMeta] = useState(() => getLangMeta(lng))
  const changingRef = useRef(false)

  useEffect(() => {
    applyDomEffects(lng, meta)
  }, [lng, meta])

  const changeLanguage = useCallback(async (code) => {
    const resolvedMeta = getLangMeta(code)
    await i18n.changeLanguage(code)
    changingRef.current = true
    setLng(code)
    setMeta(resolvedMeta)
    applyDomEffects(code, resolvedMeta)
    localStorage.setItem('raha.lang', code)
    if (user) {
      updateMyLanguage(code).catch(() => {})
    }
    setTimeout(() => { changingRef.current = false }, 0)
  }, [user])

  const applyServerLanguage = useCallback((code) => {
    const resolvedMeta = getLangMeta(code)
    if (code !== lng && !changingRef.current) {
      i18n.changeLanguage(code)
      setLng(code)
      setMeta(resolvedMeta)
      applyDomEffects(code, resolvedMeta)
      localStorage.setItem('raha.lang', code)
    }
  }, [lng])

  useEffect(() => {
    if (user && user.language && user.language !== lng && !changingRef.current) {
      applyServerLanguage(user.language)
    }
  }, [user, lng, applyServerLanguage])

  return (
    <LanguageContext.Provider value={{ lng, dir: meta.dir, meta, changeLanguage, applyServerLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
