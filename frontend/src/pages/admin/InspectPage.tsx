import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
  BookOpenIcon,
  AlertCircleIcon,
  LayersIcon,
} from '../../components/Icons'
import TimetablePreview from '../../components/TimetablePreview'

interface Version {
  id: string
  status: 'draft' | 'published' | 'archived'
  created_at: string
  published_at: string | null
  violations: Record<string, unknown>
}

export default function InspectPage() {
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState<Version | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('timetable_versions')
      .select('id, status, created_at, published_at, violations')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else {
      const list = (data ?? []) as Version[]
      setVersions(list)
      setSelected((prev) => {
        if (!prev) return list[0] ?? null
        return list.find((v) => v.id === prev.id) ?? list[0] ?? null
      })
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function setStatus(version: Version, status: 'published' | 'draft') {
    setBusy(true)
    setError(null)
    setSuccessMsg(null)
    try {
      if (status === 'published') {
        // Exactly one published version at a time (REQ-16).
        await supabase
          .from('timetable_versions')
          .update({ status: 'archived' })
          .eq('status', 'published')
      }
      const { error } = await supabase
        .from('timetable_versions')
        .update({
          status,
          published_at: status === 'published' ? new Date().toISOString() : null,
        })
        .eq('id', version.id)
      if (error) throw error
      setSuccessMsg(
        status === 'published'
          ? 'Version is now officially published! Faculty and students can now view their schedules.'
          : 'Version has been reverted to draft status.',
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const v = selected?.violations ?? {}
  const facultyLoads = (v.faculty_loads ?? {}) as Record<string, number>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <AlertTriangleIcon size={26} style={{ color: 'var(--amber-600)' }} />
            <span>Conflict Inspector &amp; Version Management</span>
          </h1>
          <p className="page-subtitle">
            Audit solver output metrics, inspect soft constraint gaps and faculty load balance, and publish official timetables.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertCircleIcon size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success">
          <CheckCircleIcon size={18} style={{ flexShrink: 0 }} />
          <div>{successMsg}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Versions Sidebar */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--slate-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--slate-900)' }}>
              Timetable Versions
            </h2>
            <span className="badge badge-neutral">{versions.length} versions</span>
          </div>

          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {versions.map((ver) => {
              const isSelected = ver.id === selected?.id
              return (
                <div
                  key={ver.id}
                  onClick={() => setSelected(ver)}
                  style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--primary-50)' : 'transparent',
                    borderLeft: isSelected ? '4px solid var(--primary-600)' : '4px solid transparent',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span
                      className={`badge ${
                        ver.status === 'published'
                          ? 'badge-success'
                          : ver.status === 'draft'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                    >
                      {ver.status.toUpperCase()}
                    </span>
                    <span className="text-muted font-mono" style={{ fontSize: '0.72rem' }}>
                      {new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-800)' }}>
                    {new Date(ver.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>

                  {ver.published_at && (
                    <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      Published: {new Date(ver.published_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )
            })}

            {versions.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }} className="text-muted">
                No versions generated yet.
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Version Details & Metrics */}
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Version Hero Header Card */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <span
                      className={`badge ${
                        selected.status === 'published'
                          ? 'badge-success'
                          : selected.status === 'draft'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                      style={{ fontSize: '0.8125rem', padding: '0.25rem 0.75rem' }}
                    >
                      {selected.status.toUpperCase()}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                      Generated on {new Date(selected.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--slate-900)' }}>
                    Quality &amp; Soft Constraint Audit
                  </h2>
                </div>

                <div className="flex gap-2">
                  {selected.status === 'draft' && (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(selected, 'published')}
                      className="btn btn-primary"
                    >
                      <CheckCircleIcon size={16} />
                      <span>{busy ? 'Publishing…' : 'Publish as Official Schedule'}</span>
                    </button>
                  )}

                  {selected.status === 'published' && (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(selected, 'draft')}
                      className="btn btn-secondary"
                    >
                      <span>{busy ? 'Unpublishing…' : 'Revert to Draft'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quality Metrics Grid */}
            <div className="grid-4">
              <div className="stat-card">
                <div className="stat-icon indigo">
                  <ClockIcon size={22} />
                </div>
                <div>
                  <div className="stat-value">{String(v.total_gaps ?? '0')}</div>
                  <div className="stat-label">Total Student Gaps</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon emerald">
                  <BookOpenIcon size={22} />
                </div>
                <div>
                  <div className="stat-value">{String(v.course_days_used ?? '—')}</div>
                  <div className="stat-label">Course-Days Used</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon amber">
                  <UsersIcon size={22} />
                </div>
                <div>
                  <div className="stat-value">{String(v.max_faculty_load ?? '—')}</div>
                  <div className="stat-label">Max Faculty Load</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon sky">
                  <LayersIcon size={22} />
                </div>
                <div>
                  <div className="stat-value">{String(v.sessions_scheduled ?? '—')}</div>
                  <div className="stat-label">Sessions Assigned</div>
                </div>
              </div>
            </div>

            {/* Faculty Loads Distribution */}
            {Object.keys(facultyLoads).length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <UsersIcon size={18} style={{ color: 'var(--primary-600)' }} />
                    <span>Faculty Teaching Load Distribution</span>
                  </h3>
                  <span className="badge badge-neutral">Weekly Periods</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  {Object.entries(facultyLoads).map(([id, load]) => (
                    <div
                      key={id}
                      style={{
                        padding: '0.75rem 1rem',
                        background: 'var(--slate-50)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span className="font-mono text-sm" style={{ fontWeight: 600, color: 'var(--slate-700)' }}>
                        {id.length > 12 ? `${id.slice(0, 8)}…` : id}
                      </span>
                      <span className="badge badge-primary" style={{ fontWeight: 700 }}>
                        {load} periods/wk
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timetable Matrix Preview for Selected Version */}
            <TimetablePreview key={selected.id} versionId={selected.id} />
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p className="text-muted">Select a timetable version from the left panel to inspect.</p>
          </div>
        )}
      </div>
    </div>
  )
}
