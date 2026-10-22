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
import {
  CalendarIcon,
  LayersIcon,
  SparklesIcon,
  AlertTriangleIcon,
  UsersIcon,
  LogOutIcon,
  BookOpenIcon,
} from './components/Icons'

function Nav() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const path = location.pathname

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

        {profile && (
          <nav>
            <ul className="nav-links">
              {profile.role === 'admin' && (
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

              {profile.role === 'faculty' && (
                <li>
                  <Link to="/faculty" className={`nav-link ${path === '/faculty' || path === '/' ? 'active' : ''}`}>
                    <CalendarIcon size={16} />
                    Faculty Portal
                  </Link>
                </li>
              )}

              {profile.role === 'student' && (
                <li>
                  <Link to="/student" className={`nav-link ${path === '/student' || path === '/' ? 'active' : ''}`}>
                    <CalendarIcon size={16} />
                    My Schedule
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}

        <div className="user-profile-section">
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
      </div>
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
            <Route
              path="/student"
              element={
                <RequireRole roles={['student']}>
                  <StudentView />
                </RequireRole>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  )
}
