import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { tryFinaliseRequest } from '../lib/substitution'
import {
  InboxIcon,
  CheckCircleIcon,
  XIcon,
  ClockIcon,
  UsersIcon,
  BookOpenIcon,
  AlertCircleIcon,
} from './Icons'

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
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    // My pending candidacies on still-open requests.
    const { data: cands, error: cErr } = await supabase
      .from('substitution_candidates')
      .select('id, request_id, priority, substitution_requests!inner(id, status, deadline)')
      .eq('faculty_id', facultyId)
      .eq('response', 'pending')
      .eq('substitution_requests.status', 'open')
    if (cErr) {
      setError(cErr.message)
      setLoading(false)
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
          'id, requester_id, timetable_entries(' +
            'section_id, course_id, time_slot_id, ' +
            'courses(code, name), sections(name), ' +
            'time_slots(day_of_week, period)' +
            ')',
        )
        .eq('id', c.request_id)
        .single()
      if (!req) continue

      const reqTyped = req as unknown as {
        requester_id: string
        timetable_entries: {
          courses: { code: string; name: string } | null
          sections: { name: string } | null
          time_slots: { day_of_week: number; period: number } | null
        } | null
      }

      const { data: fac } = await supabase
        .from('faculty')
        .select('name')
        .eq('id', reqTyped.requester_id)
        .single()

      const entry = reqTyped.timetable_entries

      out.push({
        candidate_id: c.id,
        request_id: c.request_id,
        priority: c.priority,
        deadline: c.substitution_requests.deadline,
        requester_name: (fac as { name: string } | null)?.name ?? 'Colleague',
        course_code: entry?.courses?.code ?? '—',
        course_name: entry?.courses?.name ?? '—',
        section_name: entry?.sections?.name ?? '—',
        day_of_week: entry?.time_slots?.day_of_week ?? 0,
        period: entry?.time_slots?.period ?? 0,
      })
    }

    setRows(out)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [facultyId])

  async function handleResponse(candId: string, requestId: string, accept: boolean) {
    setBusy(candId)
    setError(null)
    try {
      const response = accept ? 'accepted' : 'rejected'
      const { error: uErr } = await supabase
        .from('substitution_candidates')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', candId)
      if (uErr) throw uErr

      await tryFinaliseRequest(requestId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
        <p className="text-muted">Checking substitution requests inbox…</p>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="alert alert-danger">
          <AlertCircleIcon size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <div className="stat-icon emerald" style={{ margin: '0 auto 1rem', width: 52, height: 52 }}>
            <InboxIcon size={26} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--slate-800)' }}>
            Your Substitution Inbox is Clear
          </h3>
          <p className="text-muted" style={{ maxWidth: 440, margin: '0.4rem auto 0', fontSize: '0.875rem' }}>
            No colleagues have requested coverage for classes during your free periods. Any urgent peer substitution requests will appear here in real-time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {rows.map((r) => {
            const isDeadlinePassed = new Date(r.deadline) < new Date()
            return (
              <div key={r.candidate_id} className="card" style={{ borderLeft: '4px solid var(--primary-600)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span className="badge badge-primary">
                    Match Priority {r.priority}
                  </span>
                  <span className={`badge ${isDeadlinePassed ? 'badge-danger' : 'badge-warning'}`}>
                    <ClockIcon size={12} />
                    <span>
                      {isDeadlinePassed
                        ? 'Deadline Expired'
                        : `Respond by ${new Date(r.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                  </span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Request from:
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UsersIcon size={16} style={{ color: 'var(--primary-600)' }} />
                    <span>{r.requester_name}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--slate-50)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--slate-900)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <BookOpenIcon size={14} style={{ color: 'var(--primary-600)' }} />
                    <span>{r.course_code}</span> — {r.course_name}
                  </div>
                  <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.78rem' }}>
                    Section {r.section_name} · {DAYS[r.day_of_week]} Period {r.period}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button
                    disabled={busy === r.candidate_id || isDeadlinePassed}
                    onClick={() => handleResponse(r.candidate_id, r.request_id, true)}
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <CheckCircleIcon size={14} />
                    <span>{busy === r.candidate_id ? 'Accepting…' : 'Accept Session'}</span>
                  </button>

                  <button
                    disabled={busy === r.candidate_id || isDeadlinePassed}
                    onClick={() => handleResponse(r.candidate_id, r.request_id, false)}
                    className="btn btn-secondary btn-sm"
                  >
                    <XIcon size={14} />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
