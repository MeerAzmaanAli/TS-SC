import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CalendarIcon, ShieldIcon, AlertCircleIcon } from '../components/Icons'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <CalendarIcon size={28} />
          </div>
          <h2 className="auth-title">TS-SC Portal</h2>
          <p className="auth-subtitle">
            Smart Classroom &amp; Timetable Scheduler
            <br />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
              SVVV Indore
            </span>
          </p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircleIcon size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Sign in failed</strong>
              <div style={{ marginTop: 2 }}>{error}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="input"
              placeholder="e.g. admin@svvv.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem' }}
            >
              {busy ? (
                <>
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <ShieldIcon size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
          <div className="text-muted" style={{ fontSize: '0.78rem', textAlign: 'center', lineHeight: 1.5 }}>
            <strong>Institutional Roles:</strong> Admin (Curriculum &amp; Solver), Faculty (Schedule &amp; Live Substitutions), Student (Section Grid).
          </div>
        </div>
      </div>
    </div>
  )
}
