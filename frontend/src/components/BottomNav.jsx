import React from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
)
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

export default function BottomNav() {
  const { user } = useApp();
  
  const tabs = [
    { to: '/', label: 'Dashboard', Icon: GridIcon },
    { to: '/referral', label: 'Referral', Icon: UsersIcon },
    { to: '/profile', label: 'Profile', Icon: ProfileIcon },
  ];

  const isAdmin = user?.role?.toLowerCase() === 'admin';
  if (isAdmin) {
    tabs.push({ to: '/admin', label: 'Admin', Icon: ShieldIcon });
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full bg-slate-800 border-t border-slate-700 z-50"
      style={{ maxWidth: 480, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            <Icon />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
