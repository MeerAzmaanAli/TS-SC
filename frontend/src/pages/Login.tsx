import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  CalendarIcon,
  ShieldIcon,
  AlertCircleIcon,
  UsersIcon,
  KeyIcon,
  RefreshIcon,
} from '../components/Icons'

type LoginMode = 'student' | 'faculty' | 'admin'

const STORAGE_KEY = 'ts_sc_student_access'

export default function Login() {
  const [mode, setMode] = useState<LoginMode>('student')

  // Faculty & Admin Auth State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Student Passkey State
  const [sectionCode, setSectionCode] = useState('')
  const [passkey, setPasskey] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  // Handle Faculty or Admin Supabase Authentication
  async function handleUserAuth(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authErr) {
        setError(authErr.message)
        return
      }

      // Fetch user profile role to route accordingly
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .single()

      if (profile?.role === 'admin') {
        navigate('/admin')
      } else if (profile?.role === 'faculty') {
        navigate('/faculty')
      } else {
        navigate('/')
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setBusy(false)
    }
  }

  // Handle Direct Student Passkey Access
  async function handleStudentAccess(e: React.FormEvent) {
    e.preventDefault()
    if (!sectionCode.trim() || !passkey.trim()) {
      setError('Please provide both your Section Code and Passkey.')
      return
    }

    setError(null)
    setBusy(true)

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_section_timetable', {
        p_code: sectionCode.trim(),
        p_passkey: passkey.trim(),
      })

      if (rpcErr) {
        setError(rpcErr.message)
        return
      }

      if (!data || !data.success) {
        setError(data?.error || 'Invalid section code or passkey.')
        return
      }

      // Store verified credentials for the session
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code: sectionCode.trim().toUpperCase(), key: passkey.trim() }),
      )

      navigate('/student')
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate section credentials.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrapper" style={{ padding: '2rem 1rem' }}>
      <div className="auth-card" style={{ maxWidth: '440px', width: '100%', borderRadius: '16px' }}>
        {/* Portal Header */}
        <div className="auth-header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <div
            className="auth-logo"
            style={{
              width: 52,
              height: 52,
              borderRadius: '12px',
              background: mode === 'admin' ? '#292524' : '#FFB900',
              color: mode === 'admin' ? '#FFB900' : '#1C1917',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
            }}
          >
            {mode === 'admin' ? <ShieldIcon size={26} /> : <CalendarIcon size={26} />}
          </div>
          <h2 className="auth-title" style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.35rem' }}>
            {mode === 'admin' ? 'Institutional Console' : 'TS-SC Campus Portal'}
          </h2>
          <p className="auth-subtitle" style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-muted)' }}>
            {mode === 'admin'
              ? 'Authorized Administrator Authentication'
              : 'Class Timetable & Faculty Substitution Engine'}
          </p>
        </div>

        {/* Tab Switcher: Student vs Faculty (only shown when not in admin mode) */}
        {mode !== 'admin' && (
          <div
            style={{
              display: 'flex',
              background: '#F5F5F0',
              padding: '4px',
              borderRadius: '10px',
              marginBottom: '1.5rem',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('student')
                setError(null)
              }}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
                background: mode === 'student' ? '#ffffff' : 'transparent',
                color: mode === 'student' ? 'var(--primary-600)' : '#78716C',
                boxShadow: mode === 'student' ? '0 2px 4px rgba(28,25,23,0.06)' : 'none',
              }}
            >
              <KeyIcon size={15} />
              <span>Student Access</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('faculty')
                setError(null)
              }}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
                background: mode === 'faculty' ? '#ffffff' : 'transparent',
                color: mode === 'faculty' ? 'var(--primary-600)' : '#78716C',
                boxShadow: mode === 'faculty' ? '0 2px 4px rgba(28,25,23,0.06)' : 'none',
              }}
            >
              <UsersIcon size={15} />
              <span>Faculty Sign In</span>
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertCircleIcon size={18} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.85rem' }}>{error}</div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* FORM 1: STUDENT PASSKEY ACCESS             */}
        {/* ------------------------------------------ */}
        {mode === 'student' && (
          <form onSubmit={handleStudentAccess} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#44403C' }}>
                Section Code
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="e.g. BTCS27H, BTCS27A"
                value={sectionCode}
                onChange={(e) => setSectionCode(e.target.value.toUpperCase())}
                style={{ width: '100%', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}
                autoFocus
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                Assigned batch section code
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#44403C' }}>
                Section Passkey
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="e.g. H-9382"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                style={{ width: '100%', letterSpacing: '0.05em', fontWeight: 600 }}
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                Offline security passkey provided by Class Coordinator
              </span>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, justifyContent: 'center', marginTop: '0.25rem' }}
            >
              {busy ? (
                <>
                  <RefreshIcon size={16} className="spin" />
                  <span>Verifying Section…</span>
                </>
              ) : (
                <span>View Timetable &rarr;</span>
              )}
            </button>
          </form>
        )}

        {/* ------------------------------------------ */}
        {/* FORM 2: FACULTY SIGN IN                    */}
        {/* ------------------------------------------ */}
        {mode === 'faculty' && (
          <form onSubmit={handleUserAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#44403C' }}>
                Faculty Email Address
              </label>
              <input
                type="email"
                required
                className="input"
                placeholder="e.g. faculty@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#44403C' }}>
                Password
              </label>
              <input
                type="password"
                required
                className="input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, justifyContent: 'center', marginTop: '0.25rem' }}
            >
              {busy ? <span>Authenticating…</span> : <span>Sign In as Faculty</span>}
            </button>
          </form>
        )}

        {/* ------------------------------------------ */}
        {/* FORM 3: DISCREET ADMIN LOGIN               */}
        {/* ------------------------------------------ */}
        {mode === 'admin' && (
          <div>
            <div
              style={{
                background: '#FAFAF9',
                border: '1px solid #E7E5E4',
                borderRadius: '8px',
                padding: '0.6rem 0.85rem',
                fontSize: '0.78rem',
                color: '#57534E',
                marginBottom: '1rem',
                lineHeight: 1.4,
              }}
            >
              🔒 Restricted access for campus timetable administrators &amp; curriculum coordinators only.
            </div>

            <form onSubmit={handleUserAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Administrator ID / Email
                </label>
                <input
                  type="email"
                  required
                  className="input"
                  placeholder="admin-identifier"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Master Key / Password
                </label>
                <input
                  type="password"
                  required
                  className="input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600, justifyContent: 'center' }}
              >
                {busy ? <span>Authenticating…</span> : <span>Authorize Admin Access</span>}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMode('student')
                  setError(null)
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                &larr; Return to Campus Portal
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* MUTED FOOTER: DISCREET ADMIN LINK          */}
        {/* ------------------------------------------ */}
        {mode !== 'admin' && (
          <div
            style={{
              marginTop: '1.75rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-light, #F5F5F0)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: '#A8A29E' }}>
              Institutional staff?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('admin')
                  setError(null)
                  setEmail('')
                  setPassword('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '0.75rem',
                  color: '#78716C',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Administrative access
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
