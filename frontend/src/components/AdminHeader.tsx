import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { SparklesIcon, LogOutIcon } from './Icons'

export default function AdminHeader() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="admin-cal-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/admin" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="admin-cal-logo" title="Timetable Scheduler & Smart Classroom">
            TS
          </div>
          <div className="admin-role-badge">
            <span className="admin-role-dot"></span>
            <span>Admin</span>
          </div>
        </Link>

        <div className="admin-cal-nav">
          <Link to="/admin" className={path === '/admin' || path === '/' ? 'on' : ''}>
            Overview
          </Link>
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
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {path !== '/admin/generate' && (
          <Link to="/admin/generate" className="admin-btn">
            <SparklesIcon size={16} />
            <span>Generate timetable</span>
          </Link>
        )}
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

