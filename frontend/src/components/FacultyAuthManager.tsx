import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  KeyIcon,
  CheckCircleIcon,
  RefreshIcon,
  UsersIcon,
  ShieldIcon,
  XIcon,
} from './Icons'

export interface FacultyAuthStatus {
  faculty_id: string
  name: string
  email: string
  department_name?: string
  has_auth: boolean
  last_sign_in_at: string | null
}

export default function FacultyAuthManager() {
  const [facultyList, setFacultyList] = useState<FacultyAuthStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyAuthStatus | null>(null)
  const [password, setPassword] = useState('')
  const [customEmail, setCustomEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setMsg(null)
    try {
      // 1. Fetch faculty list
      const { data: facRows, error: facErr } = await supabase
        .from('faculty')
        .select('id, name, email, department_id, departments(name)')
        .order('name', { ascending: true })

      if (facErr) throw facErr

      // 2. Fetch auth status from RPC if available, fallback to profiles query
      let statusMap = new Map<string, { has_auth: boolean; last_sign_in: string | null; auth_email?: string }>()
      const { data: rpcStatus, error: rpcErr } = await supabase.rpc('admin_get_faculty_auth_status')
      
      if (!rpcErr && Array.isArray(rpcStatus)) {
        for (const s of rpcStatus) {
          statusMap.set(s.faculty_id, {
            has_auth: Boolean(s.has_auth),
            last_sign_in: s.last_sign_in_at,
            auth_email: s.email,
          })
        }
      } else {
        // Fallback: check profiles table directly
        const { data: profiles } = await supabase
          .from('profiles')
          .select('faculty_id, user_id')
          .eq('role', 'faculty')
        
        if (profiles) {
          for (const p of profiles) {
            if (p.faculty_id) {
              statusMap.set(p.faculty_id, {
                has_auth: Boolean(p.user_id),
                last_sign_in: null,
              })
            }
          }
        }
      }

      const merged: FacultyAuthStatus[] = (facRows || []).map((f: any) => {
        const s = statusMap.get(f.id)
        return {
          faculty_id: f.id,
          name: f.name,
          email: s?.auth_email || f.email,
          department_name: f.departments?.name || 'General / Unassigned',
          has_auth: s ? s.has_auth : false,
          last_sign_in_at: s?.last_sign_in || null,
        }
      })

      setFacultyList(merged)
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load faculty auth list.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function openModal(f: FacultyAuthStatus) {
    setSelectedFaculty(f)
    setCustomEmail(f.email)
    // Suggest a clean default initial password, e.g. SVITS@2026 or similar
    const cleanPrefix = f.name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim().split(' ')[0]
    setPassword(`${cleanPrefix}@1234`)
    setMsg(null)
  }

  function closeModal() {
    setSelectedFaculty(null)
    setPassword('')
    setCustomEmail('')
    setSaving(false)
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFaculty) return
    if (!password || password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }

    setSaving(true)
    setMsg(null)

    try {
      const { error } = await supabase.rpc('admin_provision_faculty_user', {
        p_faculty_id: selectedFaculty.faculty_id,
        p_email: customEmail.trim().toLowerCase(),
        p_password: password,
      })

      if (error) throw error

      setMsg({
        type: 'success',
        text: `Authentication account for "${selectedFaculty.name}" successfully provisioned! Credentials: ${customEmail} / ${password}`,
      })
      closeModal()
      loadData()
    } catch (err: any) {
      setMsg({
        type: 'error',
        text:
          err.message ||
          'Failed to provision faculty user. Please make sure migration 0021 is applied in Supabase SQL editor.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function copyCredentials(f: FacultyAuthStatus) {
    const text = `Faculty Login Credentials:\nName: ${f.name}\nEmail: ${f.email}\nPortal URL: ${window.location.origin}/login`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(f.faculty_id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      // fallback
    }
  }

  const filtered = facultyList.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.email.toLowerCase().includes(search.toLowerCase()) ||
      (f.department_name && f.department_name.toLowerCase().includes(search.toLowerCase()))
  )

  const activeAuthCount = facultyList.filter((f) => f.has_auth).length

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.25rem' }}>
            <ShieldIcon size={22} style={{ color: 'var(--primary-600)' }} />
            Faculty User Authentication Manager
          </h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Provision and manage Supabase login accounts for faculty members. Verified accounts can log into the{' '}
            <strong>Faculty Academic Portal</strong> to report absences, respond to substitutions, and view schedules.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              fontSize: '0.825rem',
              background: '#F5F5F0',
              padding: '6px 12px',
              borderRadius: 6,
              fontWeight: 500,
              color: '#44403C',
            }}
          >
            Active Logins: <strong>{activeAuthCount}</strong> / {facultyList.length}
          </div>

          <input
            type="text"
            placeholder="Search faculty or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: '220px', minWidth: '160px', padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
          />

          <button
            onClick={loadData}
            className="btn btn-secondary btn-sm"
            disabled={loading}
            title="Refresh list"
          >
            <RefreshIcon size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: '0.875rem',
            background: msg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: msg.type === 'success' ? '#065F46' : '#991B1B',
            border: `1px solid ${msg.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          }}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2.5rem', textAlign: 'center' }} className="text-muted">
          Loading faculty authentication records…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center' }} className="text-muted">
          No faculty members found.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.6rem 0.75rem' }}>Faculty Member</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Login Email</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Department</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Auth Status</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Last Activity</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr
                  key={f.faculty_id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle' }}
                >
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <UsersIcon size={14} className="text-muted" />
                      {f.name}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span style={{ fontFamily: 'monospace', color: '#1C1917' }}>{f.email}</span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#57534E' }}>
                    {f.department_name}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    {f.has_auth ? (
                      <span
                        className="badge badge-success"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          fontSize: '0.75rem',
                        }}
                      >
                        <CheckCircleIcon size={12} /> Active Login
                      </span>
                    ) : (
                      <span
                        className="badge badge-neutral"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          fontSize: '0.75rem',
                          background: '#F5F5F0',
                          color: '#78716C',
                        }}
                      >
                        No Auth Account
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#78716C', fontSize: '0.8rem' }}>
                    {f.last_sign_in_at ? new Date(f.last_sign_in_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => openModal(f)}
                        className={`btn btn-sm ${f.has_auth ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                      >
                        <KeyIcon size={13} />
                        <span>{f.has_auth ? 'Reset Password' : 'Create Login'}</span>
                      </button>

                      {f.has_auth && (
                        <button
                          type="button"
                          onClick={() => copyCredentials(f)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                          title="Copy login details"
                        >
                          <CheckCircleIcon size={13} />
                          <span>{copiedId === f.faculty_id ? 'Copied!' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Provisioning Modal */}
      {selectedFaculty && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem' }}>
                <KeyIcon size={18} style={{ color: 'var(--primary-600)' }} />
                <span>
                  {selectedFaculty.has_auth ? 'Reset Faculty Auth Password' : 'Create Faculty Login Account'}
                </span>
              </h3>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#78716C' }}
              >
                <XIcon size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#78716C' }}>
              Setting credentials for <strong>{selectedFaculty.name}</strong> ({selectedFaculty.department_name}).
              The faculty member will use this email and password to log in at <code>/login</code>.
            </p>

            <form onSubmit={handleProvision}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#44403C' }}>
                  Faculty Login Email
                </label>
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  required
                  className="input"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#44403C' }}>
                    Password (min 6 characters)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const cleanPrefix = selectedFaculty.name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim().split(' ')[0]
                      const rand = Math.floor(1000 + Math.random() * 9000)
                      setPassword(`${cleanPrefix}@${rand}`)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-600)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    Generate Random
                  </button>
                </div>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#78716C', display: 'block', marginTop: 4 }}>
                  This password will be immediately active (no email confirmation needed).
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary btn-sm"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={saving}
                >
                  {saving ? 'Provisioning…' : selectedFaculty.has_auth ? 'Update Password' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
