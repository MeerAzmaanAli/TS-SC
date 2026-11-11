import { useState, useEffect } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, RequireRole, useAuth } from './lib/auth'
import AdminDashboard from './pages/AdminDashboard'
import EntitiesPage from './pages/admin/EntitiesPage'
import GeneratePage from './pages/admin/GeneratePage'
import InspectPage from './pages/admin/InspectPage'
import PenaltiesPage from './pages/admin/PenaltiesPage'
import TimetablePage from './pages/admin/TimetablePage'
import FacultyView from './pages/FacultyView'
import StudentView from './pages/StudentView'
import Login from './pages/Login'
import { isSupabaseConfigured } from './lib/supabase'
import {
  CalendarIcon,
  LayersIcon,
  SparklesIcon,
  AlertTriangleIcon,
  UsersIcon,
  LogOutIcon,
  BookOpenIcon,
  MenuIcon,
  XIcon,
} from './components/Icons'

function Nav() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Automatically close mobile menu when navigating to another route
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const path = location.pathname

  // The dedicated layouts embed their own topbars
  if (path.startsWith('/admin') || path === '/' || path === '/faculty' || path === '/student') {
    return null
  }

  return (
    <header className="top-navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand-section">
          <div className="brand-icon-box">
            <CalendarIcon size={22} />
          </div>
          <div className="brand-text-box">
            <h1>TS-SC</h1>
            <p>Smart Classroom &amp; Timetable</p>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="desktop-nav">
          <ul className="nav-links">
            {!profile && (
              <li>
                <Link to="/student" className={`nav-link ${path === '/student' ? 'active' : ''}`}>
                  <CalendarIcon size={16} />
                  Student View
                </Link>
              </li>
            )}
            {profile && profile.role === 'admin' && (
              <>
                <li>
                  <Link
                    to="/admin"
                    className={`nav-link ${path === '/admin' || path === '/' ? 'active' : ''}`}
                  >
                    <LayersIcon size={16} />
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/data"
                    className={`nav-link ${path.startsWith('/admin/data') ? 'active' : ''}`}
                  >
                    <BookOpenIcon size={16} />
                    Entities &amp; Data
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/generate"
                    className={`nav-link ${path === '/admin/generate' ? 'active' : ''}`}
                  >
                    <SparklesIcon size={16} />
                    Generator
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/versions"
                    className={`nav-link ${path === '/admin/versions' ? 'active' : ''}`}
                  >
                    <AlertTriangleIcon size={16} />
                    Inspector
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/timetable"
                    className={`nav-link ${path === '/admin/timetable' ? 'active' : ''}`}
                  >
                    <CalendarIcon size={16} />
                    Timetables
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/penalties"
                    className={`nav-link ${path === '/admin/penalties' ? 'active' : ''}`}
                  >
                    <UsersIcon size={16} />
                    Penalties
                  </Link>
                </li>
              </>
            )}

            {profile && profile.role === 'faculty' && (
              <li>
                <Link to="/faculty" className={`nav-link ${path === '/faculty' || path === '/' ? 'active' : ''}`}>
                  <CalendarIcon size={16} />
                  Faculty Portal
                </Link>
              </li>
            )}

            {profile && profile.role === 'student' && (
              <li>
                <Link to="/student" className={`nav-link ${path === '/student' || path === '/' ? 'active' : ''}`}>
                  <CalendarIcon size={16} />
                  My Schedule
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* Desktop User Section */}
        <div className="user-profile-section desktop-only">
          {profile ? (
            <>
              <div className="user-chip">
                <span className={`role-badge ${profile.role}`}>{profile.role}</span>
              </div>
              <button onClick={handleSignOut} className="btn btn-secondary btn-sm" title="Sign out">
                <LogOutIcon size={15} />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            path !== '/login' && (
              <Link to="/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            )
          )}
        </div>

        {/* Mobile Hamburger / Close Button */}
        <button
          className="mobile-toggle-btn"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
        </button>
      </div>

      {/* Mobile Collapsible Navigation Drawer */}
      {mobileOpen && (
        <div className="mobile-nav-drawer">
          {profile && (
            <div className="mobile-user-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={`role-badge ${profile.role}`}>{profile.role}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {profile.faculty_id ? 'Faculty Account' : 'System Administrator'}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center', marginTop: '0.35rem' }}
              >
                <LogOutIcon size={15} />
                <span>Sign out</span>
              </button>
            </div>
          )}

          <ul className="mobile-nav-links">
            {!profile && (
              <li>
                <Link to="/student" className={`mobile-nav-link ${path === '/student' ? 'active' : ''}`}>
                  <CalendarIcon size={18} />
                  <span>Student View</span>
                </Link>
              </li>
            )}
            {profile && profile.role === 'admin' && (
              <>
                <li>
                  <Link to="/admin" className={`mobile-nav-link ${path === '/admin' || path === '/' ? 'active' : ''}`}>
                    <LayersIcon size={18} />
                    <span>Admin Dashboard</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/data" className={`mobile-nav-link ${path.startsWith('/admin/data') ? 'active' : ''}`}>
                    <BookOpenIcon size={18} />
                    <span>Entities &amp; Master Data</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/generate" className={`mobile-nav-link ${path === '/admin/generate' ? 'active' : ''}`}>
                    <SparklesIcon size={18} />
                    <span>Timetable Generator</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/versions" className={`mobile-nav-link ${path === '/admin/versions' ? 'active' : ''}`}>
                    <AlertTriangleIcon size={18} />
                    <span>Version Inspector</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/timetable" className={`mobile-nav-link ${path === '/admin/timetable' ? 'active' : ''}`}>
                    <CalendarIcon size={18} />
                    <span>Timetable Matrix</span>
                  </Link>
                </li>
                <li>
                  <Link to="/admin/penalties" className={`mobile-nav-link ${path === '/admin/penalties' ? 'active' : ''}`}>
                    <UsersIcon size={18} />
                    <span>Penalty Audits</span>
                  </Link>
                </li>
              </>
            )}

            {profile && profile.role === 'faculty' && (
              <li>
                <Link to="/faculty" className={`mobile-nav-link ${path === '/faculty' || path === '/' ? 'active' : ''}`}>
                  <CalendarIcon size={18} />
                  <span>Faculty Academic Portal</span>
                </Link>
              </li>
            )}

            {profile && profile.role === 'student' && (
              <li>
                <Link to="/student" className={`mobile-nav-link ${path === '/student' || path === '/' ? 'active' : ''}`}>
                  <CalendarIcon size={18} />
                  <span>Student Timetable</span>
                </Link>
              </li>
            )}

            {!profile && path !== '/login' && (
              <li style={{ marginTop: '0.5rem' }}>
                <Link to="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  )
}

function Home() {
  const { profile, loading } = useAuth()
  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p className="text-muted">Loading user profile &amp; permissions…</p>
      </div>
    )
  }
  if (!profile) return <Login />
  if (profile.role === 'admin') return <AdminDashboard />
  if (profile.role === 'faculty') return <FacultyView />
  return <StudentView />
}

export default function App() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  if (!isSupabaseConfigured) {
    return (
      <div style={{ maxWidth: 540, margin: '5rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '4px solid #ef4444' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1C1917', marginBottom: '0.5rem' }}>
            Database Environment Variables Required
          </h2>
          <p className="text-muted" style={{ fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
            Vite needs your Supabase project keys during build time. Please configure them in your Vercel project:
          </p>
          <div style={{ background: '#FAFAF9', padding: '0.85rem 1rem', borderRadius: 8, textAlign: 'left', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '1.25rem' }}>
            <div><strong>VITE_SUPABASE_URL</strong> = https://...supabase.co</div>
            <div style={{ marginTop: 4 }}><strong>VITE_SUPABASE_ANON_KEY</strong> = sb_publishable_...</div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#78716C', margin: 0 }}>
            After adding them in <strong>Vercel &rarr; Settings &rarr; Environment Variables</strong>, go to <strong>Deployments &rarr; Redeploy</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <div className="app-layout">
        {!isLoginPage && <Nav />}
        <main className={isLoginPage ? '' : 'main-content'}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Home />} />
            <Route
              path="/admin"
              element={
                <RequireRole roles={['admin']}>
                  <AdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/admin/data"
              element={
                <RequireRole roles={['admin']}>
                  <EntitiesPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/data/:entity"
              element={
                <RequireRole roles={['admin']}>
                  <EntitiesPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/generate"
              element={
                <RequireRole roles={['admin']}>
                  <GeneratePage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/versions"
              element={
                <RequireRole roles={['admin']}>
                  <InspectPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/timetable"
              element={
                <RequireRole roles={['admin']}>
                  <TimetablePage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/penalties"
              element={
                <RequireRole roles={['admin']}>
                  <PenaltiesPage />
                </RequireRole>
              }
            />
            <Route
              path="/faculty"
              element={
                <RequireRole roles={['faculty']}>
                  <FacultyView />
                </RequireRole>
              }
            />
            <Route path="/student" element={<StudentView />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  )
}
