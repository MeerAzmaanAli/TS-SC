import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminHeader from '../../components/AdminHeader'
import {
  CheckCircleIcon,
  AlertCircleIcon,
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
  const [facultyMap, setFacultyMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function load() {
    const [verRes, facRes] = await Promise.all([
      supabase
        .from('timetable_versions')
        .select('id, status, created_at, published_at, violations')
        .order('created_at', { ascending: false }),
      supabase.from('faculty').select('id, name, email').limit(50000),
    ])

    if (verRes.error) {
      setError(verRes.error.message)
    } else {
      const list = (verRes.data ?? []) as Version[]
      setVersions(list)
      setSelected((prev) => {
        if (!prev) return list[0] ?? null
        return list.find((v) => v.id === prev.id) ?? list[0] ?? null
      })
    }

    if (facRes.data) {
      const fMap: Record<string, string> = {}
      for (const f of facRes.data) {
        fMap[f.id] = f.name
      }
      setFacultyMap(fMap)
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
          : 'Version has been reverted to draft status.'
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
    <div className="admin-cal-wrapper">
      <AdminHeader />

      {error && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 13,
            color: '#991B1B',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 8,
            fontSize: 13,
            color: '#065F46',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircleIcon size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="admin-cal-cols" style={{ marginTop: 4 }}>
        {/* Main Column: Details & Quality Metrics */}
        <div className="admin-cal-stack">
          {selected ? (
            <>
              {/* Selected Version Audit Banner */}
              <section className="admin-panel no-print">
                <div className="admin-panel-hd">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h2>
                        {selected.status === 'published' ? 'Official Published Timetable' : 'Draft Schedule'}{' '}
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#78716C' }}>
                          ({new Date(selected.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })})
                        </span>
                      </h2>
                      <span
                        className={`admin-tag ${
                          selected.status === 'published'
                            ? 'assigned'
                            : selected.status === 'draft'
                            ? 'open'
                            : ''
                        }`}
                      >
                        {selected.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="admin-mu admin-m" style={{ marginTop: 4 }}>
                      Generated {new Date(selected.created_at).toLocaleString()}
                      {selected.published_at && ` · Published ${new Date(selected.published_at).toLocaleDateString()}`}
                    </div>
                  </div>

                  <div>
                    {selected.status === 'draft' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(selected, 'published')}
                        className="admin-btn admin-btn-primary admin-btn-sm"
                      >
                        <CheckCircleIcon size={14} />
                        <span>{busy ? 'Publishing…' : 'Publish schedule'}</span>
                      </button>
                    )}

                    {selected.status === 'published' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(selected, 'draft')}
                        className="admin-btn admin-btn-outline admin-btn-sm"
                      >
                        <span>{busy ? 'Reverting…' : 'Revert to draft'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Conflict / Soft Quality Metrics */}
                <div className="admin-conflict-grid" style={{ marginTop: 14 }}>
                  <div className="admin-conflict-box">
                    <b>{String(v.total_gaps ?? '0')}</b>
                    <span>Total student gaps</span>
                  </div>
                  <div className="admin-conflict-box">
                    <b>{String(v.course_days_used ?? '—')}</b>
                    <span>Course-days spread</span>
                  </div>
                  <div className="admin-conflict-box">
                    <b>{String(v.max_faculty_load ?? '—')}</b>
                    <span>Max faculty load</span>
                  </div>
                  <div className="admin-conflict-box">
                    <b>{String(v.sessions_scheduled ?? '—')}</b>
                    <span>Sessions assigned</span>
                  </div>
                </div>
              </section>

              {/* Faculty Load Distribution */}
              {Object.keys(facultyLoads).length > 0 && (
                <section className="admin-panel no-print">
                  <div className="admin-panel-hd">
                    <h2>Faculty Teaching Load Balance</h2>
                    <span className="admin-mu admin-m">Weekly periods</span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {Object.entries(facultyLoads).map(([id, load]) => (
                      <div
                        key={id}
                        style={{
                          padding: '8px 12px',
                          background: '#F5F5F0',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 0 0 1px #E7E5E4',
                        }}
                      >
                        <span className="admin-m" style={{ color: '#1C1917', fontWeight: 600 }}>
                          {facultyMap[id] || (id.length > 12 ? `Faculty #${id.slice(0, 6)}` : id)}
                        </span>
                        <span
                          className="admin-tag"
                          style={{
                            background: '#292524',
                            color: '#FFB900',
                            fontWeight: 600,
                          }}
                        >
                          {load} p/wk
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Timetable Grid for Version */}
              <section className="admin-panel">
                <div className="admin-panel-hd no-print">
                  <h2>Schedule Matrix ({selected.status.toUpperCase()} — {new Date(selected.created_at).toLocaleDateString()})</h2>
                </div>
                <TimetablePreview key={selected.id} versionId={selected.id} />
              </section>
            </>
          ) : (
            <section className="admin-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="admin-mu">Select a timetable version from the sidebar to inspect its schedule and conflict logs.</div>
            </section>
          )}
        </div>

        {/* Right Sidebar: Versions List */}
        <div className="admin-cal-stack no-print">
          <section className="admin-panel">
            <div className="admin-panel-hd">
              <h2>All Versions</h2>
              <span className="admin-mu admin-m">{versions.length} generated</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 680, overflowY: 'auto' }}>
              {versions.map((ver) => {
                const isSelected = ver.id === selected?.id
                return (
                  <div
                    key={ver.id}
                    onClick={() => setSelected(ver)}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: isSelected ? '#FFFBEB' : '#FAFAF9',
                      boxShadow: isSelected ? '0 0 0 2px #FFB900' : '0 0 0 1px #E7E5E4',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        className={`admin-tag ${
                          ver.status === 'published' ? 'assigned' : ver.status === 'draft' ? 'open' : ''
                        }`}
                      >
                        {ver.status.toUpperCase()}
                      </span>
                      <span className="admin-mu admin-m">
                        {new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <b style={{ display: 'block', marginTop: 6, fontSize: 13, color: '#1C1917' }}>
                      {ver.status === 'published' ? 'Official Published Timetable' : `Timetable Draft #${versions.length - versions.indexOf(ver)}`}
                    </b>

                    <div className="admin-mu" style={{ fontSize: 12, marginTop: 2 }}>
                      {new Date(ver.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                )
              })}

              {versions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#57534E', fontSize: 13 }}>
                  No timetable versions generated yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
