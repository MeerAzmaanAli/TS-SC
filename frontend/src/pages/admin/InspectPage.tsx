import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Version {
  id: string
  status: string
  created_at: string
  published_at: string | null
  violations: Record<string, unknown>
}

export default function InspectPage() {
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState<Version | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('timetable_versions')
      .select('id, status, created_at, published_at, violations')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else {
      setVersions((data ?? []) as Version[])
      setSelected((prev) => prev ?? ((data ?? []) as Version[])[0] ?? null)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function setStatus(version: Version, status: 'published' | 'draft') {
    setBusy(true)
    setError(null)
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
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const v = selected?.violations ?? {}

  return (
    <section>
      <h2>Conflict Inspector</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <h3>Versions</h3>
          <ul>
            {versions.map((ver) => (
              <li key={ver.id}>
                <button
                  onClick={() => setSelected(ver)}
                  style={{ fontWeight: ver.id === selected?.id ? 'bold' : 'normal' }}
                >
                  {new Date(ver.created_at).toLocaleString()} — {ver.status}
                </button>
              </li>
            ))}
            {versions.length === 0 && <li>No versions yet.</li>}
          </ul>
        </div>
        {selected && (
          <div>
            <h3>Draft review</h3>
            <dl>
              <dt>Total gaps</dt>
              <dd>{String(v.total_gaps ?? '—')}</dd>
              <dt>Course-days used</dt>
              <dd>{String(v.course_days_used ?? '—')}</dd>
              <dt>Max faculty load</dt>
              <dd>{String(v.max_faculty_load ?? '—')}</dd>
              <dt>Sessions scheduled</dt>
              <dd>{String(v.sessions_scheduled ?? '—')}</dd>
            </dl>
            {v.faculty_loads ? (
              <>
                <h4>Faculty loads</h4>
                <ul>
                  {Object.entries(v.faculty_loads as Record<string, number>).map(([id, load]) => (
                    <li key={id}>
                      {id}: {load}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {selected.status === 'draft' && (
                <button disabled={busy} onClick={() => setStatus(selected, 'published')}>
                  Publish
                </button>
              )}
              {selected.status === 'published' && (
                <button disabled={busy} onClick={() => setStatus(selected, 'draft')}>
                  Unpublish
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
