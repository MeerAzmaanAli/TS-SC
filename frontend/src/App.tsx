import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, RequireRole, useAuth } from './lib/auth'
import AdminDashboard from './pages/AdminDashboard'
import EntitiesPage from './pages/admin/EntitiesPage'
import GeneratePage from './pages/admin/GeneratePage'
import InspectPage from './pages/admin/InspectPage'
import FacultyView from './pages/FacultyView'
import StudentView from './pages/StudentView'
import Login from './pages/Login'

function Nav() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
      {profile?.role === 'faculty' && <Link to="/faculty">Faculty</Link>}
      {profile?.role === 'student' && <Link to="/student">Student</Link>}
      {profile ? (
        <button onClick={handleSignOut} style={{ marginLeft: 'auto' }}>
          Sign out ({profile.role})
        </button>
      ) : (
        <Link to="/login" style={{ marginLeft: 'auto' }}>
          Sign in
        </Link>
      )}
    </nav>
  )
}

function Home() {
  const { profile, loading } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!profile) return <p>Please sign in.</p>
  if (profile.role === 'admin') return <AdminDashboard />
  if (profile.role === 'faculty') return <FacultyView />
  return <StudentView />
}

export default function App() {
  return (
    <AuthProvider>
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <header>
          <h1>TS-SC — Smart Classroom &amp; Timetable Scheduler</h1>
          <Nav />
        </header>
        <main style={{ marginTop: 24 }}>
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
