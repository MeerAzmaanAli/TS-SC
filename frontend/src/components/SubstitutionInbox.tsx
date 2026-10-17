import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { tryFinaliseRequest } from '../lib/substitution'

interface InboxRow {
  candidate_id: string
  request_id: string
  priority: number
  deadline: string
  requester_name: string
  course_code: string
  course_name: string
  section_name: string
  day_of_week: number
  period: number
}

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SubstitutionInbox({ facultyId }: { facultyId: string }) {
  const [rows, setRows] = useState<InboxRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    // My pending candidacies on still-open requests.
    const { data: cands, error: cErr } = await supabase
      .from('substitution_candidates')
      .select('id, request_id, priority, substitution_requests!inner(id, status, deadline)')
      .eq('faculty_id', facultyId)
      .eq('response', 'pending')
      .eq('substitution_requests.status', 'open')
    if (cErr) {
      setError(cErr.message)
      return
    }
    const list = ((cands ?? []) as unknown as {
      id: string
      request_id: string
      priority: number
      substitution_requests: { deadline: string }
    }[])

    // Finalise any overdue requests I can see (marks unfilled + penalties).
    for (const c of list) {
      if (new Date(c.substitution_requests.deadline) < new Date()) {
        try {
          await tryFinaliseRequest(c.request_id)
        } catch {
          /* non-fatal */
        }
      }
    }

    // Enrich with session details.
    const out: InboxRow[] = []
    for (const c of list) {
      const { data: req } = await supabase
        .from('substitution_requests')
        .select(
          'deadline, faculty!substitution_requests_requester_faculty_id_fkey(name), ' +
            'timetable_entries!inner(courses(code, name), sections(name), time_slots(day_of_week, period))',
        )
        .eq('id', c.request_id)
        .single()
      if (!req) continue
      const r = req as unknown as {
        deadline: string
        faculty: { name: string } | null
        timetable_entries: {
          courses: { code: string; name: string } | null
          sections: { name: string } | null
          time_slots: { day_of_week: number; period: number } | null
        }
      }
      out.push({
        candidate_id: c.id,
        request_id: c.request_id,
        priority: c.priority,
        deadline: r.deadline,
        requester_name: r.faculty?.name ?? 'Unknown',
        course_code: r.timetable_entries?.courses?.code ?? '',
        course_name: r.timetable_entries?.courses?.name ?? '',
        section_name: r.timetable_entries?.sections?.name ?? '',
        day_of_week: r.timetable_entries?.time_slots?.day_of_week ?? 0,
        period: r.timetable_entries?.time_slots?.period ?? 0,
      })
    }
    setRows(out)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId])

  async function respond(candidateId: string, requestId: string, response: 'accepted' | 'rejected') {
    setBusy(candidateId)
    setError(null)
    try {
      const { error } = await supabase
        .from('substitution_candidates')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', candidateId)
      if (error) throw error
      await tryFinaliseRequest(requestId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) return <p>No pending substitution requests.</p>

  return (
    <div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.candidate_id} style={{ marginBottom: 12 }}>
            <strong>
              {r.course_code} — {r.course_name}
            </strong>{' '}
            ({r.section_name}, {DAYS[r.day_of_week]} P{r.period}) — requested by {r.requester_name}{' '}
            <span style={{ color: '#666' }}>
              [P{r.priority}] · deadline {new Date(r.deadline).toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button disabled={busy === r.candidate_id} onClick={() => respond(r.candidate_id, r.request_id, 'accepted')}>
                Accept
              </button>
              <button disabled={busy === r.candidate_id} onClick={() => respond(r.candidate_id, r.request_id, 'rejected')}>
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
