import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { SparklesIcon, LogOutIcon, RefreshIcon } from './Icons'

export type AdminDashboardTab = 'overview' | 'shifts' | 'access' | 'faculty-auth'

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
    <div className="admin-cal-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/admin" className="admin-cal-brand" style={{ textDecoration: 'none' }}>
          <div className="admin-cal-logo" title="Timetable Scheduler & Smart Classroom">
            TS
          </div>
          <div className="admin-role-badge">
            <span className="admin-role-dot"></span>
            <span>Admin</span>
          </div>
        </Link>

        <div className="admin-cal-nav">
          {renderTabButton('overview', 'Overview')}
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
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {onRefresh && (
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            onClick={onRefresh}
            title="Refresh dashboard data"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
        )}
        <Link to="/admin/generate" className="admin-btn admin-btn-primary">
          <SparklesIcon size={16} />
          <span>Generate timetable</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="admin-btn admin-btn-outline"
          title="Sign out of Admin Dashboard"
        >
          <LogOutIcon size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )
}

