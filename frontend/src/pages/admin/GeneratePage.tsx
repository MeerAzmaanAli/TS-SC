import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { buildSnapshot, SOLVER_URL } from '../../lib/timetable'

interface SolverEntry {
  section_id: string
  course_id: string
  faculty_id: string
  room_id: string
  time_slot_id: string
  is_elective: boolean
}

export default function GeneratePage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const snapshot = await buildSnapshot()
      const res = await fetch(`${SOLVER_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      })
      if (!res.ok) throw new Error(`Solver returned HTTP ${res.status}`)
      const data = await res.json()

      if (data.status === 'infeasible') {
        const causes = (data.causes as string[]).join(', ')
        setError(`Infeasible: ${data.message ?? ''} Causes: ${causes}`)
        return
      }
      if (data.status !== 'ok') throw new Error(data.message ?? 'Solver failed')

      const entries = data.entries as SolverEntry[]
      const { data: version, error: vErr } = await supabase
        .from('timetable_versions')
        .insert({
          institution_id: snapshot.institution_id,
          status: 'draft',
          violations: data.violations ?? {},
        })
        .select('id')
        .single()
      if (vErr) throw vErr

      const rows = entries.map((e) => ({ ...e, version_id: version.id as string }))
      const { error: eErr } = await supabase.from('timetable_entries').insert(rows)
      if (eErr) throw eErr

      setResult(
        `Draft created with ${entries.length} sessions. Review it in the Conflict Inspector before publishing.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Generate timetable</h2>
      <p>
        Snapshots current entities and constraints, sends them to the solver
        service, and stores the result as a new <em>draft</em> version.
      </p>
      <button onClick={handleGenerate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate timetable'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <p>
          {result} <Link to="/admin/versions">Open Conflict Inspector →</Link>
        </p>
      )}
    </section>
  )
}
