import { Link, Route, Routes } from 'react-router-dom'
import AdminDashboard from './pages/AdminDashboard'
import FacultyView from './pages/FacultyView'
import StudentView from './pages/StudentView'

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <header>
        <h1>TS-SC — Smart Classroom &amp; Timetable Scheduler</h1>
        <nav style={{ display: 'flex', gap: 16 }}>
          <Link to="/admin">Admin</Link>
          <Link to="/faculty">Faculty</Link>
          <Link to="/student">Student</Link>
        </nav>
      </header>
      <main style={{ marginTop: 24 }}>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/faculty" element={<FacultyView />} />
          <Route path="/student" element={<StudentView />} />
          <Route
            path="/"
            element={<p>Select a role above. Auth + role routing lands in Phase 4.</p>}
          />
        </Routes>
      </main>
    </div>
  )
}
