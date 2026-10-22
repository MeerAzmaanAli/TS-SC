import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  UsersIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  ClockIcon,
} from '../../components/Icons'

interface Penalty {
  id: string
  created_at: string
  reason: string
  faculty_name: string
  course_code: string
}

export default function PenaltiesPage() {
  const [rows, setRows] = useState<Penalty[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('substitution_penalties')
      .select(
        'id, created_at, reason, faculty!inner(name), ' +
          'substitution_requests(timetable_entries(courses(code)))',
      )
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          setError(error.message)
          return
        }
        setRows(
          ((data ?? []) as unknown as {
            id: string
            created_at: string
            reason: string
            faculty: { name: string }
            substitution_requests: {
              timetable_entries: { courses: { code: string } | null }
            } | null
          }[]).map((p) => ({
            id: p.id,
            created_at: p.created_at,
            reason: p.reason,
            faculty_name: p.faculty.name,
            course_code: p.substitution_requests?.timetable_entries?.courses?.code ?? '—',
          })),
        )
      })
  }, [])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.faculty_name] = (acc[r.faculty_name] ?? 0) + 1
    return acc
  }, {})

  const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UsersIcon size={26} style={{ color: 'var(--rose-600)' }} />
            <span>Faculty Substitution Penalty Audit</span>
          </h1>
          <p className="page-subtitle">
            Departmental accountability tracking for unresponded substitution requests, repeated rejections, and deadline timeouts.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <strong>Error loading penalties:</strong> {error}
        </div>
      )}

      {/* Leaderboard Summary Cards */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '1rem' }}>
          Penalty Summary by Faculty Member
        </h2>

        {sortedCounts.length > 0 ? (
          <div className="grid-3">
            {sortedCounts.map(([name, count]) => (
              <div key={name} className="stat-card">
                <div className="stat-icon" style={{ background: count >= 3 ? 'var(--rose-50)' : 'var(--amber-50)', color: count >= 3 ? 'var(--rose-600)' : 'var(--amber-600)' }}>
                  <AlertTriangleIcon size={22} />
                </div>
                <div>
                  <div className="stat-value">{count}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--slate-800)' }}>
                    {name}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {count >= 3 ? 'Department Review Flagged' : 'Minor infractions'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="text-muted">
              {loading ? 'Analyzing penalty records…' : 'No penalties recorded yet. High faculty responsiveness!'}
            </p>
          </div>
        )}
      </div>

      {/* Detailed Penalty Audit Trail */}
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
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--slate-900)' }}>
            Recent Penalty Log ({rows.length})
          </h3>
          <span className="badge badge-neutral">Audit Trail</span>
        </div>

        <div className="table-responsive" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Faculty Member</th>
                <th>Course</th>
                <th>Infraction Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--slate-700)' }}>
                      <ClockIcon size={14} style={{ color: 'var(--slate-400)' }} />
                      <span className="font-mono text-sm">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--slate-900)' }}>{r.faculty_name}</span>
                  </td>
                  <td>
                    <span className="badge badge-primary">
                      <BookOpenIcon size={12} />
                      <span>{r.course_code}</span>
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-danger">{r.reason}</span>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3rem 1rem' }} className="text-muted">
                    No individual penalty incidents logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
