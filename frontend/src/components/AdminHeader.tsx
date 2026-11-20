import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { SparklesIcon, LogOutIcon, RefreshIcon } from './Icons'

export type AdminDashboardTab = 'overview' | 'shifts' | 'access' | 'faculty-auth' | 'developer'

interface AdminHeaderProps {
  activeTab?: AdminDashboardTab
  onTabChange?: (tab: AdminDashboardTab) => void
  onRefresh?: () => void
}

export default function AdminHeader({ activeTab, onTabChange, onRefresh }: AdminHeaderProps = {}) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname
  const isHomeRoute = path === '/admin' || path === '/'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function renderTabButton(tab: AdminDashboardTab, label: string) {
    const isActive = isHomeRoute && (activeTab ? activeTab === tab : tab === 'overview')
    if (isHomeRoute && onTabChange) {
      return (
        <button
          type="button"
          className={isActive ? 'on' : ''}
          onClick={() => onTabChange(tab)}
        >
          {label}
        </button>
      )
    }
    const targetUrl = tab === 'overview' ? '/admin' : `/admin?tab=${tab}`
    return (
      <Link to={targetUrl} className={isActive ? 'on' : ''}>
        {label}
      </Link>
    )
  }

  return (
    <header className="admin-cal-topbar">
      <div className="admin-cal-brand-wrap">
        <Link to="/admin" className="admin-cal-brand" style={{ textDecoration: 'none' }}>
          <div className="admin-cal-logo" title="Timetable Scheduler & Smart Classroom">
            TS
          </div>
          <div className="admin-role-badge">
            <span className="admin-role-dot"></span>
            <span>Admin</span>
          </div>
        </Link>
      </div>

      <nav className="admin-cal-nav" aria-label="Admin Navigation">
        {renderTabButton('overview', 'Overview')}
        <Link to="/admin/search" className={path === '/admin/search' ? 'on' : ''}>
          Institutional Search
        </Link>
        {renderTabButton('shifts', 'Shifts & Timings')}
        <Link to="/admin/timetable" className={path === '/admin/timetable' ? 'on' : ''}>
          Timetables
        </Link>
        <Link to="/admin/generate" className={path === '/admin/generate' ? 'on' : ''}>
          Generator
        </Link>
        <Link to="/admin/versions" className={path === '/admin/versions' ? 'on' : ''}>
          Conflicts
        </Link>
        <Link to="/admin/penalties" className={path === '/admin/penalties' ? 'on' : ''}>
          Substitutions
        </Link>
        <Link to="/admin/data" className={path.startsWith('/admin/data') ? 'on' : ''}>
          Data
        </Link>
        {renderTabButton('access', 'Access & Passkeys')}
        {renderTabButton('faculty-auth', 'Faculty Logins')}
        {renderTabButton('developer', 'Developer Settings')}
      </nav>

      <div className="admin-cal-topbar-actions">
        {onRefresh && (
          <button
            type="button"
            className="admin-btn admin-btn-outline admin-btn-sm"
            onClick={onRefresh}
            title="Refresh dashboard data"
          >
            <RefreshIcon size={14} />
            <span className="admin-btn-text">Refresh</span>
          </button>
        )}
        <Link to="/admin/generate" className="admin-btn admin-btn-primary admin-btn-sm">
          <SparklesIcon size={14} />
          <span className="admin-btn-text">Generate timetable</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="admin-btn admin-btn-outline admin-btn-sm"
          title="Sign out of Admin Dashboard"
        >
          <LogOutIcon size={14} />
          <span className="admin-btn-text">Sign out</span>
        </button>
      </div>
    </header>
  )
}

